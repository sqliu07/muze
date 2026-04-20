export interface LyricLine {
  time: number
  text: string
  words?: LyricWord[]
}

export interface LyricWord {
  start: number
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
    const text = match[2].trim()

    // 逐字/逐词时间戳行（例如 LDDC 输出: [00:00.000]周[00:00.500]杰...）
    if (_containsInlineWordTags(text)) {
      const words: LyricWord[] = []
      const allMatches = [...raw.matchAll(tagRegex)]
      for (let i = 0; i < allMatches.length; i += 1) {
        const tag = allMatches[i]
        const start = parseTagTime(tag as RegExpExecArray)
        const segStart = tag.index! + tag[0].length
        const segEnd = i + 1 < allMatches.length ? allMatches[i + 1].index! : raw.length
        const seg = raw.slice(segStart, segEnd)
        if (!seg) continue
        words.push({ start, text: seg })
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
