/** 歌词显示配置 */

// ── 字体 ──
export const LYRIC_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif"
export const LYRIC_FONT_SIZE = "2.6rem"
export const LYRIC_LINE_HEIGHT = 1.08

// ── 行高 ──
export const LYRIC_ROW_HEIGHT = 92

// ── 字重 ──
export const CURRENT_LINE_WEIGHT = 500
export const OTHER_LINE_WEIGHT = 500

// ── 逐字上浮 ──
export const WORD_LIFT_MAX = 0.6

// ── 逐字填充弹簧 ──
export const FILL_SPRING_K = 220
export const FILL_SPRING_C = 30

// ── 逐字片段尾部估算 ──
export const SEGMENT_TAIL_MIN = 0.14
export const SEGMENT_TAIL_MAX = 0.5
export const SEGMENT_END_MIN_PAD = 0.08
export const SEGMENT_END_NEXT_PAD = 0.02
export const DEFAULT_WORD_GAP = 0.22
export const SEGMENT_SMOOTH_EPSILON = 0.05

// ── 填充动画时间步长 ──
export const DT_CLAMP_MIN = 1 / 240
export const DT_CLAMP_MAX = 0.05

// ── 滚动弹簧 ──
export const SCROLL_SPRING_STIFFNESS = 155
export const SCROLL_SPRING_DAMPING = 24
export const SCROLL_SPRING_MASS = 0.82

// ── 非当前行透明度 ──
export const LINE_OPACITY_D1 = 0.52
export const LINE_OPACITY_D2 = 0.28
export const LINE_OPACITY_D3 = 0.16
export const LINE_OPACITY_D_FAR = 0.08

// ── 透明度动画 ──
export const OPACITY_TRANSITION_DURATION = 0.35

// ── 前奏点阵 ──
export const PRELUDE_MIN_DURATION = 3.5
export const PRELUDE_HIDE_BEFORE = 0.08
export const PRELUDE_FILL_WINDOW_MAX = 6.5
export const PRELUDE_FILL_WINDOW_MIN = 2.2
export const PRELUDE_FILL_WINDOW_RATIO = 0.65
export const PRELUDE_FILL_END_PAD = 0.9

// ── 点阵呼吸动画 ──
export const INTERLUDE_DOT_SCALE_MAX = 1.15
export const INTERLUDE_DOT_SCALE_MIN = 0.9
export const INTERLUDE_DOT_BREATHE_DURATION = 5.0
export const INTERLUDE_DOT_EXIT_PEAK = 1.12

// ── 句间间奏 ──
export const INTERLUDE_GAP_MIN = 6
export const INTERLUDE_LEAD_IN = 1.2
export const INTERLUDE_FILL_BEFORE_NEXT = 1.0
// 间奏提前结束时间：根据间隔动态计算，以下为取值范围
export const INTERLUDE_HIDE_BEFORE_MIN = 0.7
export const INTERLUDE_HIDE_BEFORE_MAX = 1.3
export const INTERLUDE_HIDE_BEFORE_RATIO = 0.13 // hideBefore = clamp(gap * ratio, min, max)
// 退出动画时长：取 hideBefore 的此比例，余量为收缩完到上浮的停顿
export const INTERLUDE_EXIT_RATIO = 0.6
export const INTERLUDE_DOT_EXIT_DURATION = 0.55
export const INTERLUDE_EXIT_DURATION_MIN = 0.55
export const INTERLUDE_EXIT_DURATION_MAX = 0.95
export const INTERLUDE_LAST_WORD_PAD = 0.3
export const INTERLUDE_NO_WORDS_FALLBACK = 3.0

// ── 间奏后补位动画 ──
export const INTERLUDE_AFTER_SLIDE_DURATION = 0.55
