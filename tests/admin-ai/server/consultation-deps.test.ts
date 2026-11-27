// 상담 내역 찾기 서버 연결 — 채널톡 저장소가 설정됐는데 읽지 못하면 실패(failed)로 알려야 한다(로컬 JSON 의 "0건"으로 숨기지 않는다).
// 저장소 모듈은 가짜로 바꾼다(DB·네트워크 없음).
import { beforeEach, describe, expect, it, vi } from "vitest"

const repo = vi.hoisted(() => ({
  enabled: true,
  durable: null as unknown[] | null,
  local: [] as unknown[],
}))

vi.mock("@/lib/repositories/channel-conversations", () => ({
  channelConversationsSupabaseEnabled: () => repo.enabled,
  listDurableConversationsLite: async () => repo.durable,
  getConversations: () => repo.local,
}))
vi.mock("@/lib/repositories/internal-cs-chat", () => ({
  listInternalCsConversations: async () => ({ conversations: [] }),
}))
vi.mock("@/lib/internal-cs-chat/contact-deps", () => ({ buildContactDeps: () => ({}) }))
vi.mock("@/lib/internal-cs-chat/consultation-search", () => ({ searchConsultationEvidence: async () => [] }))

const row = (id: string) => ({ id, state: "opened", name: "고객(샘플)", firstQuestion: "녹화 문의", tags: [], transcript: [] })

describe("buildConsultationDeps — 채널톡 출처", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  it("Supabase 가 설정됐는데 목록을 읽지 못하면(null) 실패다 — 로컬 JSON 으로 넘어가 '0건'이라 하지 않는다", async () => {
    Object.assign(repo, { enabled: true, durable: null, local: [] })
    const { buildConsultationDeps } = await import("@/lib/admin-ai/server/consultation-deps")
    const { findConsultations } = await import("@/lib/admin-ai/server/consultations")
    const result = await findConsultations("녹화 문의 있었나?", buildConsultationDeps(), { actor: { canReadContent: true }, now: Date.now() })
    expect(result.failed).toContain("channel_talk")
    expect(result.basis.scanned.map((entry) => entry.source)).not.toContain("channel_talk")
  })

  it("Supabase 가 설정되지 않은 개발 환경만 로컬 JSON 을 읽는다", async () => {
    Object.assign(repo, { enabled: false, durable: null, local: [row("local-1")] })
    const { buildConsultationDeps } = await import("@/lib/admin-ai/server/consultation-deps")
    const batch = await buildConsultationDeps().channelTalk!(300)
    expect(batch?.records.map((record) => record.id)).toEqual(["local-1"])
  })

  it("읽기에 성공하면 그 목록을 쓴다", async () => {
    Object.assign(repo, { enabled: true, durable: [row("db-1")], local: [row("local-1")] })
    const { buildConsultationDeps } = await import("@/lib/admin-ai/server/consultation-deps")
    const batch = await buildConsultationDeps().channelTalk!(300)
    expect(batch?.records.map((record) => record.id)).toEqual(["db-1"])
  })
})
