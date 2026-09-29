"""Internal application paths must never become music scan roots."""
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api import library
from app.models.models import WatchFolder
from app.schemas.schemas import BatchFolderAdd, FolderAdd, ScanRequest


@pytest.fixture
def layout(tmp_path, monkeypatch):
    for name in ("app", "data", "logs", "music", "classical", "application"):
        (tmp_path / name).mkdir()
    monkeypatch.setattr(library, "BASE_DIR", tmp_path / "app", raising=False)
    monkeypatch.setattr(library, "DATA_DIR", tmp_path / "data", raising=False)
    monkeypatch.setattr(library, "LOGS_DIR", tmp_path / "logs")
    return tmp_path


@pytest.mark.parametrize("name", ["app", "data", "logs", "."])
def test_rejects_internal_roots_and_ancestors(db_session, layout, name):
    with pytest.raises(HTTPException) as exc:
        library.add_watch_folder(FolderAdd(path=str(layout / name)), db_session)
    assert exc.value.status_code == 400
    assert db_session.query(WatchFolder).count() == 0


def test_rejects_symlink_to_internal_path(db_session, layout):
    alias = layout / "music" / "alias"
    alias.symlink_to(layout / "app", target_is_directory=True)
    with pytest.raises(HTTPException):
        library.add_watch_folder(FolderAdd(path=str(alias)), db_session)


@pytest.mark.parametrize("name", ["music", "classical", "application"])
def test_allows_music_roots_without_prefix_false_positives(db_session, layout, name):
    folder = library.add_watch_folder(FolderAdd(path=str(layout / name)), db_session)
    assert Path(folder.path) == layout / name


def test_batch_skips_internal_roots(db_session, layout):
    folders = library.add_watch_folders_batch(
        BatchFolderAdd(paths=[str(layout / "app"), str(layout / "music")]), db_session,
    )
    assert [folder.path for folder in folders] == [str(layout / "music")]


def test_legacy_unsafe_folder_cannot_be_scanned(db_session, layout, monkeypatch):
    db_session.add(WatchFolder(path=str(layout / "app")))
    db_session.commit()
    calls = []
    monkeypatch.setattr(library, "scan_directory", lambda *args: calls.append(args))
    with pytest.raises(HTTPException):
        library.scan_folder(ScanRequest(path=str(layout / "app")), db_session)
    assert not calls


def test_refresh_skips_legacy_unsafe_folder_without_mutating_it(db_session, layout, monkeypatch):
    folder = WatchFolder(path=str(layout / "app"))
    db_session.add(folder)
    db_session.commit()
    calls = []
    monkeypatch.setattr(library, "scan_directory", lambda *args: calls.append(args))
    assert library.refresh_all(db_session) == {"added": 0, "updated": 0, "errors": 1}
    assert not calls
    db_session.refresh(folder)
    assert folder.active and folder.last_scanned is None
