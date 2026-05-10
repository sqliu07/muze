# Muze 三项改进设计文档

日期：2026-05-10
状态：已确认

---

## 概述

三项独立改进：
1. 封面背景动画改造 — Apple Music 风格模糊背景 + 平滑过渡
2. 目录映射修复 — scan API 路径校验，防止未添加目录被扫描
3. 歌词搜索改进 — 原词快照、后台守护进程、恢复/手动粘贴

---

## 1. 封面背景动画改造

### 目标

将当前生硬的纯色渐变 + 低效光球改为 Apple Music 风格的封面模糊背景，切歌时平滑过渡。

### 背景层次（从底到顶）

| 层 | 实现 | 说明 |
|---|---|---|
| L1 封面模糊层 | `<img>` 放大 + CSS filter | `scale(1.4)` + `blur(80px)` + `saturate(1.5)`，铺满背景 |
| L2 深色遮罩 | 纯色 div | `rgba(0,0,0,0.35)` 半透明，保证文字可读 |
| L3 三色渐变 | linear-gradient | 现有 3 色渐变，opacity 0.3~0.4 叠加增强色彩 |
| L4 光球点缀 | 3 个圆形 div | opacity 0.08~0.12，blur 60px，周期 20-30s |
| L5 UI 内容 | z-10 | 歌词、封面、控制按钮 |

### 切歌过渡机制

```
状态：[currentCover, nextCover]

切歌流程：
1. 下一首歌的封面 URL 确定
2. nextCover 层开始加载图片
3. 加载完成后，nextCover opacity 从 0 → 1（transition 1.2s ease-in-out）
4. 同时提取新颜色，更新 L3 渐变和 L4 光球颜色
5. 过渡完成后：currentCover = nextCover，nextCover 重置
```

颜色提取在图片加载时立即执行，不等渲染完成。

### 光球动画调整

| 参数 | 当前值 | 新值 |
|---|---|---|
| 周期 | 50-70s | 20-30s |
| Y 运动幅度 | ±10% | ±15% |
| X 运动幅度 | ±4% | ±8% |
| opacity | 0.18-0.24 | 0.08-0.12 |
| blur | 30-34px | 60px |

### 改动文件

| 文件 | 改动 |
|---|---|
| `frontend/src/components/nowplaying/NowPlayingPage.tsx` | 重构背景层，增加封面模糊层和过渡逻辑 |
| `frontend/src/hooks/useColorThief.ts` | 无改动，复用现有 |
| `frontend/src/index.css` | 更新光球动画参数 |
| `frontend/tailwind.config.js` | 更新 gradient-breathe 参数 |

### 性能考虑

- `prefers-reduced-motion` 适配保留
- 封面模糊层使用 `will-change: opacity` 提示浏览器优化
- 光球使用 `transform: translate3d` 启用 GPU 加速

---

## 2. 目录映射修复

### 目标

防止用户在未将目录添加为 WatchFolder 的情况下直接扫描该目录。

### 改动范围

仅 `backend/app/api/library.py`

### 核心改动：`POST /api/library/scan` 路径校验

```python
@router.post("/scan", response_model=ScanResult)
def scan_folder(body: ScanRequest, db: Session = Depends(get_db)):
    # 新增：校验路径是否属于已添加的 WatchFolder
    folder = db.query(WatchFolder).filter(
        WatchFolder.active == True,
        # 路径匹配：传入路径是 WatchFolder 的子路径，或 WatchFolder 是传入路径的子路径
        or_(
            body.path.startswith(WatchFolder.path + "/"),
            body.path == WatchFolder.path,
            WatchFolder.path.startswith(body.path + "/"),
        )
    ).first()

    if not folder:
        raise HTTPException(
            status_code=403,
            detail="请先将目录添加到媒体库"
        )

    covers_dir = str(COVERS_DIR)
    result = scan_directory(body.path, db, covers_dir)
    # ... 其余逻辑不变
```

### 边界情况

| 场景 | WatchFolder | 传入 path | 结果 |
|---|---|---|---|
| 精确匹配 | `/music/rock` | `/music/rock` | 允许 |
| 子目录扫描 | `/music` | `/music/rock` | 允许（前缀匹配） |
| 父目录扫描 | `/music/rock` | `/music` | 允许（反向前缀匹配） |
| 无关目录 | `/music` | `/data/other` | 拒绝，403 |
| 未添加 | 无 | `/music` | 拒绝，403 |

### `refresh` 端点

无需改动，它本身就只扫描 `active=True` 的 WatchFolder。

---

## 3. 歌词搜索改进

### 目标

- 保留内嵌/lrc 原始歌词作为可恢复的"底本"
- 后台自动搜索逐字歌词
- 搜索到后提供恢复原词和手动粘贴选项

### 3.1 数据模型改动

**Lyrics 表新增字段：**

```python
# models.py Lyrics 类
original_content: Mapped[Optional[str]] = mapped_column(Text, default=None)
original_source: Mapped[Optional[str]] = mapped_column(String(20), default=None)
```

**字段语义：**
- `original_content`：首次入库时的原始歌词（source 为 embedded 或 lrc 时自动填充）
- `original_source`：原始歌词来源标记
- 后续在线搜索只覆盖 `content` 和 `source`，不动 `original_*`

**入库逻辑改动（scanner.py）：**

```python
# scan_file 中首次创建 Lyrics 记录时
if source in ("embedded", "lrc"):
    lyrics = Lyrics(
        track_id=track.id,
        source=source,
        content=content,
        synced=synced,
        original_content=content,  # 新增
        original_source=source,    # 新增
    )
```

### 3.2 后台守护进程

**文件：`backend/app/services/lyrics_daemon.py`**（新建）

**触发时机：**

1. **入库时**：scanner 完成 `scan_file()` 后，将 track_id 加入异步队列
2. **定时任务**：每 30 分钟扫描一次数据库

**定时任务逻辑：**

```python
def batch_search_word_lyrics(db: Session, limit: int = 50):
    """批量搜索逐字歌词。"""
    # 找出需要搜索的曲目：
    # - synced = False（非同步歌词）
    # - source 为 embedded / lrc / manual / netease（非逐字来源）
    tracks = db.query(Track).join(Lyrics).filter(
        or_(
            Lyrics.synced == False,
            Lyrics.source.in_(["embedded", "lrc", "manual", "netease"])
        )
    ).limit(limit).all()

    for track in tracks:
        result = search_online_lyrics(track.title, track.artist.name)
        if result and has_word_level_timestamps(result.content):
            _save_lyrics(db, track.id, result, overwrite_original=False)
        time.sleep(1.5)  # 避免限流
```

**`_save_lyrics` 改动：**

```python
def _save_lyrics(db, track_id, result, overwrite_original=True):
    """保存歌词。overwrite_original=False 时不覆盖 original_* 字段。"""
    lyrics = db.query(Lyrics).filter(Lyrics.track_id == track_id).first()
    if lyrics:
        lyrics.content = result.content
        lyrics.source = result.source
        lyrics.synced = result.synced
        if overwrite_original and result.source in ("embedded", "lrc"):
            lyrics.original_content = result.content
            lyrics.original_source = result.source
    else:
        lyrics = Lyrics(
            track_id=track_id,
            source=result.source,
            content=result.content,
            synced=result.synced,
        )
        if result.source in ("embedded", "lrc"):
            lyrics.original_content = result.content
            lyrics.original_source = result.source
        db.add(lyrics)
    db.commit()
```

**启动方式：**

在 `main.py` 的 `lifespan` 中启动后台线程：

```python
import threading

def start_lyrics_daemon(db_factory):
    def _run():
        while True:
            time.sleep(1800)  # 30 分钟
            db = db_factory()
            try:
                batch_search_word_lyrics(db)
            finally:
                db.close()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
```

### 3.3 API 改动

**改动端点：**

`GET /api/lyrics/{track_id}` 返回增加字段：

```python
class LyricsOut(BaseModel):
    id: int
    track_id: int
    source: Optional[str]
    content: Optional[str]
    synced: bool
    updated_at: datetime
    original_content: Optional[str]  # 新增
    original_source: Optional[str]   # 新增
```

`POST /api/lyrics/{track_id}/search` 改动：

```python
# 搜索前自动备份（如果 original_content 为空）
if lyrics and not lyrics.original_content and lyrics.source in ("embedded", "lrc"):
    lyrics.original_content = lyrics.content
    lyrics.original_source = lyrics.source
    db.commit()
```

**新增端点：**

```python
@router.post("/{track_id}/restore")
def restore_original_lyrics(track_id: int, db: Session = Depends(get_db)):
    """恢复到原始歌词（内嵌/lrc）。"""
    lyrics = db.query(Lyrics).filter(Lyrics.track_id == track_id).first()
    if not lyrics or not lyrics.original_content:
        raise HTTPException(404, "没有可恢复的原始歌词")

    lyrics.content = lyrics.original_content
    lyrics.source = lyrics.original_source
    lyrics.synced = lyrics.original_source in ("lrc",)  # lrc 可能有时间戳
    db.commit()
    return lyrics

@router.get("/status")
def lyrics_search_status(db: Session = Depends(get_db)):
    """返回逐字歌词搜索进度统计。"""
    total = db.query(Lyrics).count()
    word_level = db.query(Lyrics).filter(Lyrics.synced == True).count()
    return {
        "total": total,
        "word_level": word_level,
        "pending": total - word_level,
    }
```

### 3.4 前端改动

**LyricsOut 类型更新：**

```typescript
interface LyricsOut {
  id: number;
  track_id: number;
  source: string | null;
  content: string | null;
  synced: boolean;
  updated_at: string;
  original_content: string | null;  // 新增
  original_source: string | null;   // 新增
}
```

**新增 API 调用：**

```typescript
// client.ts
export function restoreLyrics(trackId: number) {
  return api.post(`/lyrics/${trackId}/restore`)
}
```

**新增 hooks：**

```typescript
// useLyrics.ts
export function useRestoreLyrics() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (trackId: number) => restoreLyrics(trackId),
    onSuccess: (_, trackId) => {
      queryClient.invalidateQueries({ queryKey: ['lyrics', trackId] })
    },
  })
}
```

**歌词面板 UI 改动（NowPlayingPage.tsx 歌词区域）：**

```
┌─────────────────────────────────┐
│  [搜索歌词]  [恢复原词]  [手动粘贴]  │  ← 按钮栏
├─────────────────────────────────┤
│                                 │
│         歌词内容区域              │
│                                 │
└─────────────────────────────────┘
```

- **"搜索歌词"** — 现有功能，搜索前自动备份
- **"恢复原词"** — 仅当 `original_content` 存在且当前 source 不是 embedded/lrc 时显示
- **"手动粘贴"** — 始终显示，打开弹窗

**手动粘贴弹窗：**

```
┌─────────────────────────────────┐
│  手动粘贴歌词                     │
├─────────────────────────────────┤
│  支持纯文本或 LRC 格式             │
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │   文本输入区域              │  │
│  │                           │  │
│  └───────────────────────────┘  │
│                                 │
│        [取消]    [保存]          │
└─────────────────────────────────┘
```

保存时自动检测格式：
- 包含 `[mm:ss.xx]` 时间戳 → synced=True, source="manual"
- 纯文本 → synced=False, source="manual"

### 改动文件汇总

| 文件 | 改动 |
|---|---|
| `backend/app/models/models.py` | Lyrics 表新增 original_content, original_source |
| `backend/app/services/scanner.py` | 入库时填充 original_* 字段 |
| `backend/app/services/lyrics_daemon.py` | 新建，后台守护进程 |
| `backend/app/api/lyrics.py` | 改动返回结构、search 逻辑、新增 restore/status 端点 |
| `backend/main.py` | 启动时启动守护线程 |
| `frontend/src/types/api.ts` | LyricsOut 增加字段 |
| `frontend/src/api/client.ts` | 新增 restoreLyrics |
| `frontend/src/api/hooks/useLyrics.ts` | 新增 useRestoreLyrics |
| `frontend/src/components/nowplaying/NowPlayingPage.tsx` | 歌词面板增加恢复/手动粘贴按钮和弹窗 |

---

## 依赖关系

三项改进相互独立，可并行实施：
- 问题 1（背景动画）：纯前端
- 问题 2（目录映射）：纯后端，1 个文件
- 问题 3（歌词搜索）：前后端都涉及，改动最大

建议实施顺序：2 → 1 → 3（从简到繁）
