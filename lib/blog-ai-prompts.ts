// 블로그 편집기 AI 도구(초안·다듬기·카드뉴스·릴스)의 프롬프트와 초안 결과 해석.
// 라우트·편집기·품질 점검 스크립트(tmp/blog-ai-eval-*)가 같이 쓴다.
// 표기 규칙은 2026-10 공개 글 40편의 실제 형식(H1 없음, `---` 구분, 섹션별 {{green:}} 한 줄, 인용·표)에 맞췄다.
// 브랜드 문구는 lib/classin-positioning.ts 를 그대로 쓰고, 문서에만 있는 것(보이스 헌장 §1·§3·§4·§5, company-facts §3)은
// 아래 상수에 옮겨 적었다. 그 문서를 고치면 여기도 같이 고친다.

import {
  CLASSIN_CHATBOT_REFERENCE,
  CLASSIN_POSITIONING,
  getClassinPositioningContext,
} from "@/lib/classin-positioning"

export type BlogAiAction = "card-news" | "reels" | "optimize" | "draft"

export type BlogAiDraftParams = {
  topic?: string
  tone?: string
  length?: string
  reference?: string
  /** 글의 추천 독자(편집기 '추천 대상' 칸). 비면 기본 독자층. */
  audience?: string
  /** 함께 다룰 검색어(편집기 태그). */
  keywords?: string[]
  /** 글 끝에서 이어 줄 행동(연결한 자료 제목 등). 비면 기본 상담·쇼룸 안내. */
  closing?: string
  /** 다듬기: 글 전체가 아니라 선택한 구간만 보냈는지. */
  selection?: boolean
}

// 키는 편집기 선택지 값(한글) 그대로다.
const TONE_GUIDE: Record<string, string> = {
  전문적: "신뢰감 있는 전문가의 말투. 단정하되 과장하지 않는다.",
  친근한: "옆에서 설명해 주는 듯한 쉬운 말투. 문장을 짧게 끊는다.",
  스토리텔링: "한 학원의 구체적인 장면(수업 전·중·후)으로 시작해 이야기 흐름으로 풀어 간다. 인물·학원 이름은 지어내지 않는다.",
  설득형: "문제 → 원인 → 해법 → 다음 행동 순서로 설득한다. 겁을 주거나 보장하지 않는다.",
  정보형: "체크리스트·단계·비교 표 위주로 실무에 바로 쓰게 정리한다.",
}
const DEFAULT_TONE = "전문적"

// 분량 단위는 편집기 선택지와 같은 한국어 글자 수(공백 포함, 이미지 제외)다.
const LENGTH_GUIDE: Record<string, { chars: string; sections: string }> = {
  short: { chars: "약 1,500자", sections: "도입 + 본문 섹션 2개 + 마무리" },
  medium: { chars: "약 3,000자", sections: "도입 + 본문 섹션 3~4개 + 마무리" },
  long: { chars: "약 5,000자", sections: "도입 + 본문 섹션 5~6개 + 마무리" },
}

// 브랜드 보이스 헌장 §4(docs/active/brand-canon/voice-charter.md) 공통 금지 표현.
const BANNED_CLAIMS = [
  "학원 관리 기능을 모두 대체한다는 말",
  "결제·오프라인 출석까지 해결한다는 말",
  "AI가 학생 상태를 자동으로 완벽하게 파악한다는 말",
  "'가장 싸다', '무조건 절감' 같은 보장형 문구",
  "확인되지 않은 기관 수·보드 수·모델 스펙·가격·고객사 이름",
]

// 보이스 헌장 §1 코어 보이스(전 표면 공통). 다듬기·카드뉴스·릴스·초안이 모두 쓴다.
const CORE_VOICE = [
  "기능명보다 수업 전·중·후 운영 흐름과 줄어드는 업무로 설명한다.",
  "과장하지 않는다. 결제·오프라인 출석·고급 리포트는 '연동·별도·확인 범위'로 분리해 말한다.",
  "불안으로 끝내지 않고 다음 행동을 알려 준다.",
]

// 보이스 헌장 §3 블로그 줄 + §5 권장어. 초안만 쓴다.
const BLOG_VOICE = [
  "독자가 품을 반론 하나를 꺼내 정면으로 답한다(예: \"줌이면 충분하지 않나?\", \"전자칠판은 다 비슷하지 않나?\"). 관점을 바꿔 주는 글이 목표다.",
  "가치는 운영비, 강사 리소스, 수업 품질 표준화 관점으로 설명한다.",
  "문제를 직시해 긴장을 만들어도 되지만, 허위 공포나 보장하는 말은 쓰지 않는다.",
  `제품 범주는 '${CLASSIN_POSITIONING.categoryName}'로 부른다. 권장어(수업 운영 흐름, 강사 리소스 절감, 수업 품질 표준화, 감이 아니라 기준으로) 가운데 맞는 것을 1~2번 자연스럽게 쓴다. 억지로 끼우지 않는다.`,
]

// company-facts.md §3 ✅ 수치만. 투자·유니콘은 같은 문서가 '노출 전 법무 검토'를 걸어 둬서 뺐다.
const COMPANY_SCALE =
  "교육자·학습자 5,000만+, 160+개국, 교육기관 6만+, 월 3,000만+ 수업, 누적 2억+ 수업"
const COMPANY_SCALE_SOURCE = "전 세계 누적 · EEO 공식 소개 기준"

function bullets(lines: readonly string[]) {
  return lines.map((line) => `- ${line}`).join("\n")
}

/** 다듬기·카드뉴스·릴스에 붙는 짧은 브랜드 기준. */
function brandCoreBlock() {
  return `[브랜드 기준]
- 클래스인: ${CLASSIN_POSITIONING.oneLine}
${bullets(CORE_VOICE)}
- 쓰지 않을 표현: ${BANNED_CLAIMS.join("; ")}.`
}

const META_OPEN = "<!--meta"
const META_CLOSE = "-->"

function truncate(value: string | undefined, max: number) {
  return (value ?? "").trim().slice(0, max)
}

function buildCardNewsPrompt(title: string, content: string, category: string) {
  return `
You are a senior social content editor.
Turn the following blog post into a 6-8 slide card-news outline for Korean social media.

Title: ${title}
Category: ${category}
Content:
${content}

Output format:
- Slide 1: hook headline, subheadline, visual direction
- Slides 2-7: title, 2-3 key sentences, visual direction
- Final slide: CTA and account tag

Keep each slide focused on one idea and write all copy in Korean.
Use only facts, numbers, and product capabilities that appear in the post. Do not invent statistics, prices, or social handles — write [계정] where the account tag goes.
If the post has no clear CTA, use one of: ${CLASSIN_POSITIONING.primaryCtas.join(" / ")}.
Follow this brand guide in the Korean copy, and leave out any line of the post that breaks it:
${brandCoreBlock()}
`.trim()
}

function buildReelsPrompt(title: string, content: string, category: string) {
  return `
You are a short-form video script writer.
Turn the following blog post into a Korean short-form script under 60 seconds.

Title: ${title}
Category: ${category}
Content:
${content}

Output format:
- Hook (0-3s)
- Main point 1 (4-15s)
- Main point 2 (16-30s)
- Main point 3 (31-45s)
- CTA (46-60s)
- 15 hashtags max
- 3 title options

Keep lines spoken naturally and concise.
Use only facts, numbers, and product capabilities that appear in the post. Do not invent statistics or prices.
If the post has no clear CTA, use one of: ${CLASSIN_POSITIONING.primaryCtas.join(" / ")}.
Follow this brand guide in the Korean script, and leave out any line of the post that breaks it:
${brandCoreBlock()}
`.trim()
}

function buildOptimizePrompt(title: string, content: string, category: string, selection: boolean) {
  const scope = selection
    ? `아래는 글의 일부 구간이다. 이 구간만 다듬는다. 분량은 원문과 비슷하게 두고, 제목(#)을 새로 만들지 않는다.`
    : `아래 블로그 본문 전체를 발행할 수 있는 한국어 마크다운으로 다듬는다.`
  return `
너는 Classin(클래스인) 한국 블로그의 교정·편집자다.
${scope}

제목: ${title}
카테고리: ${category}
본문:
${content}

지킬 것:
- 다듬은 본문만 출력한다. 설명, 체크리스트, 제목 후보, 메타 설명, 코드 블록(\`\`\`)으로 감싸기 없이.
- 마크다운 이미지, HTML 미디어 블록, iframe, 영상, figure, [[CLASSIN_MEDIA_N]] 자리표시는 글자 하나 바꾸지 않고 같은 순서·같은 위치 근처에 둔다.
- 이 블로그의 표기는 그대로 살린다: \`{{green:문장}}\`(브랜드색 한 줄), \`==구절==\`(형광펜), \`---\`(구분선), \`> \`(인용). 감싼 기호를 지우거나 **굵게**로 바꾸지 않는다. 안의 문장만 다듬을 수 있다.
- 원문의 사실·수치·제품명·고객 사례·CTA 방향을 바꾸지 않는다. 원문에 없는 수치나 기능을 더하지 않는다.
- 맞춤법·문장 흐름·문단 호흡·소제목을 다듬는다. 문체는 합니다체, 제품명은 '클래스인'.
- 아래 브랜드 기준에 맞게 말투를 고른다. 원문 문장이 '쓰지 않을 표현'에 해당하면 지우거나 바꾸지 말고 그 문장 끝에 [확인 필요]를 붙인다.

${brandCoreBlock()}
`.trim()
}

function buildDraftPrompt(
  title: string,
  content: string,
  category: string,
  { topic = "", tone = DEFAULT_TONE, length = "medium", reference = "", audience = "", keywords = [], closing = "" }: BlogAiDraftParams
) {
  const toneGuide = TONE_GUIDE[tone] ?? TONE_GUIDE[DEFAULT_TONE]
  const lengthGuide = LENGTH_GUIDE[length] ?? LENGTH_GUIDE.medium
  const referenceText = reference.trim()
  const keywordText = keywords.map((k) => k.trim()).filter(Boolean).slice(0, 8).join(", ")
  const closingText = closing.trim()
    ? `${closing.trim()}로 자연스럽게 이어 준다.`
    : `다음 중 글과 가장 맞는 하나로 이어 준다: ${CLASSIN_POSITIONING.primaryCtas.join(" / ")}.`

  return `
너는 Classin(클래스인) 한국 지사 블로그의 에디터다. 학원 원장과 운영자가 읽고 바로 써먹을 수 있는 글을 쓴다.

[요청]
- 주제: ${topic || title || "학원 수업 운영 인사이트"}
- 카테고리: ${category || "인사이트"}
- 독자: ${audience.trim() || CLASSIN_POSITIONING.primaryAudience}
- 분량: 본문 ${lengthGuide.chars}(공백 포함). 구성: ${lengthGuide.sections}
- 톤: ${toneGuide}${keywordText ? `\n- 자연스럽게 녹일 검색어: ${keywordText}` : ""}${title.trim() && title.trim() !== topic.trim() ? `\n- 지금 제목(참고): ${title.trim()}` : ""}${content.trim() ? `\n- 지금 본문(참고, 살릴 내용만):\n${content.trim()}` : ""}

[근거 — 가장 중요]
${referenceText ? `- 아래 참고 자료가 이 글의 1차 근거다. 사실·수치·사례·기능은 참고 자료와 [브랜드 사실]·[제품 맥락]·[회사 수치]에서만 가져온다.\n참고 자료:\n---\n${referenceText}\n---` : "- 참고 자료가 없다. 사실·기능·수치는 [브랜드 사실]·[제품 맥락]·[회사 수치]에 있는 것만 쓴다."}
- 근거에 없는 수치·통계·가격·고객사·학원 이름·기능은 만들지 않는다. 꼭 필요하면 그 문장 끝에 [확인 필요]를 붙인다.
- 쓰지 않을 표현: ${BANNED_CLAIMS.join("; ")}.

[관점 — 이 블로그의 목소리]
${bullets([...CORE_VOICE, ...BLOG_VOICE])}

[브랜드 사실]
${getClassinPositioningContext()}
강점:
${bullets(CLASSIN_POSITIONING.strengths)}
비교할 때:
${bullets(CLASSIN_POSITIONING.comparisonPoints.map((item) => `${item.label}: ${item.point}`))}

[제품 맥락 — 기능을 말할 때 이 범위 안에서]
${bullets(CLASSIN_CHATBOT_REFERENCE.softwareContext)}
${bullets(CLASSIN_CHATBOT_REFERENCE.hardwareContext)}

[회사 수치 — 글의 논지에 회사 규모가 필요할 때만 한 번]
- 쓸 수 있는 값: ${COMPANY_SCALE}.
- 쓸 때는 같은 문장에 "(${COMPANY_SCALE_SOURCE})"을 붙인다. 한국 실적처럼 쓰지 않는다.
- 국내 도입 기관·보드 수, 투자·기업 가치, 위에 없는 회사 수치(언어 수·파트너 수 등)는 쓰지 않는다.

[형식 — 이 블로그의 표기 규칙]
- 첫 줄은 \`# 제목\` 한 줄(40자 안팎, 독자가 검색할 말 포함). 본문에는 다른 \`#\` 제목을 쓰지 않는다.
- 도입 2~3문단: 독자가 겪는 장면이나 질문으로 시작하고, 이 글에서 무엇을 얻는지 말한다.
- 섹션 사이에 \`---\` 한 줄. 섹션 제목은 \`## \`(필요하면 \`### \`), 질문형이나 주장형으로 짧게.
- 각 본문 섹션 끝에 그 섹션의 핵심을 한 문장으로 \`{{green:문장}}\` 형태로 쓴다.
- 꼭 기억할 짧은 구절만 \`==구절==\`로 형광펜(글 전체 2~4개). **굵게**는 섹션당 1~2번.
- 단계·체크 항목은 번호 목록, 비교는 표로. 핵심 질문 하나는 \`> \` 인용으로.
- 이미지가 들어가면 좋을 자리에 \`[이미지: 무엇을 보여 줄지]\` 한 줄을 2~4개 둔다.
- 문체는 합니다체, 제품명은 본문에서 '클래스인'.
- 마지막 섹션은 실천할 다음 단계 한두 개를 정리하고, ${closingText}

[출력]
글만 출력한다. 머리말·설명·코드 블록 없이. 글 맨 끝에 아래 블록을 정확히 이 모양으로 붙인다(편집기가 읽어 요약 칸을 채운다).
${META_OPEN}
요약: 목록 카드에 보일 두 문장(120자 안팎)
SEO 설명: 검색 결과 설명(80~110자)
얻는 것: 독자가 얻는 것 1 | 얻는 것 2 | 얻는 것 3
${META_CLOSE}
`.trim()
}

export function buildBlogAiPrompt(
  action: BlogAiAction,
  title: string,
  content: string,
  category: string,
  extra: BlogAiDraftParams
) {
  switch (action) {
    case "card-news":
      return buildCardNewsPrompt(title, content, category)
    case "reels":
      return buildReelsPrompt(title, content, category)
    case "optimize":
      return buildOptimizePrompt(title, content, category, Boolean(extra.selection))
    case "draft":
      return buildDraftPrompt(title, content, category, extra)
  }
}

/** 요청 본문 → 프롬프트 입력. 관리자 전용이지만 비용 폭주를 막으려고 길이를 자른다. */
export function readBlogAiRequest(body: Record<string, unknown>) {
  const str = (key: string, max: number) => truncate(typeof body[key] === "string" ? (body[key] as string) : "", max)
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.filter((k): k is string => typeof k === "string").map((k) => truncate(k, 40)).slice(0, 8)
    : []
  return {
    title: str("title", 200),
    content: str("content", 60_000),
    category: str("category", 40),
    extra: {
      topic: str("topic", 300),
      tone: str("tone", 20),
      length: str("length", 20),
      reference: str("reference", 12_000),
      audience: str("audience", 200),
      keywords,
      closing: str("closing", 200),
      selection: body.selection === true,
    } satisfies BlogAiDraftParams,
  }
}

export type BlogAiDraftResult = {
  title: string
  body: string
  excerpt: string
  seoDescription: string
  benefits: string[]
}

/**
 * AI 초안 결과 → 편집기 칸. `# 제목` 첫 줄은 제목 칸으로, 끝의 meta 블록은 요약·SEO·얻는 것 칸으로 보내고
 * 본문에서는 둘 다 뺀다. meta 블록이 없거나 깨져도 본문은 그대로 돌려준다.
 */
export function splitBlogAiDraft(raw: string): BlogAiDraftResult {
  let text = raw.trim()
  let excerpt = ""
  let seoDescription = ""
  let benefits: string[] = []

  const metaStart = text.lastIndexOf(META_OPEN)
  if (metaStart !== -1) {
    const metaEnd = text.indexOf(META_CLOSE, metaStart + META_OPEN.length)
    const meta = text.slice(metaStart + META_OPEN.length, metaEnd === -1 ? undefined : metaEnd)
    text = (text.slice(0, metaStart) + (metaEnd === -1 ? "" : text.slice(metaEnd + META_CLOSE.length))).trim()
    for (const line of meta.split("\n")) {
      const match = line.match(/^\s*(요약|SEO 설명|얻는 것)\s*[:：]\s*(.+)$/)
      if (!match) continue
      const value = match[2].trim()
      if (match[1] === "요약") excerpt = value
      else if (match[1] === "SEO 설명") seoDescription = value
      else benefits = value.split("|").map((item) => item.trim()).filter(Boolean).slice(0, 5)
    }
  }

  const lines = text.split("\n")
  const titleIndex = lines.findIndex((line) => /^#\s+\S/.test(line))
  const title = titleIndex === -1 ? "" : lines[titleIndex].replace(/^#\s+/, "").trim()
  if (titleIndex !== -1) lines.splice(titleIndex, 1)

  return { title, body: lines.join("\n").trim(), excerpt, seoDescription, benefits }
}
