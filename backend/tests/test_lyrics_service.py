"""歌词服务单元测试（不依赖网络）。"""
from pathlib import Path

from app.services import lyrics_service
from app.services.lyrics_service import LyricsResult, parse_lrc_from_file


def test_parse_lrc_from_nonexistent_file(tmp_path: Path):
    """不存在的 .lrc 路径应返回 None。"""
    result = parse_lrc_from_file(tmp_path / "nonexistent.lrc")
    assert result is None


def test_parse_lrc_from_existing_file(tmp_path: Path):
    """含时间戳的 .lrc 文件：synced=True 且内容包含歌词文本。"""
    lrc_path = tmp_path / "test.lrc"
    lrc_path.write_text(
        "[00:12.00]第一句歌词\n[00:17.50]第二句歌词\n", encoding="utf-8"
    )
    result = parse_lrc_from_file(lrc_path)
    assert result is not None
    assert result.synced is True
    assert "第一句歌词" in result.content
    assert "第二句歌词" in result.content
    assert result.source == "lrc"


def test_parse_plain_lrc(tmp_path: Path):
    """无时间戳的纯文本 lrc 文件：synced=False。"""
    lrc_path = tmp_path / "plain.lrc"
    lrc_path.write_text("这是一句纯文本歌词\n另一句\n", encoding="utf-8")
    result = parse_lrc_from_file(lrc_path)
    assert result is not None
    assert result.synced is False
    assert "纯文本歌词" in result.content


def test_search_online_lyrics_prefers_lddc_even_when_non_word(monkeypatch):
    """默认策略下，LDDC 非逐字命中也应优先于后续来源。"""
    monkeypatch.setattr(
        lyrics_service,
        "search_lddc_word_lyrics",
        lambda _title, _artist=None: LyricsResult(
            content="[00:01.00]第一句",
            source="lddc:ne",
            synced=True,
        ),
    )
    monkeypatch.setattr(
        lyrics_service,
        "search_lrclib",
        lambda _title, _artist=None: LyricsResult(
            content="[00:02.00]lrclib",
            source="lrclib",
            synced=True,
        ),
    )
    monkeypatch.setattr(lyrics_service, "search_netease", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(lyrics_service, "_LDDC_REQUIRE_WORD_LEVEL", False)

    result = lyrics_service.search_online_lyrics("测试歌", "测试歌手")
    assert result is not None
    assert result.source == "lddc:ne"


def test_search_online_lyrics_fallback_when_require_word_level(monkeypatch):
    """启用强制逐字时，LDDC 非逐字命中应回退到 lrclib。"""
    monkeypatch.setattr(
        lyrics_service,
        "search_lddc_word_lyrics",
        lambda _title, _artist=None: LyricsResult(
            content="[00:01.00]第一句",
            source="lddc:ne",
            synced=True,
        ),
    )
    monkeypatch.setattr(
        lyrics_service,
        "search_lrclib",
        lambda _title, _artist=None: LyricsResult(
            content="[00:02.00]lrclib",
            source="lrclib",
            synced=True,
        ),
    )
    monkeypatch.setattr(lyrics_service, "search_netease", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(lyrics_service, "_LDDC_REQUIRE_WORD_LEVEL", True)

    result = lyrics_service.search_online_lyrics("测试歌", "测试歌手")
    assert result is not None
    assert result.source == "lrclib"


def test_collect_lddc_results_continues_when_first_source_fails(monkeypatch, tmp_path: Path):
    """首个源初始化失败时，后续源仍应继续尝试并可返回结果。"""
    fake_repo = tmp_path / "LDDC"
    fake_repo.mkdir()

    class _FailAPI:
        def __init__(self):
            raise RuntimeError("init failed")

    class _Word:
        def __init__(self, start, end, text):
            self.start = start
            self.end = end
            self.text = text

    class _Line:
        def __init__(self):
            self.start = 0
            self.end = 500
            self.words = [_Word(0, 200, "发"), _Word(200, 500, "如雪")]

    class _Lyrics:
        def __init__(self):
            self.types = {"orig": None}
            self.source = None
            self.duration = 1000
            self.tags = {}

        def add_offset(self, offset=0):
            return {"orig": [_Line()]}

    class _OkAPI:
        def search(self, keyword, search_type, page=1):
            return [object()]

        def get_lyricslist(self, song):
            return [song]

        def get_lyrics(self, info):
            return _Lyrics()

    def _fake_import(name):
        if name == "PySide6.QtCore":
            raise ImportError("no pyside")
        if name == "LDDC.core.converter":
            class _Converter:
                @staticmethod
                def convert2(lyrics, langs, lyrics_format, offset):
                    return "[00:00.000]发[00:00.200]如雪"

            return _Converter
        if name == "LDDC.common.models":
            class _Models:
                class SearchType:
                    SONG = "song"

                class LyricsFormat:
                    VERBATIMLRC = "verbatim"

            return _Models
        if name == "LDDC.core.api.lyrics.ne":
            class _NE:
                NEAPI = _FailAPI

            return _NE
        if name == "LDDC.core.api.lyrics.qm":
            class _QM:
                QMAPI = _OkAPI

            return _QM
        raise ImportError(name)

    monkeypatch.setattr(lyrics_service.importlib, "import_module", _fake_import)
    monkeypatch.setattr(lyrics_service, "_LDDC_SOURCE_ORDER", "NE,QM")

    results = lyrics_service._collect_lddc_results_in_process(fake_repo, "发如雪 周杰伦", max_candidates=3)
    assert len(results) == 1
    assert results[0][1] == "lddc:qm"
