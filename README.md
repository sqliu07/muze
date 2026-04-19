# Muze

Self-hosted local music player (FastAPI + React), with synchronized lyrics support and Docker packaging.

## Quick Start

```bash
git clone <your-new-repo-url> muze
cd muze
git submodule update --init --recursive
./start.sh
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

## Docker

```bash
docker build -t muze .
docker run -p 8000:8000 \
  -v /path/to/data:/app/data \
  -v /path/to/logs:/app/logs \
  -v /path/to/music:/music \
  muze
```

## Notes

- Lyrics source fallback: embedded -> `.lrc` -> LDDC -> lrclib -> netease.
- LDDC is included as a git submodule at `3rdparty/LDDC`.

## License

This repository is released under **GPL-3.0**. See [LICENSE](./LICENSE).
