import "server-only"

import { readFile, writeFile } from "fs/promises"
import path from "path"

import type {
  LeadMagnet,
  LeadMagnetActionStep,
  LeadMagnetCategory,
  LeadMagnetGate,
  LeadMagnetScoreBand,
  LeadMagnetSection,
  LeadMagnetStatus,
  LeadMagnetTier,
} from "@/lib/lead-magnets"

const DATA_PATH = path.join(process.cwd(), "data", "lead-magnets.json")

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

export function normalizeLeadMagnet(input: unknown): LeadMagnet {
  const raw = asRecord(input)
  const title = stringValue(raw.title, "새 자료")
  const slug = normalizeSlug(raw.slug, title)
  const sections = normalizeSections(raw.sections)
  const checklistBullets = stringArray(raw.checklistBullets)
  const sourceDetail = stringValue(raw.sourceDetail, `lead_magnet:${slug}`)

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
    ctaCopy: {
      eyebrow: stringValue(asRecord(raw.ctaCopy).eyebrow, "무료 자료"),
      title: stringValue(asRecord(raw.ctaCopy).title, title),
      body: stringValue(asRecord(raw.ctaCopy).body, stringValue(raw.summary)),
      buttonLabel: stringValue(asRecord(raw.ctaCopy).buttonLabel, "자료 보기"),
    },
    resourceUrl: stringValue(raw.resourceUrl, `/resources/${slug}`),
    suggestedPlacements: stringArray(raw.suggestedPlacements),
  }
}

export async function getAllLeadMagnets() {
  const raw = await readFile(DATA_PATH, "utf8")
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error("[lead-magnets] data file must be an array")
  return parsed.map(normalizeLeadMagnet)
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
  await writeFile(DATA_PATH, `${JSON.stringify(magnets, null, 2)}\n`, "utf8")
}

export async function createLeadMagnet(input: unknown) {
  const magnets = await getAllLeadMagnets()
  const magnet = normalizeLeadMagnet(input)
  if (magnets.some((item) => item.slug === magnet.slug)) {
    throw new Error("이미 사용 중인 리드마그넷 슬러그입니다.")
  }
  await writeLeadMagnets([...magnets, magnet])
  return magnet
}

export async function updateLeadMagnet(slug: string, input: unknown) {
  const magnets = await getAllLeadMagnets()
  const index = magnets.findIndex((item) => item.slug === slug)
  if (index < 0) return null

  const updated = normalizeLeadMagnet(input)
  const conflict = magnets.some((item, itemIndex) => itemIndex !== index && item.slug === updated.slug)
  if (conflict) {
    throw new Error("이미 사용 중인 리드마그넷 슬러그입니다.")
  }

  const next = [...magnets]
  next[index] = updated
  await writeLeadMagnets(next)
  return updated
}

export async function deleteLeadMagnet(slug: string) {
  const magnets = await getAllLeadMagnets()
  const next = magnets.filter((item) => item.slug !== slug)
  if (next.length === magnets.length) return false
  await writeLeadMagnets(next)
  return true
}
