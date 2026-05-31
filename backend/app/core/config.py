import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
COVERS_DIR = DATA_DIR / "covers"
ARTIST_IMAGES_DIR = DATA_DIR / "artist_images"
DB_PATH = DATA_DIR / "muze.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"
LOGS_DIR = Path(os.getenv("LOGS_DIR", DATA_DIR / "logs"))

SUPPORTED_FORMATS = {".mp3", ".flac", ".wav", ".aiff", ".m4a", ".ogg"}


def ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    ARTIST_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)


def setup_logging():
    """配置日志：输出到控制台 + 持久化到 data/logs/muze.log。"""
    ensure_dirs()
    log_file = LOGS_DIR / "muze.log"

    root = logging.getLogger()
    if root.handlers:
        return

    root.setLevel(logging.DEBUG)

    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # 文件：DEBUG 及以上，按大小轮转，保留 5 个备份
    from logging.handlers import RotatingFileHandler

    file_handler = RotatingFileHandler(
        log_file, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)

    # 控制台：INFO 及以上
    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.INFO)
    stream_handler.setFormatter(fmt)
    root.addHandler(stream_handler)
