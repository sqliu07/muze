# Muze 三项改进实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复目录映射漏洞、改造封面背景动画为 Apple Music 风格、增强歌词搜索系统

**Architecture:** 三项独立改进按复杂度递增排列：(1) 后端 scan API 路径校验 (2) 前端背景层重构 + 交叉渐变 (3) 歌词模型扩展 + 后台守护进程 + 前端 UI 增强

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, React 19, TypeScript, Tailwind CSS, Framer Motion, Zustand, TanStack Query

---

## Task 1: 目录映射修复 — scan API 路径校验

**Files:**
- Modify: `backend/app/api/library.py:122-137`

- [ ] **Step 1: 为 scan_folder 添加 WatchFolder 路径校验**

在 `library.py` 的 `scan_folder` 函数中，在 `os.path.isdir` 检查之后、`scan_directory` 调用之前，插入路径白名单校验逻辑。查询 WatchFolder 表，检查传入路径是否与某个 active 的 WatchFolder 存在路径前缀关系（双向匹配）。

```python
# library.py 第 122-137 行，替换 scan_folder 函数
from sqlalchemy import or_

@router.post("/scan", response_model=ScanResult)
def scan_folder(body: ScanRequest, db: Session = Depends(get_db)):
    """扫描单个目录（必须已添加到媒体库）。"""
    if not os.path.isdir(body.path):
        raise HTTPException(status_code=400, detail="目录不存在")

    # 校验路径是否属于已添加的 WatchFolder
    normalized = os.path.realpath(body.path)
    folder = db.query(WatchFolder).filter(
        WatchFolder.active == True,
        or_(
            WatchFolder.path == normalized,
            (WatchFolder.path + "/").op("LIKE")(normalized + "/%"),
            (normalized + "/").op("LIKE")(WatchFolder.path + "/%"),
        ),
    ).first()
    if not folder:
        raise HTTPException(
            status_code=403,
            detail="请先将该目录添加到媒体库",
        )

    covers_dir = str(COVERS_DIR)
    result = scan_directory(body.path, db, covers_dir)

    # 更新 last_scanned
    folder.last_scanned = datetime.utcnow()
    db.commit()

    return result
```

- [ ] **Step 2: 运行现有测试确认不破坏已有功能**

```bash
cd /home/lsq/workspace/project/pythonProj/muze && python -m pytest backend/tests/test_library_api.py -v
```

预期：所有现有测试通过。

- [ ] **Step 3: 提交**

```bash
git add backend/app/api/library.py
git commit -m "fix: validate scan path against WatchFolder whitelist"
```

---

## Task 2: 封面背景动画改造 — 封面模糊层 + 交叉渐变

**Files:**
- Modify: `frontend/src/components/nowplaying/NowPlayingPage.tsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/tailwind.config.js`

- [ ] **Step 1: 更新光球动画参数（index.css）**

将 `index.css` 中三个光球动画的关键帧和持续时间替换为更大幅度、更短周期的版本。

```css
/* 替换 index.css 第 172-218 行 */
@keyframes nowplaying-orb-a {
  0% {
    transform: translate3d(0, 15%, 0) rotate(0deg);
  }
  50% {
    transform: translate3d(8%, -15%, 0) rotate(20deg);
  }
  100% {
    transform: translate3d(0, 15%, 0) rotate(40deg);
  }
}

@keyframes nowplaying-orb-b {
  0% {
    transform: translate3d(0, 12%, 0) rotate(0deg);
  }
  50% {
    transform: translate3d(-6%, -10%, 0) rotate(-18deg);
  }
  100% {
    transform: translate3d(0, 12%, 0) rotate(-36deg);
  }
}

@keyframes nowplaying-orb-c {
  0% {
    transform: translate3d(0, 18%, 0) rotate(0deg);
  }
  50% {
    transform: translate3d(5%, -12%, 0) rotate(15deg);
  }
  100% {
    transform: translate3d(0, 18%, 0) rotate(30deg);
  }
}

.nowplaying-orb-a {
  animation: nowplaying-orb-a 22s ease-in-out infinite;
}

.nowplaying-orb-b {
  animation: nowplaying-orb-b 28s ease-in-out infinite;
}

.nowplaying-orb-c {
  animation: nowplaying-orb-c 25s ease-in-out infinite;
}
```

- [ ] **Step 2: 更新 gradient-breathe 动画参数（tailwind.config.js）**

修改 `tailwind.config.js` 中 `gradient-breathe` 的动画时长，从 8s 改为 12s，使呼吸效果更柔和。

```js
// tailwind.config.js 第 66-76 行，替换 gradient-breathe
"gradient-breathe": {
  "0%, 100%": { opacity: 0.5, transform: "scale(1) translateX(0)" },
  "33%": { opacity: 0.7, transform: "scale(1.03) translateX(1%)" },
  "66%": { opacity: 0.6, transform: "scale(1.02) translateX(-0.5%)" },
},
// animation 部分
"gradient-breathe": "gradient-breathe 12s ease-in-out infinite",
```

- [ ] **Step 3: 重构 NowPlayingPage 背景层**

在 `NowPlayingPage.tsx` 中，替换现有的背景渲染部分（第 141-151 行颜色计算 + 第 330-390 行背景 JSX），改为 5 层结构：封面模糊层、深色遮罩、三色渐变层、光球层、UI 内容层。封面模糊层使用双层 crossfade 实现切歌平滑过渡。

在组件函数内，替换颜色计算和新增封面过渡状态：

```tsx
// 替换 NowPlayingPage.tsx 第 141-151 行
const coverUrl = currentTrack?.has_cover
  ? getTrackCoverUrl(currentTrack.id)
  : null
const colors = useColorThief(coverUrl)

// 封面交叉渐变状态
const [coverLayers, setCoverLayers] = useState<{
  current: string | null
  next: string | null
  showNext: boolean
}>({ current: null, next: null, showNext: false })

useEffect(() => {
  if (!coverUrl) {
    setCoverLayers({ current: null, next: null, showNext: false })
    return
  }
  if (coverLayers.current === null) {
    // 首次加载，直接设为 current
    setCoverLayers({ current: coverUrl, next: null, showNext: false })
    return
  }
  if (coverUrl === coverLayers.current) return
  // 切歌：新封面进入 next 层，预加载后触发渐变
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.onload = () => {
    setCoverLayers((prev) => ({ ...prev, next: coverUrl, showNext: true }))
    // 过渡完成后更新 current
    setTimeout(() => {
      setCoverLayers({ current: coverUrl, next: null, showNext: false })
    }, 1300) // 略大于 CSS transition 1.2s
  }
  img.src = coverUrl
}, [coverUrl])

const bg = `linear-gradient(135deg, rgb(${colors[0].join(",")}) 0%, rgb(${colors[1].join(",")}) 50%, rgb(${colors[2].join(",")}) 100%)`
const orbAColor = `rgba(${colors[0].join(",")}, 0.08)`
const orbBColor = `rgba(${colors[2].join(",")}, 0.1)`
const orbCColor = `rgba(${colors[1].join(",")}, 0.06)`
```

替换背景 JSX（第 330-390 行）：

```tsx
{/* L1: 封面模糊背景 — 双层交叉渐变 */}
<div className="pointer-events-none absolute inset-0 overflow-hidden">
  {coverLayers.current && (
    <img
      src={coverLayers.current}
      alt=""
      className="absolute inset-[-20%] h-[140%] w-[140%] object-cover"
      style={{
        filter: "blur(80px) saturate(1.5)",
        opacity: coverLayers.showNext ? 0 : 1,
        transition: "opacity 1.2s ease-in-out",
      }}
    />
  )}
  {coverLayers.next && (
    <img
      src={coverLayers.next}
      alt=""
      className="absolute inset-[-20%] h-[140%] w-[140%] object-cover"
      style={{
        filter: "blur(80px) saturate(1.5)",
        opacity: coverLayers.showNext ? 1 : 0,
        transition: "opacity 1.2s ease-in-out",
      }}
    />
  )}
  {/* 无封面时的纯色兜底 */}
  {!coverLayers.current && !coverLayers.next && (
    <div className="absolute inset-0" style={{ background: bg }} />
  )}
</div>

{/* L2: 深色遮罩 */}
<div
  className="pointer-events-none absolute inset-0"
  style={{ background: "rgba(0,0,0,0.35)" }}
/>

{/* L3: 三色渐变叠加 */}
<div
  className="pointer-events-none absolute inset-0"
  style={{ background: bg, opacity: 0.35 }}
/>

{/* L4: 光球点缀 */}
<div className="pointer-events-none absolute inset-0 overflow-hidden">
  <div
    className={`absolute left-[6vmin] top-[8vmin] ${prefersReducedMotion ? "" : "nowplaying-orb-a"}`}
    style={{
      width: "40vmin", height: "40vmin",
      backgroundColor: orbAColor, borderRadius: "50%",
      filter: "blur(60px)", opacity: 1,
      willChange: "transform, opacity",
    }}
  />
  <div
    className={`absolute right-[8vmin] top-[16vmin] ${prefersReducedMotion ? "" : "nowplaying-orb-b"}`}
    style={{
      width: "34vmin", height: "34vmin",
      backgroundColor: orbBColor, borderRadius: "50%",
      filter: "blur(60px)", opacity: 1,
      willChange: "transform, opacity",
    }}
  />
  <div
    className={`absolute left-[22vmin] bottom-[6vmin] ${prefersReducedMotion ? "" : "nowplaying-orb-c"}`}
    style={{
      width: "42vmin", height: "42vmin",
      backgroundColor: orbCColor, borderRadius: "50%",
      filter: "blur(60px)", opacity: 1,
      willChange: "transform, opacity",
    }}
  />
</div>

{/* L5: 底部渐变呼吸遮罩 */}
<div
  className={`pointer-events-none absolute bottom-0 left-0 right-0 h-[50%] ${
    prefersReducedMotion ? "" : "animate-gradient-breathe"
  }`}
  style={{
    background: `linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)`,
    willChange: "transform, opacity",
  }}
/>
```

删除第 148-151 行旧的 `darkBg`、`orbAColor`、`orbBColor`、`orbCColor` 计算（已内联到上方代码中）。

在根容器 `<motion.div>` 上删除 `style={{ background: bg }}`，因为背景现在由 L1-L4 层级处理。

- [ ] **Step 4: 启动前端开发服务器验证**

```bash
cd /home/lsq/workspace/project/pythonProj/muze/frontend && npm run dev
```

在浏览器中打开全屏播放页，检查：
1. 封面图是否作为模糊背景显示
2. 切歌时是否有平滑的交叉渐变过渡
3. 光球是否更柔和（低透明度、高模糊）
4. `prefers-reduced-motion` 下动画是否正确禁用

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/nowplaying/NowPlayingPage.tsx frontend/src/index.css frontend/tailwind.config.js
git commit -m "feat: Apple Music style cover-art blurred background with crossfade"
```

---

## Task 3: 歌词搜索改进 — 数据模型扩展

**Files:**
- Modify: `backend/app/models/models.py:81-95`
- Modify: `backend/app/schemas/schemas.py:113-123`

- [ ] **Step 1: Lyrics 模型新增 original_content 和 original_source 字段**

在 `models.py` 的 `Lyrics` 类中，在 `synced` 字段之后添加两个新字段。

```python
# models.py Lyrics 类，第 90 行之后添加
original_content: Mapped[Optional[str]] = mapped_column(Text, default=None)
original_source: Mapped[Optional[str]] = mapped_column(String(20), default=None)
```

- [ ] **Step 2: LyricsOut schema 新增对应字段**

在 `schemas.py` 的 `LyricsOut` 类中添加两个新字段。

```python
# schemas.py LyricsOut 类，第 119 行之后添加
original_content: Optional[str] = None
original_source: Optional[str] = None
```

- [ ] **Step 3: 重建数据库表（开发环境）**

```bash
cd /home/lsq/workspace/project/pythonProj/muze && rm -f data/muze.db && python -c "from app.core.database import Base, engine; from app.models import models; Base.metadata.create_all(bind=engine)"
```

预期：数据库重建成功，无报错。

- [ ] **Step 4: 提交**

```bash
git add backend/app/models/models.py backend/app/schemas/schemas.py
git commit -m "feat: add original_content/original_source to Lyrics model"
```

---

## Task 4: 歌词搜索改进 — scanner 入库时填充 original 字段

**Files:**
- Modify: `backend/app/services/scanner.py`

- [ ] **Step 1: 在 scan_file 中添加歌词入库逻辑**

在 `scanner.py` 的 `scan_file` 函数末尾（Track 创建/更新之后、return 之前），添加歌词自动获取和入库逻辑。首次入库时，如果歌词来源是 embedded 或 lrc，同时填充 original_content 和 original_source。

在 `scan_file` 函数的第 477 行 `db.add(track)` 和 `db.flush()` 之后、return 之前，添加：

```python
# scanner.py scan_file 函数，在 track 创建后添加
# 自动获取歌词并入库
try:
    from app.services.lyrics_service import get_lyrics
    from app.models.models import Lyrics

    artist_name = artist.name if artist else None
    lyrics_result = get_lyrics(str(path), title_text, artist_name)
    if lyrics_result:
        existing_lyrics = db.query(Lyrics).filter_by(track_id=track.id).first()
        if not existing_lyrics:
            new_lyrics = Lyrics(
                track_id=track.id,
                content=lyrics_result.content,
                source=lyrics_result.source,
                synced=lyrics_result.synced,
            )
            if lyrics_result.source in ("embedded", "lrc"):
                new_lyrics.original_content = lyrics_result.content
                new_lyrics.original_source = lyrics_result.source
            db.add(new_lyrics)
except Exception:
    logger.exception("获取歌词失败: %s", path)
```

对于 existing track 的更新路径（第 446-460 行），也需要检查是否已有歌词，如果没有则同样获取。

- [ ] **Step 2: 运行 scanner 测试**

```bash
cd /home/lsq/workspace/project/pythonProj/muze && python -m pytest backend/tests/test_scanner.py -v
```

预期：测试通过。

- [ ] **Step 3: 提交**

```bash
git add backend/app/services/scanner.py
git commit -m "feat: auto-fetch lyrics during scan with original backup"
```

---

## Task 5: 歌词搜索改进 — _save_lyrics 改造

**Files:**
- Modify: `backend/app/api/lyrics.py:24-43`

- [ ] **Step 1: 改造 _save_lyrics 函数**

替换 `lyrics.py` 中的 `_save_lyrics` 函数，使其在保存歌词时保留 original_content 不被覆盖（除非明确要求）。

```python
# lyrics.py 第 24-43 行，替换 _save_lyrics
def _save_lyrics(
    db: Session,
    track_id: int,
    result: LyricsResult,
    *,
    preserve_original: bool = True,
) -> Lyrics:
    """将 LyricsResult 保存或更新到数据库。

    preserve_original=True 时，不覆盖已有的 original_content/original_source。
    """
    lyrics = db.query(Lyrics).filter_by(track_id=track_id).first()
    if lyrics:
        lyrics.content = result.content
        lyrics.source = result.source
        lyrics.synced = result.synced
        # 仅当不需要保留原词，且来源是本地文件时，才更新 original
        if not preserve_original and result.source in ("embedded", "lrc"):
            lyrics.original_content = result.content
            lyrics.original_source = result.source
    else:
        lyrics = Lyrics(
            track_id=track_id,
            content=result.content,
            source=result.source,
            synced=result.synced,
        )
        if result.source in ("embedded", "lrc"):
            lyrics.original_content = result.content
            lyrics.original_source = result.source
        db.add(lyrics)
    db.commit()
    db.refresh(lyrics)
    return lyrics
```

- [ ] **Step 2: 更新 search_track_lyrics 中的搜索前备份逻辑**

在 `lyrics.py` 的 `search_track_lyrics` 函数中，在搜索结果通过质量门控后、调用 `_save_lyrics` 之前，添加自动备份逻辑。

```python
# lyrics.py search_track_lyrics 函数，在 `return _save_lyrics(db, track_id, result)` 之前添加
# 搜索前自动备份原始歌词
existing = db.query(Lyrics).filter_by(track_id=track_id).first()
if existing and not existing.original_content and existing.source in ("embedded", "lrc"):
    existing.original_content = existing.content
    existing.original_source = existing.source
    db.commit()
```

- [ ] **Step 3: 运行歌词测试**

```bash
cd /home/lsq/workspace/project/pythonProj/muze && python -m pytest backend/tests/test_lyrics_api_cache.py backend/tests/test_lyrics_candidates_api.py backend/tests/test_lyrics_service.py -v
```

预期：测试通过。

- [ ] **Step 4: 提交**

```bash
git add backend/app/api/lyrics.py
git commit -m "feat: preserve original lyrics during search, auto-backup before overwrite"
```

---

## Task 6: 歌词搜索改进 — 新增 restore 和 status API

**Files:**
- Modify: `backend/app/api/lyrics.py`

- [ ] **Step 1: 添加 restore 端点**

在 `lyrics.py` 中 `update_track_lyrics` 函数之后添加新端点。

```python
# lyrics.py，在 update_track_lyrics 函数之后添加
@router.post("/{track_id}/restore", response_model=LyricsOut)
def restore_original_lyrics(track_id: int, db: Session = Depends(get_db)):
    """恢复到原始歌词（内嵌/lrc）。"""
    _get_track_or_404(track_id, db)
    lyrics = db.query(Lyrics).filter_by(track_id=track_id).first()
    if not lyrics or not lyrics.original_content:
        raise HTTPException(status_code=404, detail="没有可恢复的原始歌词")

    lyrics.content = lyrics.original_content
    lyrics.source = lyrics.original_source or "embedded"
    # lrc 文件可能包含时间戳
    lyrics.synced = bool(
        lyrics.original_source == "lrc"
        and lyrics.original_content
        and "[" in lyrics.original_content
    )
    db.commit()
    db.refresh(lyrics)
    return lyrics
```

- [ ] **Step 2: 添加 status 端点**

在 `lyrics.py` 中 `restore_original_lyrics` 函数之后添加。

```python
# lyrics.py，在 restore 之后添加
@router.get("/status")
def lyrics_search_status(db: Session = Depends(get_db)):
    """返回逐字歌词搜索进度统计。"""
    from app.models.models import Lyrics as LyricsModel

    total = db.query(LyricsModel).count()
    synced_count = db.query(LyricsModel).filter(LyricsModel.synced == True).count()
    has_original = db.query(LyricsModel).filter(
        LyricsModel.original_content != None
    ).count()
    return {
        "total": total,
        "synced": synced_count,
        "pending": total - synced_count,
        "has_original": has_original,
    }
```

- [ ] **Step 3: 运行歌词 API 测试**

```bash
cd /home/lsq/workspace/project/pythonProj/muze && python -m pytest backend/tests/test_lyrics_api_cache.py backend/tests/test_lyrics_candidates_api.py -v
```

预期：测试通过。

- [ ] **Step 4: 提交**

```bash
git add backend/app/api/lyrics.py
git commit -m "feat: add lyrics restore and status API endpoints"
```

---

## Task 7: 歌词搜索改进 — 后台守护进程

**Files:**
- Create: `backend/app/services/lyrics_daemon.py`
- Modify: `backend/main.py`

- [ ] **Step 1: 创建 lyrics_daemon.py**

```python
"""歌词后台守护进程 — 自动搜索逐字歌词。"""
from __future__ import annotations

import logging
import threading
import time
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.models import Lyrics, Track
from app.services.lyrics_service import (
    LyricsResult,
    has_word_level_timestamps,
    search_online_lyrics,
)

logger = logging.getLogger(__name__)

# 搜索间隔（秒）
_SEARCH_INTERVAL = 900  # 15 分钟
# 每批最多处理曲目数
_BATCH_LIMIT = 50
# 单次搜索间隔（秒），避免限流
_REQUEST_DELAY = 1.5


def _needs_word_lyrics(lyrics: Lyrics) -> bool:
    """判断该歌词是否需要搜索逐字版本。"""
    if not lyrics.content:
        return True
    if lyrics.synced and has_word_level_timestamps(lyrics.content):
        return False  # 已有逐字歌词
    # 非逐字来源需要搜索
    return lyrics.source in ("embedded", "lrc", "manual", "netease", "lrclib")


def batch_search_word_lyrics(db: Session, limit: int = _BATCH_LIMIT) -> int:
    """批量搜索逐字歌词，返回成功更新数。"""
    candidates = (
        db.query(Track)
        .join(Lyrics, Lyrics.track_id == Track.id)
        .filter(
            or_(
                Lyrics.synced == False,
                Lyrics.source.in_(["embedded", "lrc", "manual", "netease", "lrclib"]),
            )
        )
        .limit(limit)
        .all()
    )

    updated = 0
    for track in candidates:
        lyrics = db.query(Lyrics).filter_by(track_id=track.id).first()
        if not lyrics or not _needs_word_lyrics(lyrics):
            continue

        artist_name = track.artist.name if track.artist else None
        try:
            result = search_online_lyrics(track.title, artist_name)
        except Exception:
            logger.exception("搜索歌词失败: %s - %s", track.title, artist_name)
            continue

        if not result or not has_word_level_timestamps(result.content):
            continue

        # 更新歌词，保留 original
        lyrics.content = result.content
        lyrics.source = result.source
        lyrics.synced = result.synced
        updated += 1
        logger.info("已更新逐字歌词: %s - %s (%s)", track.title, artist_name, result.source)

        time.sleep(_REQUEST_DELAY)

    if updated:
        db.commit()

    return updated


def _daemon_loop():
    """守护进程主循环。"""
    while True:
        time.sleep(_SEARCH_INTERVAL)
        db = SessionLocal()
        try:
            count = batch_search_word_lyrics(db)
            if count:
                logger.info("歌词守护进程：本轮更新 %d 首逐字歌词", count)
        except Exception:
            logger.exception("歌词守护进程异常")
        finally:
            db.close()


def start_lyrics_daemon() -> Optional[threading.Thread]:
    """启动歌词守护线程（daemon=True，主进程退出时自动终止）。"""
    thread = threading.Thread(target=_daemon_loop, name="lyrics-daemon", daemon=True)
    thread.start()
    logger.info("歌词守护进程已启动（间隔 %d 秒）", _SEARCH_INTERVAL)
    return thread
```

- [ ] **Step 2: 在 main.py lifespan 中启动守护进程**

在 `main.py` 的 `lifespan` 函数中，在 `yield` 之前启动守护线程。

```python
# main.py lifespan 函数，在 `yield` 之前添加
from app.services.lyrics_daemon import start_lyrics_daemon
start_lyrics_daemon()
```

- [ ] **Step 3: 运行后端全部测试**

```bash
cd /home/lsq/workspace/project/pythonProj/muze && python -m pytest backend/tests/ -v
```

预期：所有测试通过。

- [ ] **Step 4: 提交**

```bash
git add backend/app/services/lyrics_daemon.py backend/main.py
git commit -m "feat: add lyrics background daemon for auto word-level search"
```

---

## Task 8: 歌词搜索改进 — 前端类型和 API 客户端

**Files:**
- Modify: `frontend/src/types/api.ts:61-68`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/hooks/useLyrics.ts`

- [ ] **Step 1: 更新 LyricsOut 类型**

```typescript
// types/api.ts 第 61-68 行，替换 LyricsOut
export interface LyricsOut {
  id: number
  track_id: number
  source: string | null
  content: string | null
  synced: boolean
  updated_at: string
  original_content: string | null
  original_source: string | null
}
```

- [ ] **Step 2: 添加 restoreLyrics 和 getLyricsStatus API**

在 `client.ts` 的 `saveLyrics` 函数之后添加：

```typescript
// client.ts saveLyrics 之后添加
export async function restoreLyrics(trackId: number): Promise<LyricsOut> {
  const { data } = await api.post<LyricsOut>(`/lyrics/${trackId}/restore`)
  return data
}

export interface LyricsStatus {
  total: number
  synced: number
  pending: number
  has_original: number
}

export async function getLyricsStatus(): Promise<LyricsStatus> {
  const { data } = await api.get<LyricsStatus>('/lyrics/status')
  return data
}
```

- [ ] **Step 3: 添加 useRestoreLyrics hook**

在 `useLyrics.ts` 的 `useSaveLyrics` 之后添加：

```typescript
// useLyrics.ts useSaveLyrics 之后添加
import { restoreLyrics } from '@/api/client'

export function useRestoreLyrics() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (trackId: number) => restoreLyrics(trackId),
    onSuccess: (data, trackId) => {
      queryClient.setQueryData(['lyrics', trackId], data)
    },
  })
}
```

- [ ] **Step 4: 前端类型检查**

```bash
cd /home/lsq/workspace/project/pythonProj/muze/frontend && npx tsc --noEmit
```

预期：无类型错误。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/types/api.ts frontend/src/api/client.ts frontend/src/api/hooks/useLyrics.ts
git commit -m "feat: add lyrics restore API client and hook"
```

---

## Task 9: 歌词搜索改进 — NowPlayingPage UI 增强

**Files:**
- Modify: `frontend/src/components/nowplaying/NowPlayingPage.tsx`

- [ ] **Step 1: 添加恢复原词和手动粘贴的导入和状态**

在 `NowPlayingPage.tsx` 顶部导入区域，添加 `useRestoreLyrics` 和 `useSaveLyrics` 的导入。

```tsx
// NowPlayingPage.tsx 第 14-15 行，替换导入
import { useLyrics, useSearchLyrics, useRestoreLyrics, useSaveLyrics } from "@/api/hooks/useLyrics"
```

在组件函数内，添加新的状态和 mutation：

```tsx
// NowPlayingPage.tsx 组件内，在 searchLyricsMutation 之后添加
const restoreLyricsMutation = useRestoreLyrics()
const saveLyricsMutation = useSaveLyrics()
const [manualLyricsOpen, setManualLyricsOpen] = useState(false)
const [manualLyricsText, setManualLyricsText] = useState("")
```

- [ ] **Step 2: 添加恢复原词和手动粘贴的处理函数**

```tsx
// NowPlayingPage.tsx 组件内，在 searchOnlineLyrics 函数之后添加
const restoreOriginal = useCallback(async () => {
  if (!currentTrack) return
  try {
    await restoreLyricsMutation.mutateAsync(currentTrack.id)
    setTransientFeedback("已恢复原始歌词")
  } catch {
    setTransientFeedback("没有可恢复的原始歌词")
  }
}, [currentTrack, restoreLyricsMutation, setTransientFeedback])

const saveManualLyrics = useCallback(async () => {
  if (!currentTrack || !manualLyricsText.trim()) return
  try {
    await saveLyricsMutation.mutateAsync({
      trackId: currentTrack.id,
      payload: { content: manualLyricsText.trim() },
    })
    setManualLyricsOpen(false)
    setManualLyricsText("")
    setTransientFeedback("已保存手动歌词")
  } catch {
    setTransientFeedback("保存失败，请重试")
  }
}, [currentTrack, manualLyricsText, saveLyricsMutation, setTransientFeedback])

const canRestoreOriginal = Boolean(
  lyrics?.original_content &&
  lyrics?.source &&
  !["embedded", "lrc"].includes(lyrics.source)
)
```

- [ ] **Step 3: 在 MoreActions 下拉菜单中添加恢复和手动粘贴选项**

替换 `MoreActions` 变量中的 DropdownMenuContent，添加新菜单项。

```tsx
// NowPlayingPage.tsx MoreActions 变量，替换 DropdownMenuContent 内容
<DropdownMenuContent
  align="start"
  className="min-w-[12rem] border-white/15 bg-black/60 text-white backdrop-blur-md"
>
  <DropdownMenuItem
    onSelect={(e) => e.preventDefault()}
    onClick={() => searchOnlineLyrics(hasSearchedOnline ? { refresh: true } : undefined)}
    disabled={!currentTrack || searchLyricsMutation.isPending}
    className="focus:bg-white/10 focus:text-white"
  >
    {searchLyricsMutation.isPending
      ? "搜词中..."
      : hasSearchedOnline
        ? "已搜索（点击重搜）"
        : "联网搜词"}
  </DropdownMenuItem>
  {canRestoreOriginal && (
    <DropdownMenuItem
      onSelect={(e) => e.preventDefault()}
      onClick={restoreOriginal}
      disabled={restoreLyricsMutation.isPending}
      className="focus:bg-white/10 focus:text-white"
    >
      恢复原词
    </DropdownMenuItem>
  )}
  <DropdownMenuItem
    onSelect={(e) => e.preventDefault()}
    onClick={() => setManualLyricsOpen(true)}
    className="focus:bg-white/10 focus:text-white"
  >
    手动粘贴歌词
  </DropdownMenuItem>
  <DropdownMenuSeparator className="bg-white/10" />
  <DropdownMenuItem
    onSelect={(e) => e.preventDefault()}
    onClick={() => setPlaylistDialogOpen(true)}
    disabled={!currentTrack}
    className="focus:bg-white/10 focus:text-white"
  >
    添加到播放列表
  </DropdownMenuItem>
</DropdownMenuContent>
```

- [ ] **Step 4: 添加手动粘贴歌词弹窗**

在 `NowPlayingPage.tsx` 的最后一个 `</Dialog>` 之后、`</motion.div>` 之前，添加手动粘贴弹窗。

```tsx
{/* 手动粘贴歌词弹窗 */}
<Dialog open={manualLyricsOpen} onOpenChange={setManualLyricsOpen}>
  <DialogContent className="border-white/15 bg-black/80 text-white backdrop-blur-xl">
    <DialogHeader>
      <DialogTitle>手动粘贴歌词</DialogTitle>
      <DialogDescription className="text-white/60">
        支持纯文本或 LRC 格式（如 [00:12.34]歌词文本）
      </DialogDescription>
    </DialogHeader>
    <textarea
      value={manualLyricsText}
      onChange={(e) => setManualLyricsText(e.target.value)}
      placeholder="[00:12.34]第一行歌词&#10;[00:15.67]第二行歌词"
      className="h-60 w-full resize-none rounded-md border border-white/15 bg-white/5 p-3 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
    />
    <DialogFooter>
      <button
        onClick={() => {
          setManualLyricsOpen(false)
          setManualLyricsText("")
        }}
        className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
      >
        取消
      </button>
      <button
        onClick={saveManualLyrics}
        disabled={!manualLyricsText.trim() || saveLyricsMutation.isPending}
        className="rounded-md bg-white px-3 py-2 text-sm text-black transition-colors hover:bg-white/90 disabled:opacity-60"
      >
        保存
      </button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 5: 前端类型检查和构建验证**

```bash
cd /home/lsq/workspace/project/pythonProj/muze/frontend && npx tsc --noEmit && npm run build
```

预期：无错误，构建成功。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/nowplaying/NowPlayingPage.tsx
git commit -m "feat: add restore original lyrics and manual paste UI"
```

---

## Task 10: 端到端验证

- [ ] **Step 1: 启动完整开发环境**

```bash
cd /home/lsq/workspace/project/pythonProj/muze && bash start.sh
```

- [ ] **Step 2: 验证目录映射修复**

1. 不添加任何 WatchFolder，直接调用 `POST /api/library/scan {"path": "/music"}` → 应返回 403
2. 通过 UI 添加 `/music` 子目录到媒体库
3. 再次调用 scan → 应成功

- [ ] **Step 3: 验证封面背景动画**

1. 播放一首有封面的歌曲
2. 确认封面图作为模糊背景显示
3. 切歌，确认交叉渐变平滑
4. 确认光球效果柔和

- [ ] **Step 4: 验证歌词搜索改进**

1. 播放一首歌曲，确认歌词自动获取
2. 在下拉菜单中点击"联网搜词"，确认搜索成功后原词被备份
3. 确认"恢复原词"按钮出现并可点击
4. 确认"手动粘贴歌词"弹窗可用
5. 检查 `/api/lyrics/status` 返回正确的统计

- [ ] **Step 5: 运行全部后端测试**

```bash
cd /home/lsq/workspace/project/pythonProj/muze && python -m pytest backend/tests/ -v
```

预期：所有测试通过。

- [ ] **Step 6: 最终提交**

```bash
git add -A
git commit -m "chore: final integration verification for three improvements"
```
