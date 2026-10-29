import { getDocPath, type DocArticle, type DocMedia, type DocSection } from "@/lib/docs"
import { isListedDoc } from "@/lib/docs-content"
import {
  SITE_NAME,
  createArticleJsonLd,
  createBreadcrumbJsonLd,
  createFaqJsonLd,
  toAbsoluteUrl,
  type JsonLdNode,
} from "@/lib/seo"

/**
 * 가이드 문서(/docs/[category]/[slug])의 검색·답변 엔진용 데이터.
 *
 * - 구조화 데이터: 모든 문서에 Article(문제 해결 문서는 TechArticle)·BreadcrumbList,
 *   공개·색인 문서에만 HowTo(사용법) 또는 FAQPage(자주 묻는 질문)를 더한다.
 * - 공유 카드 이미지(og:image)와 이미지 사이트맵 항목.
 *
 * 값은 모두 DocArticle 필드(sections[].heading/body/steps/media 등)에서 계산한다. 정적 문서와
 * 운영 DB 문서가 같은 모양이므로 어느 쪽에서 와도 같은 규칙이 적용된다.
 */

// ---------------------------------------------------------------------------
// 공통: 공개 여부·텍스트 정리·이미지
// ---------------------------------------------------------------------------

/**
 * 색인 대상 문서인지. 목록·사이트맵과 같은 기준(공개 + noindex 아님)에 발행 상태와
 * 정식 주소(canonicalPath 가 다른 주소를 가리키면 이 페이지는 사본이다)를 더 본다.
 */
export function isDocIndexable(doc: DocArticle): boolean {
  if (!isListedDoc(doc)) return false
  if (doc.status && doc.status !== "published") return false
  return isOwnCanonical(doc)
}

function isOwnCanonical(doc: Pick<DocArticle, "category" | "slug" | "canonicalPath">): boolean {
  const canonicalPath = doc.canonicalPath?.trim()
  if (!canonicalPath) return true
  try {
    return toAbsoluteUrl(canonicalPath) === toAbsoluteUrl(getDocPath(doc))
  } catch {
    return false
  }
}

/**
 * 문서 본문 마크다운을 구조화 데이터에 넣을 일반 텍스트로 바꾼다.
 * 링크는 글자만, 이미지·HTML 태그·강조 기호·인용/목록 기호·표 구분선은 지운다.
 * 화면 버튼 이름을 가리키는 대괄호([회원 가입])는 본문 그대로 남긴다.
 */
export function docMarkdownToPlainText(markdown: string | null | undefined): string {
  if (!markdown) return ""

  const lines = markdown
    .replace(/\r\n?/g, "\n")
    // 코드 블록 울타리만 지우고 안의 글자는 남긴다.
    .replace(/^\s*```[^\n]*$/gm, "")
    .split("\n")
    .map((line) => {
      let text = line.trim()
      if (!text) return ""
      // 표 구분선(|---|:---:|)은 버린다.
      if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(text)) return ""
      // 표 행은 칸을 " / " 로 잇는다.
      if (/^\|.*\|$/.test(text)) {
        text = text
          .slice(1, -1)
          .split("|")
          .map((cell) => cell.trim())
          .filter(Boolean)
          .join(" / ")
      }
      return text
        .replace(/^#{1,6}\s+/, "")
        .replace(/^(?:>\s?)+/, "")
        .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
    })

  return lines
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\((?:[^()\s]|\([^()]*\))+(?:\s+"[^"]*")?\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

const RASTER_IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif|avif)$/i

export interface DocImage {
  /** 절대 URL */
  url: string
  alt: string
  caption?: string
  width?: number
  height?: number
}

function readImagePathname(src: string): string | null {
  try {
    return new URL(src, toAbsoluteUrl("/")).pathname
  } catch {
    return null
  }
}

/** 사진(비트맵) 이미지만. 도식 SVG·동영상·data URL 은 공유 카드·사이트맵·HowTo 이미지에 맞지 않아 뺀다. */
function isPhotoMedia(media: DocMedia): boolean {
  if (media.type !== "image") return false
  const src = media.src?.trim()
  if (!src || src.startsWith("data:")) return false
  const pathname = readImagePathname(src)
  return pathname !== null && RASTER_IMAGE_EXTENSION.test(pathname)
}

function toDocImage(media: DocMedia): DocImage | null {
  try {
    const url = toAbsoluteUrl(media.src.trim())
    if (!/^https?:\/\//.test(url)) return null
    return {
      url,
      alt: media.alt?.trim() ?? "",
      ...(media.caption?.trim() ? { caption: media.caption.trim() } : {}),
      ...(isPositiveNumber(media.width) ? { width: media.width } : {}),
      ...(isPositiveNumber(media.height) ? { height: media.height } : {}),
    }
  } catch {
    return null
  }
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function listSectionImages(section: DocSection): DocImage[] {
  return (section.media ?? [])
    .filter(isPhotoMedia)
    .map(toDocImage)
    .filter((image): image is DocImage => image !== null)
}

/** 문서에 실린 사진을 본문 순서대로(같은 주소는 한 번만) 모은다. */
export function listDocImages(doc: Pick<DocArticle, "sections">): DocImage[] {
  const seen = new Set<string>()
  const images: DocImage[] = []
  for (const section of doc.sections) {
    for (const image of listSectionImages(section)) {
      if (seen.has(image.url)) continue
      seen.add(image.url)
      images.push(image)
    }
  }
  return images
}

// ---------------------------------------------------------------------------
// 공유 카드 이미지(og:image)
// ---------------------------------------------------------------------------

// 공유 카드는 가로 1.91:1(페이스북·카카오)·2:1(X)로 잘린다. 세로로 긴 휴대폰 화면이나 알림 막대처럼
// 아주 납작한 사진은 잘리면 내용이 사라져서, 크기를 아는 사진은 가로형·충분한 크기만 고른다.
const OG_IMAGE_MIN_WIDTH = 600
const OG_IMAGE_MIN_HEIGHT = 300
const OG_IMAGE_MIN_RATIO = 0.9
const OG_IMAGE_MAX_RATIO = 2.7

function fitsShareCard(image: DocImage): boolean {
  if (!image.width || !image.height) return true
  const ratio = image.width / image.height
  return (
    image.width >= OG_IMAGE_MIN_WIDTH &&
    image.height >= OG_IMAGE_MIN_HEIGHT &&
    ratio >= OG_IMAGE_MIN_RATIO &&
    ratio <= OG_IMAGE_MAX_RATIO
  )
}

/**
 * 공유 카드에 쓸 문서 사진. 본문에 나오는 순서로 첫 번째로 카드에 맞는 사진을 고르고,
 * 맞는 사진이 없으면 null(호출부가 기본 브랜드 이미지를 쓴다).
 */
export function pickDocShareImage(doc: Pick<DocArticle, "sections">): DocImage | null {
  return listDocImages(doc).find(fitsShareCard) ?? null
}

// ---------------------------------------------------------------------------
// 이미지 사이트맵
// ---------------------------------------------------------------------------

export const DOC_SITEMAP_IMAGE_LIMIT = 5

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/**
 * 사이트맵 `<image:loc>` 에 넣을 문서 사진 주소(최대 5장). 색인 대상 문서만 돌려주고 나머지는 빈 배열.
 * Next 사이트맵 생성기는 images 값을 이스케이프하지 않고 XML 에 그대로 쓰므로 여기서 이스케이프한다.
 */
export function getDocSitemapImages(doc: DocArticle, limit = DOC_SITEMAP_IMAGE_LIMIT): string[] {
  if (!isDocIndexable(doc)) return []
  return listDocImages(doc)
    .slice(0, limit)
    .map((image) => escapeXml(image.url))
}

// ---------------------------------------------------------------------------
// 구조화 데이터
// ---------------------------------------------------------------------------

/** 문제 해결 문서는 증상별 해결 묶음이라 하나의 절차(HowTo)가 아니다. Article 의 하위 유형 TechArticle 로 낸다. */
export function getDocArticleSchemaType(doc: Pick<DocArticle, "docType">): "Article" | "TechArticle" {
  return doc.docType === "troubleshooting" ? "TechArticle" : "Article"
}

// 단계 목록이 절차가 아니라 다른 문서 안내인 섹션은 HowTo 단계에서 뺀다.
const NON_PROCEDURE_HEADING = /^(?:관련 문서|다음에 볼 문서|함께 (?:보면 좋은|볼) 문서|참고 문서|더 읽어 보기)/

// 사용법(HowTo) 대상 문서 유형. 유형이 비어 있는 오래된 문서도 사용법으로 본다.
const HOW_TO_DOC_TYPES = new Set<DocArticle["docType"]>([undefined, "guide", "manual"])
const HOW_TO_MIN_STEPS = 2

// 단계 목록이 사양·특징 나열이 아니라 화면 조작 순서인지 가리는 동작 표현. 섹션 단계의 절반 이상이 이런 문장이거나
// 제목이 "…하기"처럼 할 일을 말하면 절차 섹션으로 본다(사양 문서·소개 문서가 HowTo 로 잡히지 않게 한다).
const ACTION_STEP =
  /(?:경로\s*:|누릅니다|누르고|누르면|눌러|클릭|탭합니다|터치합니다|고릅니다|고르고|골라|선택합니다|선택하고|입력합니다|입력하고|넣습니다|엽니다|열고|열어|들어갑니다|들어가|켭니다|켜고|끕니다|끄고|바꿉니다|바꾸고|정합니다|정하고|추가합니다|추가하고|올립니다|올리고|내려받|저장합니다|저장하고|체크합니다|체크하고|실행합니다|실행하고|설치합니다|만듭니다|만들고|확인합니다|보냅니다|붙입니다|드래그|끌어)/
const PROCEDURE_HEADING = /(?:하기|순서|방법|따라 하기)$/

function isProcedureSection(section: DocSection, steps: string[]): boolean {
  if (steps.length === 0) return false
  if (PROCEDURE_HEADING.test(docMarkdownToPlainText(section.heading))) return true
  const actionSteps = steps.filter((step) => ACTION_STEP.test(step)).length
  return actionSteps * 2 >= steps.length
}

function toBigrams(text: string): Set<string> {
  const compact = text.replace(/[\s.,:;!?()[\]<>"'·…>→-]+/g, "").toLowerCase()
  const bigrams = new Set<string>()
  for (let index = 0; index < compact.length - 1; index += 1) {
    bigrams.add(compact.slice(index, index + 2))
  }
  return bigrams
}

function overlapRatio(reference: Set<string>, candidate: Set<string>): number {
  if (reference.size === 0) return 0
  let shared = 0
  for (const bigram of reference) if (candidate.has(bigram)) shared += 1
  return shared / reference.size
}

const STEP_IMAGE_MIN_OVERLAP = 0.35
const STEP_IMAGE_MIN_MARGIN = 0.08

/**
 * 섹션 사진을 그 사진이 설명하는 단계에 붙인다. 사진은 섹션 끝에 모여 있어 어느 단계 화면인지 데이터에 없으므로,
 * 사진 설명(캡션, 없으면 대체 텍스트)과 단계 글이 뚜렷하게 겹칠 때만 그 단계에 붙이고 나머지는 섹션에 남긴다.
 * 돌려주는 stepImages[i] 는 i 번째 단계에 붙일 사진, sectionImages 는 어느 단계인지 가리기 어려운 사진이다.
 */
export function matchSectionImagesToSteps(
  steps: string[],
  images: DocImage[]
): { stepImages: DocImage[][]; sectionImages: DocImage[] } {
  const stepBigrams = steps.map((step) => toBigrams(step))
  const stepImages: DocImage[][] = steps.map(() => [])
  const sectionImages: DocImage[] = []

  for (const image of images) {
    const reference = toBigrams(image.caption || image.alt)
    const scores = stepBigrams.map((bigrams) => overlapRatio(reference, bigrams))
    const ranked = scores
      .map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a.score)
    const best = ranked[0]
    const runnerUp = ranked[1]?.score ?? 0
    if (best && best.score >= STEP_IMAGE_MIN_OVERLAP && best.score - runnerUp >= STEP_IMAGE_MIN_MARGIN) {
      stepImages[best.index].push(image)
    } else {
      sectionImages.push(image)
    }
  }

  return { stepImages, sectionImages }
}

function toImageValue(images: DocImage[]): string | string[] | undefined {
  if (images.length === 0) return undefined
  return images.length === 1 ? images[0].url : images.map((image) => image.url)
}

interface HowToStepNode extends JsonLdNode {
  "@type": "HowToStep"
}

function buildHowToSteps(section: DocSection): { steps: HowToStepNode[]; sectionImages: DocImage[] } {
  const entries = (section.steps ?? [])
    .map((step) => docMarkdownToPlainText(step))
    .filter((text) => text.length > 0)
  const { stepImages, sectionImages } = matchSectionImagesToSteps(entries, listSectionImages(section))

  const steps = entries.map((text, index) => {
    const image = toImageValue(stepImages[index])
    return {
      "@type": "HowToStep" as const,
      position: index + 1,
      text,
      ...(image ? { image } : {}),
    }
  })
  return { steps, sectionImages }
}

/**
 * 사용법 문서의 HowTo. 공개·색인 문서이고, 사용법 유형이며, 단계가 2개 이상이고, 화면 사진이 1장 이상일 때만 만든다.
 * 섹션마다 단계 묶음(HowToSection)을 두고, 단계가 있는 섹션이 하나뿐이면 단계를 바로 싣는다.
 */
export function createDocHowToJsonLd(doc: DocArticle): JsonLdNode | null {
  if (!isDocIndexable(doc)) return null
  if (!HOW_TO_DOC_TYPES.has(doc.docType)) return null

  const docImages = listDocImages(doc)
  if (docImages.length === 0) return null

  const sections = doc.sections
    .filter((section) => !NON_PROCEDURE_HEADING.test(section.heading.trim()))
    .map((section) => ({ section, ...buildHowToSteps(section) }))
    .filter((entry) =>
      isProcedureSection(
        entry.section,
        entry.steps.map((node) => String(node.text))
      )
    )

  const stepCount = sections.reduce((sum, entry) => sum + entry.steps.length, 0)
  if (stepCount < HOW_TO_MIN_STEPS) return null

  const url = toAbsoluteUrl(getDocPath(doc))
  // 단계가 있는 섹션이 하나면 단계를 바로 싣는다. 이때 어느 단계인지 못 가린 사진은 HowTo 대표 이미지(image)로만 남는다.
  const step =
    sections.length === 1
      ? sections[0].steps
      : sections.map(({ section, steps, sectionImages }, index) => {
          const image = toImageValue(sectionImages)
          return {
            "@type": "HowToSection",
            position: index + 1,
            name: docMarkdownToPlainText(section.heading),
            ...(image ? { image } : {}),
            itemListElement: steps,
          }
        })

  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${url}#howto`,
    name: doc.title,
    description: docMarkdownToPlainText(doc.description),
    inLanguage: "ko-KR",
    mainEntityOfPage: url,
    image: docImages[0].url,
    step,
  }
}

const INTERROGATIVE = /(?:무엇|뭘|뭐|어떻게|어떤|어느|왜|언제|어디|누가|누구|몇|얼마)/
const QUESTION_ENDING = /(?:[가까니나]|나요|가요|까요|는지|을지|인지|한지)$/

/** "…나요?" 처럼 물음표로 끝나거나, 의문사가 있고 물음형 어미로 끝나는 제목을 질문으로 본다. */
export function isQuestionHeading(heading: string): boolean {
  const text = docMarkdownToPlainText(heading)
  if (!text) return false
  if (/[?？]$/.test(text)) return true
  return INTERROGATIVE.test(text) && QUESTION_ENDING.test(text)
}

const LEADING_QUESTION = /^([^?？]{2,200}[?？])\s+/

/**
 * "학생은 앱에서 가입하나요? 네. …" 처럼 질문 문장으로 시작하는 항목을 질문과 답으로 나눈다.
 * 질문 문장이 여러 개 이어지면 모두 질문으로 묶는다. 화면 버튼 이름 안의 물음표([비밀번호를 잊으셨나요?])는 질문으로 보지 않는다.
 */
export function splitLeadingQuestion(text: string): { question: string; answer: string } | null {
  let rest = docMarkdownToPlainText(text)
  const questions: string[] = []

  for (let match = LEADING_QUESTION.exec(rest); match; match = LEADING_QUESTION.exec(rest)) {
    const sentence = match[1].trim()
    const opens = (sentence.match(/\[/g) ?? []).length
    const closes = (sentence.match(/\]/g) ?? []).length
    // 앞 문장이 끝난 뒤(마침표) 나온 물음표는 질문 문장이 아니다.
    if (opens !== closes || /[.!。]\s/.test(sentence)) break
    questions.push(sentence)
    rest = rest.slice(match[0].length)
  }

  const answer = rest.trim()
  if (questions.length === 0 || !answer) return null
  return { question: questions.join(" "), answer }
}

const FAQ_MIN_ITEMS = 2

/** 자주 묻는 질문 문서(docType "faq")에서 화면에 보이는 질문과 답을 뽑는다. */
export function extractDocFaqItems(doc: DocArticle): Array<{ question: string; answer: string }> {
  const items: Array<{ question: string; answer: string }> = []
  const seen = new Set<string>()
  const push = (question: string, answer: string) => {
    const key = question.replace(/\s+/g, "")
    if (!question || !answer || seen.has(key)) return
    seen.add(key)
    items.push({ question, answer })
  }

  for (const section of doc.sections) {
    if (isQuestionHeading(section.heading)) {
      const answer = [section.body, ...(section.steps ?? [])]
        .map((part) => docMarkdownToPlainText(part))
        .filter(Boolean)
        .join(" ")
      push(docMarkdownToPlainText(section.heading), answer)
      continue
    }
    for (const step of section.steps ?? []) {
      const pair = splitLeadingQuestion(step)
      if (pair) push(pair.question, pair.answer)
    }
  }

  return items
}

/** 자주 묻는 질문 문서의 FAQPage. 공개·색인 문서이고 질문·답이 2개 이상일 때만 만든다. */
export function createDocFaqJsonLd(doc: DocArticle): JsonLdNode | null {
  if (!isDocIndexable(doc) || doc.docType !== "faq") return null
  const items = extractDocFaqItems(doc)
  if (items.length < FAQ_MIN_ITEMS) return null

  const url = toAbsoluteUrl(getDocPath(doc))
  return {
    ...createFaqJsonLd(items),
    "@id": `${url}#faq`,
    url,
    name: doc.title,
    inLanguage: "ko-KR",
  }
}

/**
 * 문서 상세 페이지의 JSON-LD 전체. Article(또는 TechArticle)·BreadcrumbList 는 모든 문서에 싣고,
 * 공개·색인 문서에는 HowTo 또는 FAQPage 를 더한다.
 */
export function createDocStructuredData({
  doc,
  categoryTitle,
  categoryPath,
}: {
  doc: DocArticle
  categoryTitle: string
  categoryPath: string
}): JsonLdNode[] {
  const path = getDocPath(doc)
  const shareImage = pickDocShareImage(doc)

  const article: JsonLdNode = {
    ...createArticleJsonLd({
      path,
      title: doc.title,
      description: doc.description,
      dateModified: doc.updatedAt,
      imageUrl: shareImage?.url,
      authorName: SITE_NAME,
    }),
    "@type": getDocArticleSchemaType(doc),
  }

  const nodes: JsonLdNode[] = [
    article,
    createBreadcrumbJsonLd([
      { name: "홈", path: "/" },
      { name: "가이드", path: "/docs" },
      { name: categoryTitle, path: categoryPath },
      { name: doc.title, path },
    ]),
  ]

  const faq = createDocFaqJsonLd(doc)
  if (faq) nodes.push(faq)
  else {
    const howTo = createDocHowToJsonLd(doc)
    if (howTo) nodes.push(howTo)
  }

  return nodes
}
