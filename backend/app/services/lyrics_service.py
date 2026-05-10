"""歌词获取服务。

优先级：内嵌歌词 → 同名 .lrc 文件 → LDDC → lrclib.net → 网易云音乐。
"""
from __future__ import annotations

import importlib
import logging
import os
import re
import sys
import types
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx
from mutagen import File as MutagenFile

logger = logging.getLogger(__name__)

_LRC_TIMESTAMP_RE = re.compile(r"\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]")
_WORD_TS_RE = re.compile(r"<\d{1,2}:\d{2}(?:\.\d{1,3})?>")
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_LDDC_REPO_PATH = _PROJECT_ROOT / "3rdparty" / "LDDC"
_FALLBACK_LDDC_REPO_PATH = Path("/tmp/LDDC")
_LDDC_SOURCE_ORDER = os.getenv("MUZE_LDDC_SOURCES", "NE,QM,KG")
_LDDC_REQUIRE_WORD_LEVEL = (
    os.getenv("MUZE_LDDC_REQUIRE_WORD_LEVEL", "0").strip().lower()
    in {"1", "true", "yes", "on"}
)


@dataclass
class LyricsResult:
    """歌词获取结果。"""

    content: str
    source: str  # "embedded" | "lrc" | "lrclib" | "netease"
    synced: bool


@dataclass
class LDDCCandidate:
    content: str
    source: str
    synced: bool
    song_title: str = ""
    song_artist: str = ""


_LIVE_RE = re.compile(r"(?i)\bLIVE\b|现场|演唱会|音乐会|live\s*版|现场版")


def _is_live(title: str) -> bool:
    """判断标题是否包含 LIVE / 现场 等标记。"""
    return bool(_LIVE_RE.search(title))


def _normalize(s: str) -> str:
    """小写 + 去除标点空格，用于模糊比较。"""
    return re.sub(r"[\s\-_·.,，。!！?？()（）\[\]【】「」『』\"']+", "", s).lower()


def _similarity(a: str, b: str) -> float:
    """简单字符级相似度（0~1），基于最长公共子串比例。"""
    if not a or not b:
        return 0.0
    na, nb = _normalize(a), _normalize(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    # 包含关系给高分
    if na in nb or nb in na:
        return 0.9
    # 用 difflib SequenceMatcher
    from difflib import SequenceMatcher
    return SequenceMatcher(None, na, nb).ratio()


def _score_candidate(
    song_title: str,
    song_artist: str,
    query_title: str,
    query_artist: Optional[str],
    source: str,
    content: str,
) -> float:
    """给候选歌词打分（0~100），越高越匹配。"""
    score = 0.0

    # 标题匹配 (0~50)
    title_sim = _similarity(song_title, query_title)
    score += title_sim * 50

    # 歌手匹配 (0~30)
    if query_artist and song_artist:
        artist_sim = _similarity(song_artist, query_artist)
        score += artist_sim * 30
    elif not query_artist:
        # 没有查询歌手时，这部分分值给标题
        score += title_sim * 15

    # 逐字歌词加分 (0~10)
    if has_word_level_timestamps(content):
        score += 10

    # LIVE 版扣分 (-30)
    if _is_live(song_title):
        score -= 30

    return max(0.0, score)


def has_word_level_timestamps(content: str) -> bool:
    """判断歌词是否包含逐字级时间戳（Enhanced LRC 常见的 <mm:ss.xxx>）。"""
    if _WORD_TS_RE.search(content):
        return True
    # LDDC 的逐字 LRC 可能采用 [..] 词边界时间戳，通常一行会出现多个时间标签
    for raw in content.splitlines():
        ts_count = len(_LRC_TIMESTAMP_RE.findall(raw))
        # 逐字行最少也可能只有两个词（两个时间戳），这里放宽到 >=2
        if ts_count >= 2:
            return True
    return False


def _resolve_lddc_repo_path() -> Path:
    env_path = os.getenv("LDDC_REPO_PATH")
    if env_path:
        return Path(env_path)
    if _DEFAULT_LDDC_REPO_PATH.exists():
        return _DEFAULT_LDDC_REPO_PATH
    return _FALLBACK_LDDC_REPO_PATH


def _install_pyside6_stub() -> None:
    """LDDC core import chain may touch Qt symbols; provide no-op stubs when PySide6 is unavailable."""
    try:
        importlib.import_module("PySide6.QtCore")
        return
    except Exception:
        pass

    qtcore = types.ModuleType("PySide6.QtCore")

    class _Dummy:
        def __init__(self, *args, **kwargs):
            pass

        def __call__(self, *args, **kwargs):
            return _Dummy()

        def __getattr__(self, _name):
            return _Dummy()

    class _QLoggingCategory(_Dummy):
        @staticmethod
        def setFilterRules(*_args, **_kwargs):
            return None

    qtcore.QLoggingCategory = _QLoggingCategory
    qtcore.QMessageLogContext = _Dummy
    qtcore.QtMsgType = _Dummy
    qtcore.QObject = _Dummy
    qtcore.Signal = _Dummy
    qtcore.Slot = lambda *args, **kwargs: (lambda f: f)
    qtcore.qInstallMessageHandler = lambda *args, **kwargs: None

    class _QCoreApplication:
        @staticmethod
        def translate(_ctx, text):
            return text

    qtcore.QCoreApplication = _QCoreApplication
    qtcore.__getattr__ = lambda _name: _Dummy

    qtwidgets = types.ModuleType("PySide6.QtWidgets")
    qtwidgets.QApplication = _Dummy
    qtwidgets.__getattr__ = lambda _name: _Dummy

    pyside6 = types.ModuleType("PySide6")
    sys.modules.setdefault("PySide6", pyside6)
    sys.modules["PySide6.QtCore"] = qtcore
    sys.modules["PySide6.QtWidgets"] = qtwidgets


def _safe_get_attr(obj: object, *names: str) -> str:
    """安全地从对象获取属性或字典键，返回第一个非空字符串值。"""
    for name in names:
        try:
            val = getattr(obj, name, None)
            if val is None and isinstance(obj, dict):
                val = obj.get(name)
            if val and isinstance(val, str):
                return val.strip()
        except Exception:
            continue
    return ""


def _extract_song_meta(song: object) -> tuple[str, str]:
    """从 LDDC song 对象中提取 (title, artist)。"""
    title = _safe_get_attr(song, "title", "name", "song_name", "track")
    artist = _safe_get_attr(song, "artist", "artist_name", "singer", "singers")
    return title, artist


def _collect_lddc_results_in_process(
    repo_path: Path,
    keyword: str,
    max_candidates: int = 8,
) -> list[tuple[str, str, str, str]]:
    """返回 (content, source, song_title, song_artist) 元组列表。"""
    inserted = False
    repo_path_str = str(repo_path)
    if repo_path_str not in sys.path:
        sys.path.insert(0, repo_path_str)
        inserted = True

    collected: list[tuple[str, str, str, str]] = []
    seen: set[str] = set()

    try:
        _install_pyside6_stub()
        converter = importlib.import_module("LDDC.core.converter")
        models = importlib.import_module("LDDC.common.models")

        source_specs = {
            "NE": ("LDDC.core.api.lyrics.ne", "NEAPI"),
            "QM": ("LDDC.core.api.lyrics.qm", "QMAPI"),
            "KG": ("LDDC.core.api.lyrics.kg", "KGAPI"),
            "LRCLIB": ("LDDC.core.api.lyrics.lrclib", "LrclibAPI"),
        }

        requested = [s.strip().upper() for s in _LDDC_SOURCE_ORDER.split(",") if s.strip()]
        if not requested:
            requested = ["NE", "QM", "KG"]

        for source_name in requested:
            spec = source_specs.get(source_name)
            if not spec:
                logger.debug("跳过未知 LDDC 源配置: %s", source_name)
                continue
            module_name, class_name = spec
            try:
                source_api = getattr(importlib.import_module(module_name), class_name)()
            except Exception:
                logger.debug("LDDC 源初始化失败: source=%s keyword=%s", source_name, keyword, exc_info=True)
                continue
            try:
                songs = list(source_api.search(keyword, models.SearchType.SONG, 1))[:3]
            except Exception:
                logger.debug("LDDC 搜索歌曲失败: source=%s keyword=%s", source_name, keyword, exc_info=True)
                continue

            for song in songs:
                st_title, st_artist = _extract_song_meta(song)
                try:
                    lyric_infos = list(source_api.get_lyricslist(song))[:3]
                except Exception:
                    lyric_infos = [song]

                for info in lyric_infos:
                    # info 对象可能也有自己的标题/歌手，优先用 song 级的
                    info_title, info_artist = _extract_song_meta(info)
                    final_title = info_title or st_title
                    final_artist = info_artist or st_artist
                    try:
                        lyrics = source_api.get_lyrics(info)
                        text = converter.convert2(
                            lyrics=lyrics,
                            langs=["orig"],
                            lyrics_format=models.LyricsFormat.VERBATIMLRC,
                            offset=0,
                        )
                    except Exception:
                        logger.debug("LDDC 转换歌词失败: source=%s keyword=%s", source_name, keyword, exc_info=True)
                        continue
                    if text and text.strip():
                        text_stripped = text.strip()
                        if text_stripped in seen:
                            continue
                        seen.add(text_stripped)
                        collected.append((text_stripped, f"lddc:{source_name.lower()}", final_title, final_artist))
                        if len(collected) >= max_candidates:
                            return collected
    finally:
        if inserted:
            sys.path.remove(repo_path_str)

    return collected


def search_lddc_word_lyrics(title: str, artist: Optional[str] = None) -> Optional[LyricsResult]:
    """尝试通过本地 LDDC 仓库检索逐字歌词，按匹配度排序取最佳。"""
    repo_path = _resolve_lddc_repo_path()
    if not repo_path.exists():
        logger.debug("LDDC 仓库不存在，跳过: %s", repo_path)
        return None

    keyword = f"{title} {artist or ''}".strip()
    try:
        results = _collect_lddc_results_in_process(repo_path, keyword, max_candidates=8)
    except Exception:
        logger.exception("LDDC 搜索执行失败")
        return None

    if not results:
        return None

    # 按评分排序，取最高分
    scored = []
    for content, source, st_title, st_artist in results:
        score = _score_candidate(st_title, st_artist, title, artist, source, content)
        scored.append((score, content, source))
    scored.sort(key=lambda x: x[0], reverse=True)

    best_score, best_content, best_source = scored[0]
    logger.info(
        "LDDC 最佳匹配: %s - %s (score=%.1f, source=%s)",
        title, artist, best_score, best_source,
    )
    return LyricsResult(content=best_content, source=best_source, synced=True)


def search_lddc_candidates(
    title: str,
    artist: Optional[str] = None,
    limit: int = 8,
) -> list[LDDCCandidate]:
    repo_path = _resolve_lddc_repo_path()
    if not repo_path.exists():
        logger.debug("LDDC 仓库不存在，无法返回候选: %s", repo_path)
        return []

    keyword = f"{title} {artist or ''}".strip()
    try:
        raw_results = _collect_lddc_results_in_process(repo_path, keyword, max_candidates=limit * 2)
    except Exception:
        logger.exception("LDDC 候选搜索执行失败")
        return []

    # 评分排序
    scored: list[tuple[float, str, str, str, str]] = []
    for content, source, st_title, st_artist in raw_results:
        score = _score_candidate(st_title, st_artist, title, artist, source, content)
        scored.append((score, content, source, st_title, st_artist))
    scored.sort(key=lambda x: x[0], reverse=True)

    candidates = [
        LDDCCandidate(
            content=content,
            source=source,
            synced=True,
            song_title=st_title,
            song_artist=st_artist,
        )
        for score, content, source, st_title, st_artist in scored[:limit]
    ]
    logger.info("LDDC 候选搜索完成: %s - %s, 命中 %d 条（已排序）", title, artist, len(candidates))
    return candidates


# ── 本地文件解析 ────────────────────────────────────────────────────────────────


def parse_lrc_from_file(lrc_path: Path) -> Optional[LyricsResult]:
    """读取 .lrc 文件，判断是否有时间戳，返回 LyricsResult 或 None。"""
    try:
        text = lrc_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None

    if not text.strip():
        return None

    synced = bool(_LRC_TIMESTAMP_RE.search(text))
    return LyricsResult(content=text.strip(), source="lrc", synced=synced)


# ── 内嵌歌词提取 ────────────────────────────────────────────────────────────────


def _extract_embedded_lyrics(audio_path: str) -> Optional[LyricsResult]:
    """从音频文件提取内嵌歌词（ID3 USLT / FLAC LYRICS 等）。"""
    try:
        audio = MutagenFile(audio_path)
    except Exception:
        return None

    if audio is None:
        return None

    # ID3 USLT (MP3)
    if hasattr(audio, "tags") and audio.tags:
        for tag in audio.tags.values():
            if hasattr(tag, "FrameID") and tag.FrameID == "USLT":
                text = str(tag.text) if hasattr(tag, "text") else str(tag)
                if text.strip():
                    synced = bool(_LRC_TIMESTAMP_RE.search(text))
                    return LyricsResult(content=text.strip(), source="embedded", synced=synced)

    # FLAC / Vorbis — 通过 "LYRICS" 或 "unsyncedlyrics" 标签
    for key in ("lyrics", "unsyncedlyrics", "LYRICS", "UNSYNCEDLYRICS"):
        val = audio.get(key)
        if val:
            text = val[0] if isinstance(val, list) else str(val)
            if text.strip():
                synced = bool(_LRC_TIMESTAMP_RE.search(text))
                return LyricsResult(content=text.strip(), source="embedded", synced=synced)

    # MP4 / M4A — 无标准歌词标签，跳过
    return None


# ── lrclib.net ─────────────────────────────────────────────────────────────────

_LRCLIB_API = "https://lrclib.net/api/search"
_LRCLIB_GET = "https://lrclib.net/api/get"


def search_lrclib(title: str, artist: Optional[str] = None) -> Optional[LyricsResult]:
    """调用 lrclib.net API 搜索歌词。"""
    try:
        headers = {"User-Agent": "Muze/0.1.0"}
        # 先尝试精确搜索
        params: dict = {"track_name": title}
        if artist:
            params["artist_name"] = artist

        resp = httpx.get(_LRCLIB_API, params=params, headers=headers, timeout=10)
        if resp.status_code != 200:
            return None

        results = resp.json()
        if not results:
            return None

        item = results[0]

        # 优先同步歌词
        synced_text = item.get("syncedLyrics")
        if synced_text:
            return LyricsResult(content=synced_text, source="lrclib", synced=True)

        plain_text = item.get("plainLyrics")
        if plain_text:
            return LyricsResult(content=plain_text, source="lrclib", synced=False)

    except Exception:
        logger.exception("lrclib 搜索失败: %s - %s", title, artist)

    return None


# ── 网易云音乐 ──────────────────────────────────────────────────────────────────

_NETEASE_SEARCH = "http://music.163.com/api/search/get/web"
_NETEASE_LYRIC = "http://music.163.com/api/song/lyric"


def search_netease(title: str, artist: Optional[str] = None) -> Optional[LyricsResult]:
    """调用网易云音乐 API 搜索歌词。"""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0",
            "Referer": "http://music.163.com",
        }

        # 搜索歌曲
        keyword = f"{title} {artist}" if artist else title
        resp = httpx.post(
            _NETEASE_SEARCH,
            data={"s": keyword, "type": 1, "limit": 1},
            headers=headers,
            timeout=10,
        )
        if resp.status_code != 200:
            return None

        data = resp.json()
        songs = data.get("result", {}).get("songs", [])
        if not songs:
            return None

        song_id = songs[0]["id"]

        # 获取歌词
        resp = httpx.get(
            _NETEASE_LYRIC,
            params={"id": song_id, "lv": 1},
            headers=headers,
            timeout=10,
        )
        if resp.status_code != 200:
            return None

        lrc_data = resp.json()
        lrc_obj = lrc_data.get("lrc", {})
        lyric_text = lrc_obj.get("lyric", "")
        if not lyric_text.strip():
            return None

        synced = bool(_LRC_TIMESTAMP_RE.search(lyric_text))
        return LyricsResult(content=lyric_text.strip(), source="netease", synced=synced)

    except Exception:
        logger.exception("网易云搜索失败: %s - %s", title, artist)

    return None


# ── 主入口 ──────────────────────────────────────────────────────────────────────


def get_lyrics(
    audio_path: str, title: str, artist: Optional[str] = None
) -> Optional[LyricsResult]:
    """按优先级获取歌词：内嵌 → 同名 .lrc → lrclib → 网易云。"""
    # 1. 内嵌歌词
    result = _extract_embedded_lyrics(audio_path)
    if result:
        return result

    # 2. 同名 .lrc 文件（仅在音频路径存在时）
    if audio_path:
        try:
            lrc_path = Path(audio_path).with_suffix(".lrc")
        except ValueError:
            lrc_path = None
        if lrc_path is not None:
            result = parse_lrc_from_file(lrc_path)
            if result:
                return result

    return search_online_lyrics(title, artist)


def search_online_lyrics(
    title: str, artist: Optional[str] = None
) -> Optional[LyricsResult]:
    """仅进行歌词源搜索：LDDC → lrclib → 网易云。"""
    # 0. LDDC（逐字优先）
    result = search_lddc_word_lyrics(title, artist)
    if result:
        is_word_level = has_word_level_timestamps(result.content)
        if is_word_level:
            logger.info("LDDC 命中逐字歌词: %s - %s (%s)", title, artist, result.source)
            return result
        if _LDDC_REQUIRE_WORD_LEVEL:
            logger.info("LDDC 命中但非逐字，按配置回退: %s - %s (%s)", title, artist, result.source)
        else:
            logger.info("LDDC 命中非逐字歌词，按配置直接采用: %s - %s (%s)", title, artist, result.source)
            return result

    # 1. lrclib.net
    result = search_lrclib(title, artist)
    if result:
        return result

    # 2. 网易云音乐
    result = search_netease(title, artist)
    if result:
        return result

    return None
