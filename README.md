# Muze

Muze 是一个自托管本地音乐播放器，采用 **FastAPI + React + TypeScript**，支持本地媒体库扫描、多维浏览、逐字歌词动效与 Docker 一键部署。

## 功能

**音乐库管理**
- 递归扫描本地音乐目录，自动识别专辑、歌手、封面
- 支持 FLAC / MP3 / AAC / OGG / WAV 等格式
- 文件监听：新增/删除文件自动同步

**浏览与播放**
- 多维浏览：歌曲、专辑、歌手、播放列表、收藏
- 播放控制：播放/暂停、上下曲、进度拖拽、音量调节
- 播放模式：列表循环、单曲循环、随机播放

**歌词**
- 多源搜词：内嵌歌词 → 同名 `.lrc` → LDDC → lrclib → 网易云
- 逐字同步：Apple Music 风格的高亮跟随与上浮动效
- 间奏点阵：句间/前奏自动显示呼吸动画点阵
- 联网搜词：支持 LDDC 候选选择、指定搜索、手动粘贴

**视觉体验**
- 四套主题：Light / Dark / Sepia / Nord、Rosé Pine
- 专辑取色：封面主色提取，动态渐变背景
- BassBlobs：音频驱动的有机色块动画（低频响应）

**其他**
- 歌词繁转简：扫描阶段自动 OpenCC 转换
- WebSocket 文件变更通知
- 全局快捷键：空格播放暂停、方向键快进快退

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | FastAPI、SQLAlchemy、Mutagen |
| 前端 | React 18、Vite、TypeScript、TanStack Query、Zustand |
| 动效 | Framer Motion、Canvas API、Web Audio API |
| 数据库 | SQLite |
| 歌词引擎 | LDDC（子模块）、lrclib、网易云 API |
| 容器 | Docker（单镜像，内置前端静态资源） |

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 20+
- git（含子模块支持）

### 1) 克隆

```bash
git clone <your-repo-url> muze
cd muze
git submodule update --init --recursive
```

### 2) 一键启动

```bash
./start.sh
```

访问：
- 前端：`http://localhost:5173`
- 后端：`http://localhost:8000`
- API 文档：`http://localhost:8000/docs`

### 3) 手动启动

后端：

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

前端（新终端）：

```bash
cd frontend
npm install
npm run dev
```

### 4) 导入音乐

启动后，在「媒体库管理」页面添加本地音乐文件夹并扫描。

## Docker 部署

### 从源码构建

```bash
docker build -t muze .
```

### 从 Release 导入

```bash
docker load -i muze-<版本>-<日期>-linux-amd64.tar.gz
```

### 运行

```bash
docker run -p 8000:8000 \
  -v /path/to/data:/app/data \
  -v /path/to/logs:/app/logs \
  -v /path/to/music:/music \
  muze
```

挂载说明：

| 容器路径 | 用途 |
|---------|------|
| `/app/data` | 数据库、封面缓存 |
| `/app/logs` | 应用日志 |
| `/music` | 音乐文件目录 |

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `8000` | 监听端口 |
| `DATA_DIR` | `/app/data` | 数据目录 |
| `LOGS_DIR` | `/app/logs` | 日志目录 |
| `LDDC_REPO_PATH` | `/app/3rdparty/LDDC` | LDDC 路径 |

## 歌词来源策略

1. 音频内嵌歌词（ID3 / Vorbis Comment）
2. 同目录同名 `.lrc` 文件
3. [LDDC](https://github.com/chenx6/LDDC)（逐字歌词优先）
4. [lrclib](https://lrclib.net/)
5. 网易云音乐（fallback）

LDDC 通过 git submodule 引入，位于 `3rdparty/LDDC`。运行时需确保该目录存在（克隆时加 `--recursive`）。

## CI/CD

推送 `v*` 或 `V*` 格式的 tag 会触发 `.github/workflows/release-image.yml`：
- 构建 Docker 镜像并推送至 GHCR
- 在 GitHub Release 发布可导入的 `tar.gz` 包

## 目录结构

```text
.
├── backend/                  # FastAPI 后端
│   └── app/
│       └── api/              # API 路由（tracks, albums, artists, lyrics...）
├── frontend/                 # React 前端
│   └── src/
│       ├── components/       # 组件（nowplaying, player, layout...）
│       ├── hooks/            # 自定义 Hook（useAudio, useLyricSync...）
│       └── pages/            # 页面
├── 3rdparty/LDDC/            # LDDC 子模块
├── .github/workflows/        # CI/CD
├── Dockerfile
└── start.sh
```

## 许可证

本项目采用 **GPL-3.0**，见 [LICENSE](./LICENSE)。

LDDC 以子模块方式引入，同样采用 GPL-3.0。分发包含 LDDC 的制品时请遵循相应许可证义务。
