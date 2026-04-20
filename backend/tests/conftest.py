import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.core.database import Base, get_db
from app.models import models  # noqa: F401 — 注册所有模型
from main import app


@pytest.fixture()
def tmp_dir():
    """创建临时目录，yield Path，结束后自动清理。"""
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


@pytest.fixture()
def db_session(tmp_dir: Path):
    """使用临时 SQLite 数据库创建 Session，测试结束后清理。"""
    db_path = tmp_dir / "test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def client(tmp_dir: Path):
    """使用临时 SQLite 的 TestClient，通过 dependency_overrides 替换 get_db。"""
    db_path = tmp_dir / "test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
