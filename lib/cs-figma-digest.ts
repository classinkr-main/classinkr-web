import type {
  CsFigmaGuide,
  CsFigmaGuideCategory,
  CsFigmaGuideDocCategory,
} from "@/lib/cs-figma-guides"

export interface CsFigmaDigestEntry {
  id: string
  categoryName: string
  title: string
  platform: string
  audience: string
  summary: string
  steps: string[]
  tips: string[]
  screenDescription: string
  sourceImageFiles: string[]
  sourceDigestLineHint: string
}

type DigestParseMode = "summary" | "steps" | "tips" | "screen"

const DIGEST_DOC_PATH = "docs/active/cs-figma-board-digest-2026-06-21.md"

const CATEGORY_HEADING_PATTERN = /^##\s+(.+?)\s*$/
const ENTRY_HEADING_PATTERN = /^###\s+(.+?)(?:\s+_\((.+)\)_)?\s*$/
const FILE_PATTERN = /^<sub>파일:\s*`(.+?)`<\/sub>\s*$/
const ORDERED_STEP_PATTERN = /^\d+\.\s+(.+)$/
const BULLET_PATTERN = /^-\s+(.+)$/

function cleanDigestText(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function compactLines(lines: string[]) {
  return lines.map(cleanDigestText).filter(Boolean).join("\n\n")
}

function compactSentence(value: string, maxLength = 240) {
  const cleaned = cleanDigestText(value)
  if (cleaned.length <= maxLength) return cleaned

  const truncated = cleaned.slice(0, maxLength)
  const sentenceEnd = Math.max(truncated.lastIndexOf("."), truncated.lastIndexOf("다."))
  if (sentenceEnd > 80) return truncated.slice(0, sentenceEnd + 1).trim()
  return `${truncated.trim()}...`
}

function parseHeadingMetadata(metadata = "") {
  const [platform = "", ...audienceParts] = metadata.split("/").map((part) => cleanDigestText(part))
  return {
    platform,
    audience: audienceParts.join("/").trim(),
  }
}

function toDigestId(sourceLine: number) {
  return `cs-figma-digest-${sourceLine}`
}

function appendContinuation(items: string[], line: string) {
  const cleaned = cleanDigestText(line)
  if (!cleaned) return

  if (items.length === 0) {
    items.push(cleaned)
    return
  }

  items[items.length - 1] = `${items[items.length - 1]} ${cleaned}`.trim()
}

export function parseCsFigmaDigestMarkdown(markdown: string): CsFigmaDigestEntry[] {
  const lines = markdown.split(/\r?\n/)
  const entries: CsFigmaDigestEntry[] = []
  let currentCategory = ""
  let current:
    | (CsFigmaDigestEntry & {
        summaryLines: string[]
        screenLines: string[]
      })
    | null = null
  let mode: DigestParseMode = "summary"

  function flushCurrent() {
    if (!current) return

    const { summaryLines, screenLines, ...entry } = current
    entries.push({
      ...entry,
      summary: compactLines(summaryLines),
      screenDescription: compactLines(screenLines),
      steps: entry.steps.map(cleanDigestText).filter(Boolean),
      tips: entry.tips.map(cleanDigestText).filter(Boolean),
      sourceImageFiles: entry.sourceImageFiles.map(cleanDigestText).filter(Boolean),
    })
    current = null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? ""
    const line = rawLine.trim()

    const categoryMatch = line.match(CATEGORY_HEADING_PATTERN)
    if (categoryMatch && !line.startsWith("###")) {
      flushCurrent()
      const categoryName = cleanDigestText(categoryMatch[1] ?? "")
      if (categoryName && categoryName !== "카테고리 색인") currentCategory = categoryName
      continue
    }

    const entryMatch = line.match(ENTRY_HEADING_PATTERN)
    if (entryMatch) {
      flushCurrent()
      const title = cleanDigestText(entryMatch[1] ?? "")
      const metadata = parseHeadingMetadata(entryMatch[2] ?? "")
      const sourceLine = index + 1
      current = {
        id: toDigestId(sourceLine),
        categoryName: currentCategory,
        title,
        platform: metadata.platform,
        audience: metadata.audience,
        summary: "",
        summaryLines: [],
        steps: [],
        tips: [],
        screenDescription: "",
        screenLines: [],
        sourceImageFiles: [],
        sourceDigestLineHint: `${DIGEST_DOC_PATH}:${sourceLine}`,
      }
      mode = "summary"
      continue
    }

    if (!current || !line) continue

    const fileMatch = line.match(FILE_PATTERN)
    if (fileMatch) {
      current.sourceImageFiles.push(fileMatch[1] ?? "")
      continue
    }

    if (line === "**단계**") {
      mode = "steps"
      continue
    }

    if (line === "**⚠️ 주의/팁**") {
      mode = "tips"
      continue
    }

    if (line.startsWith("**화면**")) {
      mode = "screen"
      const screenText = line.replace(/^\*\*화면\*\*:\s*/, "")
      if (screenText) current.screenLines.push(screenText)
      continue
    }

    if (mode === "summary") {
      current.summaryLines.push(line)
      continue
    }

    if (mode === "steps") {
      const stepMatch = line.match(ORDERED_STEP_PATTERN)
      if (stepMatch) current.steps.push(stepMatch[1] ?? "")
      else appendContinuation(current.steps, line)
      continue
    }

    if (mode === "tips") {
      const bulletMatch = line.match(BULLET_PATTERN)
      if (bulletMatch) current.tips.push(bulletMatch[1] ?? "")
      else appendContinuation(current.tips, line)
      continue
    }

    current.screenLines.push(line)
  }

  flushCurrent()
  return entries
}

function inferGuideCategory(entry: CsFigmaDigestEntry): CsFigmaGuideCategory {
  const text = `${entry.categoryName} ${entry.title} ${entry.summary}`
  if (/데이터\/로그|데이터 로그|로그 보고|네트워크|업데이트|캐시|설치|에러|오류|삭제\/재설치/.test(text)) {
    return "troubleshooting"
  }
  if (/대시보드관리|설정\/옵션|결제\/권한|관리자|충전|결제|권한|초대|하위 계정|스토리지/.test(text)) {
    return "admin"
  }
  if (/다운로드|Windows|로그인|회원가입|시작|홈/.test(text)) return "onboarding"
  return "classroom"
}

function inferDocCategory(entry: CsFigmaDigestEntry, category: CsFigmaGuideCategory): CsFigmaGuideDocCategory {
  const text = `${entry.title} ${entry.audience} ${entry.categoryName}`
  if (/학생/.test(text) && !/교사|강사|관리자|CS팀|CS 담당/.test(text)) return "student"
  if (category === "admin") return "admin"
  if (category === "onboarding") return "start"
  return "teacher"
}

function deriveGuideKeywords(entry: CsFigmaDigestEntry) {
  const uiLabelText = [entry.title, entry.summary, ...entry.steps, ...entry.tips].join(" ")
  const uiLabels = Array.from(
    uiLabelText.matchAll(/["“”'‘’\[]([^"“”'‘’\[\]]{2,40})["“”'‘’\]]/g),
    (match) => match[1] ?? ""
  )
  const candidates = [
    entry.title,
    entry.categoryName,
    entry.platform,
    ...uiLabels,
    ...entry.title.split(/[\/·—~()［］\[\],&+]/),
    ...entry.sourceImageFiles.map((file) => file.replace(/\.[a-z0-9]+$/i, "")),
  ]

  const keywords: string[] = []
  const normalizedKeywords = new Set<string>()
  for (const candidate of candidates) {
    const cleaned = cleanDigestText(candidate)
    const normalized = cleaned.toLowerCase()
    if (cleaned.length < 2 || normalizedKeywords.has(normalized)) continue
    keywords.push(cleaned)
    normalizedKeywords.add(normalized)
  }

  return keywords.slice(0, 12)
}

function firstNonEmpty(items: string[], fallback: string) {
  return items.find((item) => cleanDigestText(item)) ?? fallback
}

function pickChecks(items: string[], fallback: string[]) {
  const checks = items.map((item) => compactSentence(item, 120)).filter(Boolean)
  return (checks.length > 0 ? checks : fallback).slice(0, 4)
}

export function buildCsFigmaGuideFromDigestEntry(entry: CsFigmaDigestEntry): CsFigmaGuide {
  const category = inferGuideCategory(entry)
  const docCategory = inferDocCategory(entry, category)
  const sourceFiles = entry.sourceImageFiles.length > 0 ? entry.sourceImageFiles : [entry.title]
  const steps =
    entry.steps.length > 0
      ? entry.steps
      : [
          `${entry.title} 원본 화면을 확인합니다.`,
          entry.screenDescription
            ? compactSentence(entry.screenDescription, 160)
            : "Figma CS 캡처의 화면 구조와 주석을 기준으로 안내합니다.",
        ]

  return {
    slug: entry.id,
    docSlug: entry.id,
    docCategory,
    category,
    title: entry.title,
    audience: entry.audience || "CS 담당자",
    summary:
      entry.summary ||
      `${entry.categoryName} 영역의 Figma CS 캡처를 기준으로 ${entry.title} 화면과 안내 순서를 정리합니다.`,
    keywords: deriveGuideKeywords(entry),
    steps,
    deepDive: [
      {
        level: "1단계",
        title: "순서 그대로 안내",
        body: "Figma CS 캡처의 단계 텍스트를 우선 순서로 사용합니다.",
        checks: pickChecks(steps.slice(0, 4), [entry.title, entry.categoryName]),
      },
      {
        level: "2단계",
        title: "화면 기준 확인",
        body: entry.screenDescription
          ? compactSentence(entry.screenDescription, 220)
          : "원본 화면의 강조 박스, 메뉴명, 버튼명을 함께 확인합니다.",
        checks: pickChecks(entry.screenDescription.split(/\s+\/\s+/), [entry.platform || "화면", entry.title]),
      },
      {
        level: "3단계",
        title: "CS 주의사항과 원본 캡처",
        body: `원본 캡처 파일과 주의/팁을 함께 확인합니다. 원본 캡처: ${sourceFiles.join(", ")}`,
        checks: pickChecks(entry.tips, [firstNonEmpty(sourceFiles, entry.title), entry.sourceDigestLineHint]),
      },
    ],
    sourceImageFiles: sourceFiles,
    sourceDigestLineHint: entry.sourceDigestLineHint,
  }
}
