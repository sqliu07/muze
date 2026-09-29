export interface LyricLine {
  time: number
  text: string
  words?: LyricWord[]
  translation?: string
}

export interface LyricWord {
  start: number
  end?: number
  text: string
}

/**
 * 解析 LRC 格式歌词
 * 支持 [mm:ss.xx] 和 [mm:ss.xxx] 时间标签
 * 支持一行多个时间标签
 */
export function parseLrc(content: string): LyricLine[] {
  const lines: LyricLine[] = []
  const tagRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g
  const lineRegex = /^((?:\[\d{2}:\d{2}[.:]\d{2,3}\])+)(.*)$/
  const parseTagTime = (tagMatch: RegExpExecArray): number => {
    const min = parseInt(tagMatch[1], 10)
    const sec = parseInt(tagMatch[2], 10)
    let ms = parseInt(tagMatch[3], 10)
    if (tagMatch[3].length === 2) ms *= 10
    return min * 60 + sec + ms / 1000
  }

  for (const raw of content.split('\n')) {
    const match = raw.trim().match(lineRegex)
    if (!match) continue

    const tagsPart = match[1]
    const text = _cleanLyricText(match[2].trim())

    // 逐字/逐词时间戳行（例如 LDDC 输出: [00:00.000]周[00:00.500]杰...）
    if (_containsInlineWordTags(text)) {
      const words: LyricWord[] = []
      const allMatches = [...raw.matchAll(tagRegex)]
      for (let i = 0; i < allMatches.length; i += 1) {
        const tag = allMatches[i]
        const start = parseTagTime(tag as RegExpExecArray)
        const end = i + 1 < allMatches.length
          ? parseTagTime(allMatches[i + 1] as RegExpExecArray)
          : undefined
        const segStart = tag.index! + tag[0].length
        const segEnd = i + 1 < allMatches.length ? allMatches[i + 1].index! : raw.length
        const seg = raw.slice(segStart, segEnd)
        if (!seg) continue
        words.push({ start, end, text: seg })
      }
      if (words.length > 0) {
        lines.push({
          time: words[0].start,
          text: words.map((w) => w.text).join('').trim(),
          words,
        })
        continue
      }
    }

    let tagMatch: RegExpExecArray | null
    tagRegex.lastIndex = 0
    while ((tagMatch = tagRegex.exec(tagsPart)) !== null) {
      const time = parseTagTime(tagMatch)
      lines.push({ time, text })
    }
  }

  lines.sort((a, b) => a.time - b.time)
  return lines
}

/**
 * 将翻译歌词按时间戳匹配到原始歌词行
 * @param originalLines 原始歌词行（已解析）
 * @param translatedContent 翻译歌词 LRC 格式字符串
 * @param threshold 时间差阈值（秒），默认 1.0
 * @returns 带有 translation 字段的原始歌词行
 */
export function matchTranslations(
  originalLines: LyricLine[],
  translatedContent: string,
  threshold = 1.0,
): LyricLine[] {
  const translatedLines = parseLrc(translatedContent)
  if (translatedLines.length === 0) return originalLines

  return originalLines.map((line) => {
    // 找时间戳最接近的翻译行
    let bestMatch: string | undefined
    let bestDiff = Infinity
    for (const tl of translatedLines) {
      const diff = Math.abs(tl.time - line.time)
      if (diff < bestDiff && diff <= threshold) {
        bestDiff = diff
        bestMatch = tl.text
      }
    }
    return bestMatch ? { ...line, translation: bestMatch } : line
  })
}

export function isMostlyCjkLyrics(content: string): boolean {
  const text = content.replace(/\[[^\]]+\]|<[^>]+>/g, "")
  const chars = Array.from(text).filter((ch) => !/\s/.test(ch))
  if (chars.length === 0) return false
  const cjk = chars.filter((ch) => /[\u4e00-\u9fff]/.test(ch)).length
  return cjk / chars.length >= 0.3
}

/**
 * 返回当前时间对应的行索引
 * 即最后一个 time <= currentTime 的行
 */
export function getCurrentLineIndex(lines: LyricLine[], currentTime: number): number {
  let lo = 0
  let hi = lines.length - 1
  let result = -1

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= currentTime) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return result
}

function _containsInlineWordTags(text: string): boolean {
  return /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/.test(text)
}

function _cleanLyricText(text: string): string {
  return text.replace(/^此歌曲为没有填词的纯音乐，请您欣赏$/, "纯音乐，请欣赏")
}
