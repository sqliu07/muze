"""扫描服务测试 — TDD: 先写测试，再实现。"""
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.models.models import Track


def create_minimal_mp3(path: Path) -> Path:
    """创建最小合法 MP3 文件（多个 MPEG1 Layer3 帧）。"""
    # MPEG1 Layer3 frame header: sync word + 128kbps/44100Hz/stereo
    frame_header = b"\xFF\xFB\x90\x00"
    # 一帧 417 字节（128kbps/44100Hz）
    frame = frame_header + b"\x00" * (417 - 4)
    # mutagen 需要多帧才能识别
    path.write_bytes(frame * 10)
    return path


def add_basic_id3_tags(path: Path) -> None:
    from mutagen.id3 import ID3, TALB, TIT2, TPE1

    tags = ID3()
    tags.add(TIT2(encoding=3, text=["Tagged Song"]))
    tags.add(TPE1(encoding=3, text=["Tagged Artist"]))
    tags.add(TALB(encoding=3, text=["Tagged Album"]))
    tags.save(path)


def test_scan_file_creates_track(db_session: Session, tmp_dir: Path):
    """scan_file 应为 MP3 文件创建 Track 记录。"""
    from app.services.scanner import scan_file

    mp3_path = tmp_dir / "test.mp3"
    create_minimal_mp3(mp3_path)

    covers_dir = tmp_dir / "covers"
    covers_dir.mkdir()

    track = scan_file(str(mp3_path), db_session, str(covers_dir))

    assert track is not None, "scan_file 应返回 Track 对象"
    assert track.file_path == str(mp3_path)
    assert track.format == "mp3"
    assert track.id is not None

    # 数据库中确实存在该 Track
    db_track = db_session.query(Track).filter_by(file_path=str(mp3_path)).one()
    assert db_track.id == track.id


def test_scan_file_skips_unsupported(db_session: Session, tmp_dir: Path):
    """scan_file 对不支持的格式应返回 None。"""
    from app.services.scanner import scan_file

    txt_path = tmp_dir / "readme.txt"
    txt_path.write_text("not audio")

    covers_dir = tmp_dir / "covers"
    covers_dir.mkdir()

    result = scan_file(str(txt_path), db_session, str(covers_dir))
    assert result is None


def test_scan_file_idempotent(db_session: Session, tmp_dir: Path):
    """同一文件扫描两次，Track 只应有 1 条。"""
    from app.services.scanner import scan_file

    mp3_path = tmp_dir / "idem.mp3"
    create_minimal_mp3(mp3_path)

    covers_dir = tmp_dir / "covers"
    covers_dir.mkdir()

    scan_file(str(mp3_path), db_session, str(covers_dir))
    scan_file(str(mp3_path), db_session, str(covers_dir))

    count = db_session.query(Track).filter_by(file_path=str(mp3_path)).count()
    assert count == 1


def test_scan_file_does_not_fetch_lyrics_by_default(
    db_session: Session,
    tmp_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    """扫描应只导入本地元数据，默认不触发联网搜词。"""
    from app.services.scanner import scan_file
    import app.services.lyrics_service as lyrics_service

    calls = 0

    def record_call(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        return None

    monkeypatch.setattr(lyrics_service, "get_lyrics", record_call)

    mp3_path = tmp_dir / "offline.mp3"
    create_minimal_mp3(mp3_path)

    covers_dir = tmp_dir / "covers"
    covers_dir.mkdir()

    track = scan_file(str(mp3_path), db_session, str(covers_dir))

    assert track is not None
    assert calls == 0


def test_scan_file_does_not_fetch_cover_by_default(
    db_session: Session,
    tmp_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    """扫描默认不联网搜索封面。"""
    from app.services.scanner import scan_file
    import app.services.cover_service as cover_service

    calls = 0

    def record_call(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        return None

    monkeypatch.setattr(cover_service, "fetch_album_cover", record_call)

    mp3_path = tmp_dir / "offline-cover.mp3"
    create_minimal_mp3(mp3_path)

    covers_dir = tmp_dir / "covers"
    covers_dir.mkdir()

    track = scan_file(str(mp3_path), db_session, str(covers_dir))

    assert track is not None
    assert calls == 0


def test_scan_file_fetches_missing_cover_when_enabled(
    db_session: Session,
    tmp_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    """开启预取时，扫描会保存搜索到的专辑封面并写入元数据。"""
    from app.services.scanner import scan_file
    import app.services.cover_service as cover_service

    cover_bytes = (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00\x01\x00\x01"
        b"\x00\x00\xff\xd9"
    )

    def fake_fetch(*_args, **_kwargs):
        return cover_bytes

    monkeypatch.setenv("MUZE_FETCH_COVERS_DURING_SCAN", "1")
    monkeypatch.setattr(cover_service, "fetch_album_cover", fake_fetch)

    mp3_path = tmp_dir / "coverless.mp3"
    create_minimal_mp3(mp3_path)
    add_basic_id3_tags(mp3_path)

    covers_dir = tmp_dir / "covers"
    covers_dir.mkdir()

    track = scan_file(str(mp3_path), db_session, str(covers_dir))

    assert track is not None
    assert track.has_cover is True
    assert track.album is not None
    assert track.album.cover_path is not None
    assert (covers_dir / track.album.cover_path).read_bytes() == cover_bytes


def test_scan_directory(db_session: Session, tmp_dir: Path):
    """scan_directory 应递归扫描，added 等于音频文件数。"""
    from app.services.scanner import scan_directory

    # 创建 2 个 MP3 + 1 个 txt
    create_minimal_mp3(tmp_dir / "song1.mp3")
    create_minimal_mp3(tmp_dir / "song2.mp3")
    (tmp_dir / "notes.txt").write_text("hello")

    covers_dir = tmp_dir / "covers"
    covers_dir.mkdir()

    result = scan_directory(str(tmp_dir), db_session, str(covers_dir))

    assert result["added"] == 2
    assert db_session.query(Track).count() == 2


def test_to_simplified_text_normalizes_traditional_chinese():
    """繁体歌名应在扫描阶段自动转为简体。"""
    from app.services.scanner import _to_simplified_text

    assert _to_simplified_text("陳奕迅") == "陈奕迅"
    assert _to_simplified_text("  周杰倫  ") == "周杰伦"
