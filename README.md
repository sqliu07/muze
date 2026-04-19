# Muze

Muze 是一个自托管本地音乐播放器，采用 **FastAPI + React + TypeScript**，支持本地媒体库扫描、专辑/歌手浏览、播放列表、歌词展示与 Docker 部署。

## 功能概览

- 本地音乐库管理：递归扫描目录，写入 SQLite
- 多维浏览：全部歌曲、专辑、歌手、播放列表、收藏
- 播放控制：播放/暂停、上一首/下一首、进度拖拽、音量调节
- 歌词能力：内嵌歌词、同名 `.lrc`、LDDC、lrclib、网易云 fallback
- 歌词动效：Apple Music 风格的歌词跟随与高亮动画
- 歌词规范化：扫描阶段自动进行繁体到简体转换（优先 OpenCC）
- 前端体验：默认进入专辑页（`/albums`）

## 技术栈

- 后端：FastAPI、SQLAlchemy、Mutagen
- 前端：React、Vite、TypeScript、TanStack Query、Zustand
- 数据库：SQLite
- 容器：Docker（单容器，内置前端静态资源）
- 第三方歌词库：LDDC（`3rdparty/LDDC` 子模块）

## 目录结构

```text
.
├─ backend/                  # FastAPI 后端
├─ frontend/                 # React 前端
├─ 3rdparty/LDDC/            # LDDC 子模块
├─ .github/workflows/        # CI/CD
├─ Dockerfile
└─ start.sh
```

## 快速开始（本地开发）

### 1) 拉取代码

```bash
git clone <your-repo-url> muze
cd muze
git submodule update --init --recursive
```

### 2) 启动方式 A：一键启动

```bash
./start.sh
```

默认访问：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8000`

### 3) 启动方式 B：手动启动

后端：

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

前端（新终端）：

```bash
cd frontend
npm install
npm run dev
```

## Docker 部署

### 构建镜像

```bash
docker build -t muze .
```

### 运行容器

```bash
docker run -p 8000:8000 \
  -v /path/to/data:/app/data \
  -v /path/to/logs:/app/logs \
  -v /path/to/music:/music \
  muze
```

部署说明：

- `/app/data`：数据库、封面等数据目录
- `/app/logs`：后端日志目录（可单独映射）
- `/music`：宿主机音乐目录

## 日志与排障

后端日志默认写入 `LOGS_DIR/muze.log`：

- 容器默认 `LOGS_DIR=/app/logs`
- 非容器默认 `LOGS_DIR=<DATA_DIR>/logs`

与繁转简相关日志：

- 启动后首次转换会记录是否启用 OpenCC
- 当歌曲名发生繁转简时，会记录：原始标题、转换后标题、文件路径

## 歌词来源与策略

获取顺序如下：

1. 音频内嵌歌词
2. 同目录 `.lrc`
3. LDDC（逐字歌词优先）
4. lrclib
5. 网易云 fallback

说明：

- LDDC 通过 `git submodule` 引入，路径为 `3rdparty/LDDC`
- 运行时默认读取 `LDDC_REPO_PATH`（容器默认 `/app/3rdparty/LDDC`）

## CI/CD 与镜像发布

工作流：`.github/workflows/release-image.yml`

触发条件：

- 推送 tag：`v*` 或 `V*`

行为：

- 构建并推送 GHCR 镜像

## 许可证

本项目采用 **GPL-3.0**，见 [`LICENSE`](./LICENSE)。

第三方说明：

- LDDC 以子模块方式引入，许可证为 GPL-3.0
- 分发包含 LDDC 的制品时，请遵循相应许可证义务
