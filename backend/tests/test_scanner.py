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
