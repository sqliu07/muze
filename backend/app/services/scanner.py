"""音频文件扫描服务。

使用 mutagen 解析元数据，将 Artist / Album / Track 写入数据库。
"""
from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Optional

from mutagen import File as MutagenFile
from sqlalchemy.orm import Session

from app.core.config import SUPPORTED_FORMATS
from app.models.models import Album, Artist, Track

logger = logging.getLogger(__name__)
_CJK_RE = re.compile(r"[\u4e00-\u9fff]+")
_NON_ALNUM_CJK_RE = re.compile(r"[^0-9a-z\u4e00-\u9fff]+")
_CJK_FULL_RE = re.compile(r"^[\u4e00-\u9fff]+$")
_TRAD_TO_SIMP = str.maketrans(
    {
        "陳": "陈", "張": "张", "劉": "刘", "謝": "谢", "吳": "吴", "黃": "黄",
        "楊": "杨", "許": "许", "趙": "赵", "鄭": "郑", "蘇": "苏", "葉": "叶",
        "鄧": "邓", "羅": "罗", "馬": "马", "何": "何", "國": "国", "華": "华",
        "樂": "乐", "東": "东", "雲": "云", "麗": "丽", "偉": "伟", "傑": "杰",
        "藝": "艺", "薛": "薛", "風": "风", "倫": "伦", "達": "达", "凱": "凯",
        "軒": "轩", "彥": "彦", "澤": "泽", "聰": "聪", "詩": "诗", "曉": "晓",
        "奐": "奂", "從": "从", "時": "时", "愛": "爱", "爾": "尔", "門": "门",
    }
)
_WRITEBACK_ARTIST_TAGS = (
    os.getenv("MUZE_WRITE_NORMALIZED_ARTIST_TAGS", "0").strip().lower()
    in {"1", "true", "yes", "on"}
)
_OPENCC_STATUS_LOGGED = False

try:
    from opencc import OpenCC

    _OPENCC_T2S = OpenCC("t2s")
except Exception:
    _OPENCC_T2S = None


def _get_tag(audio, key: str, default=None):
    """从 mutagen audio 对象安全取值。"""
    if audio is None:
        return default
    val = audio.get(key)
    if isinstance(val, list):
        return val[0] if val else default
    return val if val is not None else default


def _extract_cover(audio, track_path: str, covers_dir: str) -> Optional[str]:
    """提取封面到 covers_dir，返回封面文件名或 None。"""
    if audio is None:
        return None

    # 用父目录名作为封面文件名（专辑级封面）
    cover_name = Path(track_path).parent.name + ".jpg"
    dest = Path(covers_dir) / cover_name
    if dest.exists():
        return cover_name

    # ID3 (MP3)
    if hasattr(audio, "tags") and audio.tags:
        for tag in audio.tags.values():
            if hasattr(tag, "FrameID") and tag.FrameID == "APIC":
                dest.write_bytes(tag.data)
                return cover_name

    # FLAC
    if hasattr(audio, "pictures") and audio.pictures:
        dest.write_bytes(audio.pictures[0].data)
        return cover_name

    # MP4 / M4A
    if "covr" in audio:
        dest.write_bytes(audio["covr"][0])
        return cover_name

    return None


def _normalize_cjk(text: str) -> str:
    return "".join(_CJK_RE.findall(text.lower())).translate(_TRAD_TO_SIMP)


def _to_simplified_text(value: str) -> str:
    global _OPENCC_STATUS_LOGGED
    text = value.strip()
    if not text:
        return text

    if not _OPENCC_STATUS_LOGGED:
        if _OPENCC_T2S is None:
            logger.warning("OpenCC 未安装，当前仅使用内置繁简映射（覆盖范围有限）")
        else:
            logger.info("OpenCC t2s 已启用，繁体文本将自动转换为简体")
        _OPENCC_STATUS_LOGGED = True

    if _OPENCC_T2S is not None:
        try:
            text = _OPENCC_T2S.convert(text)
        except Exception:
            logger.debug("OpenCC 转换失败，回退内置映射", exc_info=True)

    return text.translate(_TRAD_TO_SIMP)


def _infer_disc_track_from_filename(path: Path) -> tuple[int | None, int | None]:
    stem = path.stem
    # common form: "1.02. xxx" or "1-02 xxx" => disc=1, track=2
    m = re.match(r"^\s*(\d{1,2})[._-](\d{1,2})\D", stem)
    if m:
        try:
            disc = int(m.group(1))
            track = int(m.group(2))
            disc = disc if 0 < disc < 100 else None
            track = track if 0 < track < 200 else None
            return disc, track
        except ValueError:
            return None, None

    # fallback: "02 - xxx" => track=2
    m = re.match(r"^\s*(\d{1,2})\D", stem)
    if not m:
        return None, None
    try:
        track = int(m.group(1))
        track = track if 0 < track < 200 else None
        return None, track
    except ValueError:
        return None, None


def _artist_keys(name: str) -> set[str]:
    lower = name.strip().lower()
    if not lower:
        return set()
    keys: set[str] = set()
    cjk = _normalize_cjk(lower)
    if cjk:
        keys.add(f"cjk:{cjk}")
    mix = _NON_ALNUM_CJK_RE.sub("", lower)
    if mix:
        keys.add(f"mix:{mix}")
    for alias in re.findall(r"[（(]([^()（）]+)[)）]", lower):
        alias_cjk = _normalize_cjk(alias)
        if alias_cjk:
            keys.add(f"cjk:{alias_cjk}")
    return keys


def _select_primary_artist(candidates: list[Artist]) -> Artist:
    def _sort_key(artist: Artist):
        name = artist.name.strip()
        pure_cjk = 0 if _CJK_FULL_RE.match(name) else 1
        has_cover = 0 if artist.cover_path else 1
        return (pure_cjk, has_cover, len(name), artist.id)

    return sorted(candidates, key=_sort_key)[0]


def _extract_artist_from_audio(audio) -> str | None:
    val = _get_tag(audio, "TPE1") or _get_tag(audio, "artist") or _get_tag(audio, "\xa9ART")
    if val is None:
        return None
    text = str(val).strip()
    return text or None


def _write_artist_tag(audio, suffix: str, artist_name: str) -> bool:
    try:
        if suffix in {".flac", ".ogg"}:
            audio["artist"] = [artist_name]
            audio.save()
            return True

        if suffix in {".m4a", ".mp4"}:
            audio["\xa9ART"] = [artist_name]
            audio.save()
            return True

        if suffix in {".mp3", ".wav", ".aiff"}:
            from mutagen.id3 import TPE1

            if getattr(audio, "tags", None) is None:
                try:
                    audio.add_tags()
                except Exception:
                    pass
            if getattr(audio, "tags", None) is None:
                return False
            audio.tags["TPE1"] = TPE1(encoding=3, text=[artist_name])
            audio.save()
            return True
    except Exception:
        logger.exception("写入 artist TAG 失败")
    return False


def _get_or_create_artist(db: Session, name: Optional[str]) -> Optional[Artist]:
    if not name:
        return None
    raw_name = str(name).strip()
    if not raw_name:
        return None
    artist = db.query(Artist).filter_by(name=raw_name).first()
    if not artist:
        target_keys = _artist_keys(raw_name)
        if target_keys:
            matched = []
            for cand in db.query(Artist).all():
                if _artist_keys(cand.name).intersection(target_keys):
                    matched.append(cand)
            if matched:
                artist = _select_primary_artist(matched)

    if not artist:
        artist = Artist(name=raw_name)
        db.add(artist)
        db.flush()
    return artist


def _merge_duplicate_artists(db: Session) -> dict[str, int]:
    artists = db.query(Artist).all()
    groups: dict[str, list[Artist]] = {}
    for artist in artists:
        keys = _artist_keys(artist.name)
        if not keys:
            key = f"id:{artist.id}"
        else:
            cjk_keys = sorted(k for k in keys if k.startswith("cjk:"))
            key = cjk_keys[0] if cjk_keys else sorted(keys)[0]
        groups.setdefault(key, []).append(artist)

    merged_artists = 0
    merged_albums = 0

    for group in groups.values():
        if len(group) <= 1:
            continue
        primary = _select_primary_artist(group)
        duplicates = [a for a in group if a.id != primary.id]

        for dup in duplicates:
            if not primary.cover_path and dup.cover_path:
                primary.cover_path = dup.cover_path

            dup_albums = db.query(Album).filter(Album.artist_id == dup.id).all()
            for album in dup_albums:
                same = (
                    db.query(Album)
                    .filter(Album.artist_id == primary.id, Album.title == album.title)
                    .first()
                )
                if same and same.id != album.id:
                    db.query(Track).filter(Track.album_id == album.id).update(
                        {"album_id": same.id}
                    )
                    if not same.cover_path and album.cover_path:
                        same.cover_path = album.cover_path
                    if same.year is None and album.year is not None:
                        same.year = album.year
                    if same.genre is None and album.genre is not None:
                        same.genre = album.genre
                    db.delete(album)
                    merged_albums += 1
                else:
                    album.artist_id = primary.id

            db.query(Track).filter(Track.artist_id == dup.id).update(
                {"artist_id": primary.id}
            )
            db.delete(dup)
            merged_artists += 1

    return {"merged_artists": merged_artists, "merged_albums": merged_albums}


def normalize_artist_entities(db: Session, write_tags: bool = False) -> dict[str, int]:
    """合并重复歌手；可选将规范化后的 artist 名写回音频 TAG。"""
    merged = _merge_duplicate_artists(db)
    tags_written = 0
    tags_pending = 0

    do_write = write_tags and _WRITEBACK_ARTIST_TAGS
    tracks = db.query(Track).filter(Track.file_missing == False).all()
    for track in tracks:
        if not track.artist or not track.artist.name:
            continue
        path = Path(track.file_path)
        if not path.exists():
            continue
        try:
            audio = MutagenFile(path)
        except Exception:
            logger.exception("读取音频文件失败: %s", path)
            continue
        if audio is None:
            continue

        tagged_artist = _extract_artist_from_audio(audio)
        if not tagged_artist:
            continue
        if tagged_artist.strip() == track.artist.name:
            continue
        if not _artist_keys(tagged_artist).intersection(_artist_keys(track.artist.name)):
            continue

        if do_write and _write_artist_tag(audio, path.suffix.lower(), track.artist.name):
            tags_written += 1
        else:
            tags_pending += 1

    db.commit()
    return {
        **merged,
        "tags_written": tags_written,
        "tags_pending": tags_pending,
        "write_enabled": 1 if _WRITEBACK_ARTIST_TAGS else 0,
    }


def _get_or_create_album(
    db: Session,
    title: Optional[str],
    artist: Optional[Artist],
    year: Optional[int],
    genre: Optional[str],
) -> Optional[Album]:
    if not title:
        return None
    artist_id = artist.id if artist else None
    album = db.query(Album).filter_by(title=title, artist_id=artist_id).first()
    if not album:
        album = Album(title=title, artist_id=artist_id, year=year, genre=genre)
        db.add(album)
        db.flush()
    return album


def scan_file(
    file_path: str, db: Session, covers_dir: str
) -> Optional[Track]:
    """扫描单个音频文件，返回 Track 或 None（不支持的格式 / 已存在）。"""
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix not in SUPPORTED_FORMATS:
        return None

    existing = db.query(Track).filter_by(file_path=str(path)).first()

    # 用 mutagen 解析
    try:
        audio = MutagenFile(path)
    except Exception:
        logger.exception("解析文件失败: %s", path)
        return None

    if audio is None:
        return None

    # 提取元数据
    title = _get_tag(audio, "TIT2") or _get_tag(audio, "title") or path.stem
    artist_name = _get_tag(audio, "TPE1") or _get_tag(audio, "artist")
    album_title = _get_tag(audio, "TALB") or _get_tag(audio, "album")
    year_val = _get_tag(audio, "TDRC") or _get_tag(audio, "date") or _get_tag(audio, "year")
    track_num = _get_tag(audio, "TRCK") or _get_tag(audio, "tracknumber")
    disc_num = _get_tag(audio, "TPOS") or _get_tag(audio, "discnumber")
    genre_val = _get_tag(audio, "TCON") or _get_tag(audio, "genre")

    # 年份 / 曲目号 / 光盘号 转 int
    def _to_int(v):
        if v is None:
            return None
        s = str(v).split("/")[0]
        try:
            return int(s)
        except (ValueError, TypeError):
            return None

    year_int = _to_int(year_val)
    track_int = _to_int(track_num)
    disc_int = _to_int(disc_num)
    inferred_disc, inferred_track = _infer_disc_track_from_filename(path)
    if track_int is None:
        track_int = inferred_track
    if disc_int is None:
        disc_int = inferred_disc

    # 时长 & 比特率
    duration = getattr(audio.info, "length", 0.0) or 0.0
    bitrate = getattr(audio.info, "bitrate", None)

    # 封面提取（专辑级）
    covers_path = Path(covers_dir)
    covers_path.mkdir(parents=True, exist_ok=True)
    cover_name = _extract_cover(audio, str(path), covers_path)

    # artist / album
    original_artist_text = str(artist_name).strip() if artist_name else None
    artist = _get_or_create_artist(db, str(artist_name) if artist_name else None)
    album_name = _to_simplified_text(str(album_title)) if album_title else None
    raw_title_text = str(title).strip()
    title_text = _to_simplified_text(raw_title_text)
    if raw_title_text != title_text:
        logger.info(
            "歌曲名繁转简: '%s' -> '%s' (%s)",
            raw_title_text,
            title_text,
            path,
        )
    genre_text = _to_simplified_text(str(genre_val)) if genre_val else None
    album = _get_or_create_album(
        db,
        album_name,
        artist,
        year_int,
        genre_text,
    )

    # 设置专辑封面
    if album and cover_name and not album.cover_path:
        album.cover_path = cover_name
    # 歌手头像默认复用其首个专辑封面，避免歌手无头像。
    if artist and cover_name and not artist.cover_path:
        artist.cover_path = cover_name
    if (
        _WRITEBACK_ARTIST_TAGS
        and original_artist_text
        and artist
        and artist.name
        and original_artist_text != artist.name
        and _artist_keys(original_artist_text).intersection(_artist_keys(artist.name))
    ):
        _write_artist_tag(audio, suffix, artist.name)

    if existing:
        existing.title = title_text
        existing.artist_id = artist.id if artist else None
        existing.album_id = album.id if album else None
        existing.duration = duration
        existing.bitrate = bitrate
        existing.format = suffix.lstrip(".")
        existing.track_number = track_int
        existing.disc_number = disc_int
        existing.year = year_int
        existing.genre = genre_text
        existing.has_cover = cover_name is not None
        existing.file_missing = False
        db.flush()
        return existing

    # 创建 Track
    track = Track(
        file_path=str(path),
        title=title_text,
        artist_id=artist.id if artist else None,
        album_id=album.id if album else None,
        duration=duration,
        bitrate=bitrate,
        format=suffix.lstrip("."),
        track_number=track_int,
        disc_number=disc_int,
        year=year_int,
        genre=genre_text,
        has_cover=cover_name is not None,
    )
    db.add(track)
    db.flush()
    return track


def scan_directory(
    directory: str, db: Session, covers_dir: str
) -> dict:
    """递归扫描目录中的音频文件，返回 {added, updated, errors}。"""
    logger.info("开始扫描目录: %s", directory)
    added = 0
    updated = 0
    errors = 0
    skipped = 0
    for path in Path(directory).rglob("*"):
        if not path.is_file():
            continue
        file_path_str = str(path)
        try:
            existing = db.query(Track).filter_by(file_path=file_path_str).first()
            result = scan_file(file_path_str, db, covers_dir)
            if result is not None:
                if existing:
                    updated += 1
                else:
                    added += 1
            else:
                skipped += 1
        except Exception:
            logger.exception("扫描文件出错: %s", path)
            errors += 1

    # 合并重复歌手实体（例如 Eason Chan陳奕迅 / 陈奕迅）。
    _merge_duplicate_artists(db)

    # 更新每个专辑的 total_tracks
    for album in db.query(Album).all():
        album.total_tracks = db.query(Track).filter_by(album_id=album.id).count()

    db.commit()
    logger.info(
        "扫描完成: %s — 新增 %d, 更新 %d, 跳过 %d, 错误 %d",
        directory, added, updated, skipped, errors,
    )
    return {"added": added, "updated": updated, "errors": errors}
