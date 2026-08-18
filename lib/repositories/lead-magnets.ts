// Lead Magnets Repository — JSON ↔ Supabase 듀얼 모드(2026-08-18 이관)
// 블로그(2026-06 이관)와 같은 모델: 운영(Vercel)에서는 read-only 파일시스템이라 JSON 쓰기가
// 불가능하므로 항상 Supabase를 쓰고, JSON 모드는 로컬 개발/테스트 전용이다.
// 문서 구조가 깊어 행 = slug + 전체 JSONB 문서로 저장하고, 읽기는 기존 normalizeLeadMagnet을
// 그대로 태워 두 모드의 결과가 동일하다. 기존 데이터: scripts/import-lead-magnets.mjs 로 이관.
import "server-only"

import { readFile, writeFile } from "fs/promises"
import path from "path"

import { assertLocalJsonWriteAllowed } from "@/lib/server/runtime-persistence"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

import type {
  LeadMagnet,
  LeadMagnetActionStep,
  LeadMagnetCaseCard,
  LeadMagnetCategory,
  LeadMagnetExpertVoice,
  LeadMagnetGate,
  LeadMagnetPdfGuide,
  LeadMagnetScoreBand,
  LeadMagnetScriptSample,
  LeadMagnetSection,
  LeadMagnetSourceLink,
  LeadMagnetStatus,
  LeadMagnetStoryGuide,
  LeadMagnetTier,
  LeadMagnetWorksheet,
  LeadMagnetWorksheetRow,
} from "@/lib/lead-magnets"

const DATA_PATH = path.join(process.cwd(), "data", "lead-magnets.json")

/** 모드 판정 — leads.ts의 shouldUseSupabaseLeads와 동일 규칙(테스트 가능하게 env 주입). */
export function shouldUseSupabaseLeadMagnets(
  env: Record<string, string | undefined> = process.env
) {
  const isVercelRuntime =
    env.VERCEL === "1" ||
    Boolean(env.VERCEL_ENV) ||
    Boolean(env.VERCEL_URL) ||
    Boolean(env.NEXT_PUBLIC_VERCEL_URL)

  return env.USE_SUPABASE_LEAD_MAGNETS === "true" || isVercelRuntime
}

const USE_SUPABASE = shouldUseSupabaseLeadMagnets()
const TABLE = "lead_magnets"
const DUPLICATE_SLUG_MESSAGE = "이미 사용 중인 리드마그넷 슬러그입니다."

const STATUS_VALUES = new Set<LeadMagnetStatus>(["draft", "review", "unlisted"])
const GATE_VALUES = new Set<LeadMagnetGate>(["open", "email", "login"])
const TIER_VALUES = new Set<LeadMagnetTier>(["basic", "advanced"])
const CATEGORY_VALUES = new Set<LeadMagnetCategory>([
  "operations",
  "hardware",
  "software",
  "case-study",
  "security",
])

export type LeadMagnetInput = LeadMagnet

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback
}

function numberValue(value: unknown, fallback = 10) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.round(value)) : fallback
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean)
    : []
}

function normalizeSlug(value: unknown, fallbackTitle = "resource") {
  const source = stringValue(value, fallbackTitle)
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "resource"
}

function oneOf<T extends string>(value: unknown, allowed: Set<T>, fallback: T) {
  return typeof value === "string" && allowed.has(value as T) ? value as T : fallback
}

function normalizeSections(value: unknown): LeadMagnetSection[] {
  if (!Array.isArray(value)) return []
  return value.map((raw) => {
    const item = asRecord(raw)
    return {
      title: stringValue(item.title, "점검 영역"),
      description: stringValue(item.description),
      items: stringArray(item.items),
    }
  }).filter((section) => section.title && section.items.length > 0)
}

function normalizeScoreBands(value: unknown): LeadMagnetScoreBand[] {
  if (!Array.isArray(value)) return []
  return value.map((raw) => {
    const item = asRecord(raw)
    return {
      range: stringValue(item.range),
      label: stringValue(item.label),
      description: stringValue(item.description),
    }
  }).filter((band) => band.range && band.label)
}

function normalizeActionPlan(value: unknown): LeadMagnetActionStep[] {
  if (!Array.isArray(value)) return []
  return value.map((raw) => {
    const item = asRecord(raw)
    return {
      day: stringValue(item.day),
      title: stringValue(item.title),
      tasks: stringArray(item.tasks),
    }
  }).filter((step) => step.day && step.title)
}

function normalizeSourceLinks(value: unknown): LeadMagnetSourceLink[] {
  if (!Array.isArray(value)) return []
  return value.map((raw) => {
    const item = asRecord(raw)
    return {
      label: stringValue(item.label),
      href: stringValue(item.href),
      description: stringValue(item.description),
    }
  }).filter((link) => link.label && link.href)
}

function normalizePdfGuide(value: unknown): LeadMagnetPdfGuide | undefined {
  const raw = asRecord(value)
  if (Object.keys(raw).length === 0) return undefined
  return {
    subtitle: stringValue(raw.subtitle),
    outcome: stringValue(raw.outcome),
    bestUsedWhen: stringArray(raw.bestUsedWhen),
    howToUse: stringArray(raw.howToUse),
    discussionPrompts: stringArray(raw.discussionPrompts),
    relatedMagnets: stringArray(raw.relatedMagnets),
    consultationCtas: normalizeSourceLinks(raw.consultationCtas),
    expertNote: stringValue(raw.expertNote),
  }
}

function normalizeStoryGuide(value: unknown): LeadMagnetStoryGuide | undefined {
  const raw = asRecord(value)
  if (Object.keys(raw).length === 0) return undefined

  const beats = stringArray(raw.beats)
  const story = {
    eyebrow: stringValue(raw.eyebrow),
    title: stringValue(raw.title),
    body: stringValue(raw.body),
    beats,
    takeaway: stringValue(raw.takeaway),
  }

  if (!story.title || !story.body || beats.length === 0) return undefined
  return story
}

function normalizeExpertVoice(value: unknown): LeadMagnetExpertVoice | undefined {
  const raw = asRecord(value)
  const speaker = stringValue(raw.speaker)
  const comment = stringValue(raw.comment)
  if (!speaker || !comment) return undefined
  const role = stringValue(raw.role)
  return role ? { speaker, role, comment } : { speaker, comment }
}

function normalizeWorksheetRows(value: unknown): LeadMagnetWorksheetRow[] {
  if (!Array.isArray(value)) return []
  return value
    .map((raw) => {
      const item = asRecord(raw)
      const label = stringValue(item.label)
      if (!label) return null
      const row: LeadMagnetWorksheetRow = { label }
      const hint = stringValue(item.hint)
      if (hint) row.hint = hint
      if (booleanValue(item.highlight)) row.highlight = true
      return row
    })
    .filter((row): row is LeadMagnetWorksheetRow => row !== null)
}

function normalizeWorksheet(value: unknown): LeadMagnetWorksheet | undefined {
  const raw = asRecord(value)
  if (Object.keys(raw).length === 0) return undefined
  const columns = stringArray(raw.columns)
  const rows = normalizeWorksheetRows(raw.rows)
  if (columns.length === 0 || rows.length === 0) return undefined
  const worksheet: LeadMagnetWorksheet = {
    title: stringValue(raw.title, "계산표"),
    columns,
    rows,
  }
  const intro = stringValue(raw.intro)
  if (intro) worksheet.intro = intro
  const formula = stringValue(raw.formula)
  if (formula) worksheet.formula = formula
  const note = stringValue(raw.note)
  if (note) worksheet.note = note
  return worksheet
}

function normalizeCaseCards(value: unknown): LeadMagnetCaseCard[] {
  if (!Array.isArray(value)) return []
  return value
    .map((raw) => {
      const item = asRecord(raw)
      const label = stringValue(item.label)
      const profile = stringValue(item.profile)
      const challenge = stringValue(item.challenge)
      const change = stringValue(item.change)
      if (!label || !change) return null
      const card: LeadMagnetCaseCard = { label, profile, challenge, change }
      const quote = stringValue(item.quote)
      if (quote) card.quote = quote
      return card
    })
    .filter((card): card is LeadMagnetCaseCard => card !== null)
}

function normalizeScriptSamples(value: unknown): LeadMagnetScriptSample[] {
  if (!Array.isArray(value)) return []
  return value
    .map((raw) => {
      const item = asRecord(raw)
      const scenario = stringValue(item.scenario)
      const good = stringValue(item.good)
      if (!scenario || !good) return null
      const sample: LeadMagnetScriptSample = { scenario, good }
      const avoid = stringValue(item.avoid)
      if (avoid) sample.avoid = avoid
      const why = stringValue(item.why)
      if (why) sample.why = why
      return sample
    })
    .filter((sample): sample is LeadMagnetScriptSample => sample !== null)
}

export function normalizeLeadMagnet(input: unknown): LeadMagnet {
  const raw = asRecord(input)
  const title = stringValue(raw.title, "새 자료")
  const slug = normalizeSlug(raw.slug, title)
  const sections = normalizeSections(raw.sections)
  const checklistBullets = stringArray(raw.checklistBullets)
  const sourceDetail = stringValue(raw.sourceDetail, `lead_magnet:${slug}`)
  const salesPlaybook = asRecord(raw.salesPlaybook)

  return {
    slug,
    title,
    audience: stringValue(raw.audience, "학원 원장, 운영팀"),
    status: oneOf(raw.status, STATUS_VALUES, "draft"),
    gate: oneOf(raw.gate, GATE_VALUES, "email"),
    tier: oneOf(raw.tier, TIER_VALUES, "basic"),
    category: oneOf(raw.category, CATEGORY_VALUES, "operations"),
    published: booleanValue(raw.published, false),
    sourceDetail: sourceDetail.startsWith("lead_magnet:") ? sourceDetail as `lead_magnet:${string}` : `lead_magnet:${slug}`,
    summary: stringValue(raw.summary),
    formatLabel: stringValue(raw.formatLabel, `${sections.reduce((total, section) => total + section.items.length, 0)}문항 자료`),
    estimatedMinutes: numberValue(raw.estimatedMinutes, 10),
    blogTone: stringValue(raw.blogTone),
    guideTone: stringValue(raw.guideTone),
    checklistBullets: checklistBullets.length > 0 ? checklistBullets : sections.flatMap((section) => section.items).slice(0, 5),
    sections,
    scoreBands: normalizeScoreBands(raw.scoreBands),
    redFlags: stringArray(raw.redFlags),
    actionPlan: normalizeActionPlan(raw.actionPlan),
    deliverables: stringArray(raw.deliverables),
    consultationPrep: stringArray(raw.consultationPrep),
    sourceLinks: normalizeSourceLinks(raw.sourceLinks),
    storyGuide: normalizeStoryGuide(raw.storyGuide),
    pdfGuide: normalizePdfGuide(raw.pdfGuide),
    expertVoice: normalizeExpertVoice(raw.expertVoice),
    worksheet: normalizeWorksheet(raw.worksheet),
    caseCards: normalizeCaseCards(raw.caseCards),
    scriptSamples: normalizeScriptSamples(raw.scriptSamples),
    salesPlaybook: {
      intentScore: Math.max(0, Math.min(40, numberValue(salesPlaybook.intentScore, 15))),
      intentLabel: stringValue(salesPlaybook.intentLabel, "자료 관심 리드"),
      ownerNote: stringValue(salesPlaybook.ownerNote),
      firstResponse: stringValue(salesPlaybook.firstResponse),
      qualificationQuestions: stringArray(salesPlaybook.qualificationQuestions),
      followUpSequence: normalizeActionPlan(salesPlaybook.followUpSequence),
      nextCtas: stringArray(salesPlaybook.nextCtas),
    },
    ctaCopy: {
      eyebrow: stringValue(asRecord(raw.ctaCopy).eyebrow, "무료 자료"),
      title: stringValue(asRecord(raw.ctaCopy).title, title),
      body: stringValue(asRecord(raw.ctaCopy).body, stringValue(raw.summary)),
      buttonLabel: stringValue(asRecord(raw.ctaCopy).buttonLabel, "자료 보기"),
    },
    resourceUrl: stringValue(raw.resourceUrl, `/resources/${slug}`),
    storagePath: stringValue(raw.storagePath),
    suggestedPlacements: stringArray(raw.suggestedPlacements),
  }
}

async function readAllFromJson() {
  const raw = await readFile(DATA_PATH, "utf8")
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error("[lead-magnets] data file must be an array")
  return parsed.map(normalizeLeadMagnet)
}

async function readAllFromSupabase() {
  // created_at 오름차순 = JSON 배열의 삽입 순서 유지(목록·크로스링크 순서 보존).
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .select("data")
    .order("created_at", { ascending: true })
  if (error) throw new Error(`[lead-magnets] 목록 조회 실패: ${error.message}`)
  return (data ?? []).map((row) => normalizeLeadMagnet(row.data))
}

export async function getAllLeadMagnets() {
  return USE_SUPABASE ? readAllFromSupabase() : readAllFromJson()
}

export async function getPublishedLeadMagnets() {
  const magnets = await getAllLeadMagnets()
  return magnets.filter((magnet) => magnet.published)
}

export async function getLeadMagnetBySlugFromStore(slug: string | null | undefined) {
  if (!slug) return null
  const magnets = await getAllLeadMagnets()
  return magnets.find((magnet) => magnet.slug === slug) ?? null
}

export async function getLeadMagnetTitleFromStore(slug: string | null | undefined) {
  return (await getLeadMagnetBySlugFromStore(slug))?.title ?? ""
}

async function writeLeadMagnets(magnets: LeadMagnet[]) {
  assertLocalJsonWriteAllowed("lead-magnets")
  await writeFile(DATA_PATH, `${JSON.stringify(magnets, null, 2)}\n`, "utf8")
}

export async function createLeadMagnet(input: unknown) {
  const magnet = normalizeLeadMagnet(input)

  if (!USE_SUPABASE) {
    const magnets = await readAllFromJson()
    if (magnets.some((item) => item.slug === magnet.slug)) {
      throw new Error(DUPLICATE_SLUG_MESSAGE)
    }
    await writeLeadMagnets([...magnets, magnet])
    return magnet
  }

  const { error } = await createSupabaseAdminClient()
    .from(TABLE)
    .insert({ slug: magnet.slug, data: magnet, published: magnet.published })
  if (error) {
    if (error.code === "23505") throw new Error(DUPLICATE_SLUG_MESSAGE)
    throw new Error(`[lead-magnets] 생성 실패: ${error.message}`)
  }
  return magnet
}

export async function updateLeadMagnet(slug: string, input: unknown) {
  const updated = normalizeLeadMagnet(input)

  if (!USE_SUPABASE) {
    const magnets = await readAllFromJson()
    const index = magnets.findIndex((item) => item.slug === slug)
    if (index < 0) return null

    const conflict = magnets.some(
      (item, itemIndex) => itemIndex !== index && item.slug === updated.slug
    )
    if (conflict) {
      throw new Error(DUPLICATE_SLUG_MESSAGE)
    }

    const next = [...magnets]
    next[index] = updated
    await writeLeadMagnets(next)
    return updated
  }

  const sb = createSupabaseAdminClient()
  const { data: existing, error: readError } = await sb
    .from(TABLE)
    .select("slug")
    .eq("slug", slug)
    .maybeSingle()
  if (readError) throw new Error(`[lead-magnets] 조회 실패: ${readError.message}`)
  if (!existing) return null

  // 슬러그 변경 허용 계약 유지 — PK 교체 전에 충돌을 미리 확인해 기존 오류 문구를 보존한다.
  if (updated.slug !== slug) {
    const { data: conflict, error: conflictError } = await sb
      .from(TABLE)
      .select("slug")
      .eq("slug", updated.slug)
      .maybeSingle()
    if (conflictError) throw new Error(`[lead-magnets] 조회 실패: ${conflictError.message}`)
    if (conflict) throw new Error(DUPLICATE_SLUG_MESSAGE)
  }

  const { error } = await sb
    .from(TABLE)
    .update({ slug: updated.slug, data: updated, published: updated.published })
    .eq("slug", slug)
  if (error) {
    if (error.code === "23505") throw new Error(DUPLICATE_SLUG_MESSAGE)
    throw new Error(`[lead-magnets] 수정 실패: ${error.message}`)
  }
  return updated
}

export async function deleteLeadMagnet(slug: string) {
  if (!USE_SUPABASE) {
    const magnets = await readAllFromJson()
    const next = magnets.filter((item) => item.slug !== slug)
    if (next.length === magnets.length) return false
    await writeLeadMagnets(next)
    return true
  }

  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .delete()
    .eq("slug", slug)
    .select("slug")
  if (error) throw new Error(`[lead-magnets] 삭제 실패: ${error.message}`)
  return (data?.length ?? 0) > 0
}
