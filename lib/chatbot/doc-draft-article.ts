type DraftCategory = "start" | "software" | "admin" | "teacher" | "student" | "hardware" | "board" | string

interface DocDraftInput {
  title: string
  contentMarkdown: string
  suggestedCategory: DraftCategory
}

export interface DocDraftArticlePayload {
  categoryId: string
  slug: string
  title: string
  description: string
  productArea: "general" | "software" | "hardware" | "billing" | "onboarding" | "classroom" | "admin" | "partner"
  docType: "faq"
  difficulty: "beginner"
  status: "draft"
  visibility: "unlisted"
  noindex: true
  tags: string[]
  keywords: string[]
  chatbotSummary: string
  contentMarkdown: string
}

const KNOWN_CATEGORY_IDS = new Set(["start", "software", "admin", "teacher", "student", "hardware", "board"])

function hashBase36(value: string) {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}

function asciiSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function categoryIdFor(value: DraftCategory) {
  const category = value.trim()
  return KNOWN_CATEGORY_IDS.has(category) ? category : "start"
}

function productAreaFor(categoryId: string): DocDraftArticlePayload["productArea"] {
  if (categoryId === "software") return "software"
  if (categoryId === "hardware" || categoryId === "board") return "hardware"
  if (categoryId === "admin") return "admin"
  if (categoryId === "teacher" || categoryId === "student") return "classroom"
  if (categoryId === "start") return "onboarding"
  return "general"
}

function withHeading(title: string, markdown: string) {
  const trimmed = markdown.trim()
  if (/^#\s+/m.test(trimmed)) return trimmed
  return `# ${title}\n\n${trimmed}`
}

export function buildDocDraftArticlePayload({
  draft,
  question,
}: {
  draft: DocDraftInput
  question: string
}): DocDraftArticlePayload {
  const title = draft.title.trim() || question.trim() || "챗봇 질문 답변 초안"
  const normalizedQuestion = question.trim()
  const categoryId = categoryIdFor(draft.suggestedCategory)
  const titleSlug = asciiSlug(title)
  const slugBase = titleSlug || `ai-draft-${hashBase36(`${title}:${normalizedQuestion}`)}`
  const slug = slugBase.slice(0, 70).replace(/-$/g, "")

  return {
    categoryId,
    slug,
    title,
    description: normalizedQuestion ? `${normalizedQuestion}에 대한 AI 초안입니다.` : `${title} 문서 초안입니다.`,
    productArea: productAreaFor(categoryId),
    docType: "faq",
    difficulty: "beginner",
    status: "draft",
    visibility: "unlisted",
    noindex: true,
    tags: Array.from(new Set(["AI 초안", "문서 보강", categoryId])),
    keywords: Array.from(new Set([normalizedQuestion, title].filter(Boolean))).slice(0, 6),
    chatbotSummary: normalizedQuestion
      ? `${normalizedQuestion}에 대한 답변 초안입니다.`
      : `${title}에 대한 답변 초안입니다.`,
    contentMarkdown: withHeading(title, draft.contentMarkdown),
  }
}
