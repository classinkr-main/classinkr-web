/**
 * 리드 드로어 빠른 칩 — CRM 디벨롭 §13 Q1(팔로업 칩)·Q4(빠른 배정 칩).
 *
 * lead-drawer-render.test.tsx와 같은 이유로 이 환경은 node(jsdom 없음)다 — 클릭 이후의 상태 전이는
 * 여기서 검증하지 않는다(ContactLogForm의 제안 칩은 저장 성공 뒤 내부 state로 뜨므로 SSR로는 애초에
 * 볼 수 없다 — 그 노출 조건은 소스 계약으로, 날짜 계산은 follow-up-presets.test.ts의 순수 함수로,
 * 최근 배정 목록의 저장/중복 제거/상한은 lead-drawer-save-rules.test.ts의 pushRecentAssignee로 각각
 * 잡는다). 여기서는 정적 마크업(칩 행 2개·aria-label·aria-pressed)과 ContactLogForm 소스 계약만 본다.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/crm/customers/leads",
  useSearchParams: () => new URLSearchParams(),
}))

import LeadDrawer from "@/components/admin/crm/leads/board/LeadDrawer"
import ContactLogForm from "@/components/admin/crm/leads/board/ContactLogForm"
import { resolveFollowUpPreset } from "@/lib/crm/follow-up-presets"
import type { ContactLogRecord } from "@/lib/repositories/contact-logs"
import type { LeadRecord } from "@/lib/repositories/leads"

const contactLogFormSource = readFileSync(
  resolve(process.cwd(), "components/admin/crm/leads/board/ContactLogForm.tsx"),
  "utf8"
)

const CRM_OWNERS = [
  { ownerKey: "owner-a", displayName: "김담당", teamRoleLabel: "영업", branchName: null },
  { ownerKey: "owner-b", displayName: "이담당", teamRoleLabel: "영업", branchName: "서울" },
] as never

const baseLead = {
  id: "lead-1",
  name: "홍길동",
  email: "hong@example.com",
  phone: "010-1234-5678",
  source: "homepage",
  status: "new",
  timestamp: "2026-09-10T09:00:00.000Z",
  assigned_to: "owner-a",
} as unknown as LeadRecord

const logs: ContactLogRecord[] = []

function render(overrides: Partial<Parameters<typeof LeadDrawer>[0]> = {}) {
  const noop = async () => undefined
  return renderToStaticMarkup(
    <LeadDrawer
      lead={baseLead}
      logs={logs}
      logsLoading={false}
      events={[]}
      activity={null}
      activityLoading={false}
      crmOwners={CRM_OWNERS}
      crmOwnerHealth={{ ok: true, message: null }}
      onClose={() => undefined}
      onStatusChange={noop}
      onNotesChange={noop}
      onFollowUpChange={noop}
      onAssignedToChange={noop}
      onDelete={noop}
      onAddLog={noop}
      onDeleteLog={noop}
      onConvert={noop}
      onConfirm={noop}
      {...overrides}
    />
  )
}

/** <button ... aria-pressed="true|false" ...>라벨<...  하나를 찾아 pressed 값을 돌려준다(없으면 null). */
function chipPressed(html: string, label: string): boolean | null {
  const match = html.match(new RegExp(`<button[^>]*aria-pressed="(true|false)"[^>]*>\\s*${label}\\s*<`))
  return match ? match[1] === "true" : null
}

describe("LeadDrawer 빠른 칩 — 정적 마크업", () => {
  it("팔로업 빠른 설정·빠른 배정 두 칩 행이 role=group + aria-label로 마운트된다", () => {
    const html = render({
      currentOwner: { ownerKey: "owner-a", displayName: "김담당", teamRoleLabel: "영업", branchName: null } as never,
    })
    expect(html).toContain('role="group" aria-label="팔로업 빠른 설정"')
    expect(html).toContain('role="group" aria-label="빠른 배정"')
  })

  it("팔로업 프리셋 4개(오늘·내일·3일 뒤·다음 주 월)가 전부 렌더된다", () => {
    const html = render()
    for (const label of ["오늘", "내일", "3일 뒤", "다음 주 월"]) {
      expect(chipPressed(html, label)).not.toBeNull()
    }
  })

  it("현재 팔로업이 '오늘'로 계산되는 날짜면 그 프리셋만 aria-pressed=true다", () => {
    const today = resolveFollowUpPreset("today", Date.now())
    const html = render({ lead: { ...baseLead, follow_up_at: `${today}T12:00:00.000Z` } as LeadRecord })
    // '오늘'은 내일·3일 뒤·다음 주 월과 절대 같은 날짜가 될 수 없어(항상 미래) 요일과 무관하게 안전하다.
    expect(chipPressed(html, "오늘")).toBe(true)
    expect(html).toContain(`· ${"오늘"}`) // 헤딩 옆 describeFollowUpDate 캡션(예: "다음 팔로업 · 오늘")
  })

  it("팔로업이 없으면 프리셋은 전부 aria-pressed=false이고 '지우기' 칩이 없다", () => {
    const html = render()
    for (const label of ["오늘", "내일", "3일 뒤", "다음 주 월"]) {
      expect(chipPressed(html, label)).toBe(false)
    }
    expect(html).not.toContain(">지우기<")
  })

  it("팔로업이 있으면 '지우기' 칩이 나타난다", () => {
    const html = render({ lead: { ...baseLead, follow_up_at: "2026-09-25T12:00:00.000Z" } as LeadRecord })
    expect(html).toContain(">지우기<")
  })

  it("currentOwner를 넘기면 '나' 칩이 뜨고, 현재 담당과 같으면 aria-pressed=true다", () => {
    const html = render({
      lead: { ...baseLead, assigned_to: "owner-a" } as LeadRecord,
      currentOwner: { ownerKey: "owner-a", displayName: "김담당", teamRoleLabel: "영업", branchName: null } as never,
    })
    expect(chipPressed(html, "나 · 김담당")).toBe(true)
  })

  it("currentOwner가 다른 사람을 가리키면 '나' 칩은 aria-pressed=false다", () => {
    const html = render({
      lead: { ...baseLead, assigned_to: "owner-a" } as LeadRecord,
      currentOwner: { ownerKey: "owner-b", displayName: "이담당", teamRoleLabel: "영업", branchName: "서울" } as never,
    })
    expect(chipPressed(html, "나 · 이담당")).toBe(false)
  })

  it("currentOwner를 넘기지 않으면(기본 렌더) '나' 칩도 빠른 배정 행 자체도 없다 — 최근 배정도 없어서다", () => {
    const html = render()
    expect(html).not.toContain('aria-label="빠른 배정"')
    expect(html).not.toContain("나 ·")
  })

  it("담당자 정본(crmOwnerHealth)이 불안정하면 currentOwner가 있어도 빠른 배정 행을 숨긴다", () => {
    const html = render({
      currentOwner: { ownerKey: "owner-a", displayName: "김담당", teamRoleLabel: "영업", branchName: null } as never,
      crmOwnerHealth: { ok: false, message: "명단을 불러오지 못했습니다" },
    })
    expect(html).not.toContain('aria-label="빠른 배정"')
  })
})

describe("ContactLogForm 제안 칩 노출 조건(소스 계약) — Q1", () => {
  it("연락 결과가 부재중(no_answer)·재통화(callback)일 때만 제안을 계산한다", () => {
    expect(contactLogFormSource).toContain(
      'entry.result === "no_answer" || entry.result === "callback"'
    )
    // entry는 buildContactLogEntry가 채널이 결과를 안 나르면(카카오·이메일) result를 이미 지운 값이라,
    // 이 한 조건이 "부재중/재통화로 실제 저장된 경우"만 걸러낸다.
    expect(contactLogFormSource).toContain("buildContactLogEntry({ type, result, notes, contacted_by: by })")
  })

  it("onSuggestFollowUp이 없으면(옵션) 제안을 만들지 않는다", () => {
    expect(contactLogFormSource).toContain("onSuggestFollowUp &&")
  })

  it("8초 뒤 자동으로 닫히고, Esc·바깥 클릭으로도 닫힌다", () => {
    expect(contactLogFormSource).toContain("FOLLOW_UP_SUGGESTION_VISIBLE_MS = 8000")
    expect(contactLogFormSource).toContain('event.key === "Escape"')
    expect(contactLogFormSource).toContain("containerRef.current?.contains(event.target as Node)")
  })

  it("기본 렌더(저장 전)에는 제안 칩이 보이지 않는다", () => {
    const html = renderToStaticMarkup(
      <ContactLogForm onSave={async () => undefined} onCancel={() => undefined} />
    )
    expect(html).not.toContain("팔로업 내일")
    expect(html).not.toContain("팔로업 3일 뒤")
    expect(html).not.toContain('aria-label="팔로업 제안"')
  })
})
