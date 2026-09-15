/**
 * 리드 드로어 SSR 골격 + 소스 계약 — leads-01·leads-03·leads-07·leads-08.
 *
 * 테스트 환경이 node(jsdom 없음)라 클릭 동작은 순수 규칙(lead-drawer-save.ts)과 소스 계약으로 잡고,
 * 여기서는 렌더된 마크업(저장 상태 캡션·aria 연결·터치 타깃·확인 다이얼로그 배선)과 소스 문자열을 검증한다.
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
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import type { ContactLogRecord } from "@/lib/repositories/contact-logs"
import type { LeadRecord } from "@/lib/repositories/leads"

const source = readFileSync(resolve(process.cwd(), "components/admin/crm/leads/board/LeadDrawer.tsx"), "utf8")

const lead = {
  id: "lead-1",
  name: "홍길동",
  email: "hong@example.com",
  phone: "010-1234-5678",
  source: "homepage",
  status: "new",
  timestamp: "2026-09-10T09:00:00.000Z",
  assigned_to: "owner-a",
} as unknown as LeadRecord

const logs = [
  { id: "log-1", type: "call", result: "connected", contacted_at: "2026-09-11T02:00:00.000Z", notes: "첫 통화" },
  { id: "log-2", type: "email", contacted_at: "2026-09-12T02:00:00.000Z" },
] as unknown as ContactLogRecord[]

function render(overrides: Partial<Parameters<typeof LeadDrawer>[0]> = {}) {
  const noop = async () => undefined
  return renderToStaticMarkup(
    <LeadDrawer
      lead={lead}
      logs={logs}
      logsLoading={false}
      events={[]}
      activity={null}
      activityLoading={false}
      crmOwners={[
        { ownerKey: "owner-a", displayName: "김담당", teamRoleLabel: "영업", branchName: null },
        { ownerKey: "owner-b", displayName: "이담당", teamRoleLabel: "영업", branchName: "서울" },
      ] as never}
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

describe("LeadDrawer 렌더 (SSR)", () => {
  it("상태 그리드·담당자 select·팔로업이 각각 항상 마운트된 저장 상태 캡션에 aria-describedby 로 연결된다 (leads-01)", () => {
    const html = render()
    for (const id of ["lead-drawer-status-save", "lead-drawer-owner-save", "lead-drawer-follow-up-status"]) {
      expect(html).toContain(`aria-describedby="${id}"`)
      expect(html).toContain(`id="${id}"`)
    }
    // SaveStateCaption 은 idle 에서도 role=status·aria-live 영역을 유지한다.
    expect(html.match(/data-state="idle"/g)?.length).toBeGreaterThanOrEqual(3)
    expect(html).toContain("고르면 잠시 뒤 저장됩니다")
    expect(html).toContain("날짜를 고르면 바로 저장됩니다")
  })

  it("상태 버튼 4개가 모두 있고 현재 상태만 aria-pressed=true 이며, 모바일 터치 타깃(min-h-11)을 갖는다", () => {
    const html = render()
    expect(html).toContain('aria-pressed="true"')
    expect(html.match(/aria-pressed="false"/g)?.length).toBe(3)
    expect(html).toContain('role="group" aria-label="리드 상태"')
    expect(html).toContain("min-h-11 items-center justify-center gap-1.5 py-2 px-3 rounded-xl")
    // 전환 버튼은 status PATCH 가 아니라 convert-v2 절차임을 title 로 드러낸다.
    expect(html).toContain("고객·거래 등록 절차로 전환합니다.")
  })

  it("연락 기록 삭제 X 는 모바일에서 44px 터치 타깃이고 위험 톤 hover 는 status-tone 토큰이다 (leads-07)", () => {
    const html = render()
    expect(html.match(/연락 기록 삭제"/g)?.length).toBe(2)
    expect(html).toContain("min-h-11 min-w-11")
    expect(html).toContain(`hover:${STATUS_TONE_TEXT_CLASS.danger}`)
    expect(html).not.toContain("hover:text-[#B85C33]")
    // 섹션 heading 은 삭제 뒤 포커스 착지점(tabIndex=-1)
    expect(html).toContain('tabindex="-1" class="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide outline-none"')
  })

  it("담당자 정본 경고·리드 삭제 링크는 #B85C33 대신 status-tone danger 를 쓴다", () => {
    const html = render({ crmOwnerHealth: { ok: false, message: "명단을 불러오지 못했습니다" } })
    expect(html).toContain("명단을 불러오지 못했습니다")
    expect(html).toContain(STATUS_TONE_TEXT_CLASS.danger)
    expect(html).not.toContain("text-[#B85C33] hover:text-[#9A4A27]")
  })
})

describe("LeadDrawer 소스 계약", () => {
  it("'전환' 버튼은 onStatusChange 를 직접 부르지 않고 resolveStatusButtonAction → onConvert 로 간다 (leads-03)", () => {
    expect(source).toContain("resolveStatusButtonAction(s, lead.status)")
    expect(source).toContain('if (action === "convert") {')
    expect(source).toContain("await onConvert(lead)")
    expect(source).not.toContain('onStatusChange(lead.id, "converted")')
    // 상태 PATCH 는 commitStatus 한 곳으로만 나간다.
    expect(source.match(/await onStatusChange\(/g)?.length).toBe(1)
  })

  it("담당자 select 는 change 에서 서버에 쓰지 않는다 — 지연 커밋 + Enter 즉시 커밋, blur 저장 없음 (leads-08)", () => {
    expect(source).toContain("onChange={(event) => scheduleOwnerCommit(event.target.value)}")
    expect(source).toContain("ASSIGNED_TO_COMMIT_DELAY_MS")
    expect(source).toContain("flushOwnerCommit()")
    expect(source).not.toContain("onBlur=")
    expect(source).not.toContain(".blur()")
    // 이전 값을 캡처해 되돌리던 레이스 코드는 사라졌다.
    expect(source).not.toContain("setAssignedTo(previous)")
    expect(source).toContain("ownerGuardRef.current.isLatest(token)")
  })

  it("상태 버튼은 저장 중 disabled + aria-busy 이고 실패는 다시 시도 액션을 갖는다 (leads-01)", () => {
    expect(source).toContain("disabled={statusBusy || converting}")
    expect(source).toContain("aria-busy={thisSaving || thisConverting ? true : undefined}")
    expect(source).toContain("onRetry={statusSave.target ? () => void commitStatus(statusSave.target as LeadStatus) : undefined}")
    expect(source).toContain('aria-busy={ownerSave === "saving" ? true : undefined}')
    expect(source).toContain("onRetry={() => void commitOwner(assignedTo)}")
  })

  it("연락 기록 삭제·종료 전환은 DeleteConfirmDialog 를 거치고 window.confirm 을 새로 쓰지 않는다 (leads-07)", () => {
    expect(source).toContain("onClick={() => setDeleteLogRequest(log)}")
    expect(source).toContain('irreversibleNote="되돌릴 수 없습니다 — 삭제된 연락 기록은 복구되지 않습니다."')
    expect(source).toContain('title="이 연락 기록을 삭제할까요?"')
    expect(source).toContain('title="리드를 종료할까요?"')
    expect(source).toContain("nextLogIdAfterRemoval(")
    expect(source.match(/window\.confirm\(/g)?.length).toBe(1)
  })

  it("닫기 확인은 담당자 미저장(실패) 값도 포함한다", () => {
    expect(source).toContain("listUnsavedDrawerFields({ notesDirty: dirty, ownerUnsaved, followUpUnsaved })")
  })
})
