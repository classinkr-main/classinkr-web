/**
 * ─────────────────────────────────────────────────────────────
 * marketing-data.ts  —  구독자 & 캠페인 JSON 파일 기반 CRUD
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-4] 현재 JSON 파일 기반 저장소 사용.
 *   기존 blog-data.ts 패턴과 동일한 구조.
 *   프로덕션 전환 시 Supabase로 교체 예정.
 *   교체 시 이 파일의 함수 시그니처는 유지하고 내부 구현만 변경하면 됨.
 *
 * [NOTE-5] 파일 잠금(locking) 미구현.
 *   동시 요청 시 race condition 가능.
 *   프로덕션에서는 DB 트랜잭션으로 해결.
 */

import { promises as fs } from "fs"
import path from "path"
import type { Subscriber, EmailCampaign } from "./marketing-types"

// ─── 파일 경로 ───────────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), "data")
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json")
const CAMPAIGNS_FILE = path.join(DATA_DIR, "email-campaigns.json")

// ─── 헬퍼: 파일 없으면 기본값으로 생성 ──────────────────────
async function ensureFile(filePath: string, defaultContent: string) {
  try {
    await fs.access(filePath)
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, defaultContent, "utf-8")
  }
}

// ═══════════════════════════════════════════════════════════════
//  구독자 CRUD
// ═══════════════════════════════════════════════════════════════

/** 전체 구독자 목록 조회 */
export async function getAllSubscribers(): Promise<Subscriber[]> {
  await ensureFile(SUBSCRIBERS_FILE, "[]")
  const raw = await fs.readFile(SUBSCRIBERS_FILE, "utf-8")
  return JSON.parse(raw)
}

/** 이메일로 구독자 조회 (중복 방지용) */
export async function getSubscriberByEmail(email: string): Promise<Subscriber | undefined> {
  const all = await getAllSubscribers()
  return all.find((s) => s.email.toLowerCase() === email.toLowerCase())
}

/**
 * [NOTE-6] 구독자 추가 (옵트인)
 * 이미 존재하는 이메일이면 status를 active로 복원하고 정보 업데이트.
 * 신규면 새 레코드 생성.
 */
export async function upsertSubscriber(
  data: Omit<Subscriber, "id" | "createdAt" | "updatedAt" | "status" | "optInAt">
    & { status?: Subscriber["status"]; optInAt?: string }
): Promise<Subscriber> {
  const all = await getAllSubscribers()
  const now = new Date().toISOString()

  const existingIdx = all.findIndex(
    (s) => s.email.toLowerCase() === data.email.toLowerCase()
  )

  if (existingIdx >= 0) {
    // 기존 구독자 업데이트 (재구독 포함)
    const existing = all[existingIdx]
    all[existingIdx] = {
      ...existing,
      ...data,
      id: existing.id,
      status: data.status ?? "active",
      optInAt: existing.optInAt,    // 최초 동의 일시는 보존
      unsubscribedAt: data.status === "active" ? undefined : existing.unsubscribedAt,
      createdAt: existing.createdAt,
      updatedAt: now,
    }
    await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(all, null, 2), "utf-8")
    return all[existingIdx]
  }

  // 신규 구독자 생성
  const maxId = all.reduce((max, s) => Math.max(max, s.id), 0)
  const newSubscriber: Subscriber = {
    id: maxId + 1,
    name: data.name,
    email: data.email,
    org: data.org,
    role: data.role,
    size: data.size,
    phone: data.phone,
    tags: data.tags ?? [],
    status: "active",
    optInAt: now,
    source: data.source,
    createdAt: now,
    updatedAt: now,
  }

  all.push(newSubscriber)
  await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(all, null, 2), "utf-8")
  return newSubscriber
}

/**
 * [NOTE-7] 수신거부 처리
 * 개인정보보호법에 따라 데이터 삭제가 아닌 status 변경으로 처리.
 * 수신거부 일시를 기록하여 법적 증빙 가능하도록 한다.
 */
export async function unsubscribe(email: string): Promise<boolean> {
  const all = await getAllSubscribers()
  const idx = all.findIndex(
    (s) => s.email.toLowerCase() === email.toLowerCase()
  )
  if (idx < 0) return false

  all[idx].status = "unsubscribed"
  all[idx].unsubscribedAt = new Date().toISOString()
  all[idx].updatedAt = new Date().toISOString()
  await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(all, null, 2), "utf-8")
  return true
}

/** 구독자 삭제 (관리자 전용) */
export async function deleteSubscriber(id: number): Promise<boolean> {
  const all = await getAllSubscribers()
  const filtered = all.filter((s) => s.id !== id)
  if (filtered.length === all.length) return false
  await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(filtered, null, 2), "utf-8")
  return true
}

/**
 * [NOTE-8] 태그 기반 필터링으로 active 구독자 조회
 * 이메일 발송 시 targetTags가 비어있으면 전체 active 구독자 반환.
 * 태그가 있으면 해당 태그를 하나라도 가진 구독자만 반환. (OR 조건)
 */
export async function getActiveSubscribersByTags(tags: string[]): Promise<Subscriber[]> {
  const all = await getAllSubscribers()
  const active = all.filter((s) => s.status === "active")

  if (tags.length === 0) return active

  return active.filter((s) =>
    s.tags.some((tag) => tags.includes(tag))
  )
}

// ═══════════════════════════════════════════════════════════════
//  이메일 캠페인 CRUD
// ═══════════════════════════════════════════════════════════════

export async function getAllCampaigns(): Promise<EmailCampaign[]> {
  await ensureFile(CAMPAIGNS_FILE, "[]")
  const raw = await fs.readFile(CAMPAIGNS_FILE, "utf-8")
  return JSON.parse(raw)
}

export async function createCampaign(
  data: Omit<EmailCampaign, "id" | "createdAt">
): Promise<EmailCampaign> {
  const all = await getAllCampaigns()
  const maxId = all.reduce((max, c) => Math.max(max, c.id), 0)

  const campaign: EmailCampaign = {
    ...data,
    id: maxId + 1,
    createdAt: new Date().toISOString(),
  }

  all.push(campaign)
  await fs.writeFile(CAMPAIGNS_FILE, JSON.stringify(all, null, 2), "utf-8")
  return campaign
}

export async function updateCampaign(
  id: number,
  data: Partial<EmailCampaign>
): Promise<EmailCampaign | null> {
  const all = await getAllCampaigns()
  const idx = all.findIndex((c) => c.id === id)
  if (idx < 0) return null

  all[idx] = { ...all[idx], ...data }
  await fs.writeFile(CAMPAIGNS_FILE, JSON.stringify(all, null, 2), "utf-8")
  return all[idx]
}
