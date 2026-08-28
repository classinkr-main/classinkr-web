import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

// 분해된 모듈 폴더까지 합쳐 화면 단위 계약을 유지한다.
function readWithModuleDir(mainPath: string, dirPath: string) {
  const dir = join(process.cwd(), dirPath)
  return [
    read(mainPath),
    ...readdirSync(dir)
      .sort()
      .map((name) => readFileSync(join(dir, name), "utf8")),
  ].join("\n")
}

// 리드 보드 본체는 components/admin/crm/leads/board/* 로 분해됐다(2026-08-28).
const leadsBoard = readWithModuleDir(
  "components/admin/crm/leads/LeadsBoardClient.tsx",
  "components/admin/crm/leads/board"
)
// 드로어 본체는 components/admin/crm/drawer/* 로 분해됐다(2026-08-28).
const customer360 = readWithModuleDir("components/admin/crm/Customer360Drawer.tsx", "components/admin/crm/drawer")

describe("Admin CRM mobile interaction accessibility contract", () => {
  it("keeps lead controls touch-safe on mobile without changing desktop density", () => {
    expect(leadsBoard).toContain("[&_button]:min-h-11")
    expect(leadsBoard).toContain("[&_button]:min-w-11")
    expect(leadsBoard).toContain("[&_a]:min-h-11")
    expect(leadsBoard).toContain("[&_input:not([type=checkbox])]:min-h-11")
    expect(leadsBoard).toContain("[&_select]:min-h-11")
    expect(leadsBoard).toContain("[&_textarea]:min-h-11")
    expect(leadsBoard).toContain("sm:[&_button]:min-h-0")
    expect(leadsBoard).toContain("sm:[&_input:not([type=checkbox])]:min-h-0")
    expect(leadsBoard).toContain("h-11 w-11 shrink-0")
  })

  it("gives the lead board a visible keyboard focus and announced runtime states", () => {
    expect(leadsBoard).toContain("[&_button]:focus-visible:ring-2")
    expect(leadsBoard).toContain("[&_a]:focus-visible:ring-2")
    expect(leadsBoard).toContain("[&_input]:focus-visible:ring-2")
    expect(leadsBoard).toContain("aria-busy={")
    expect(leadsBoard).toContain('role="status" aria-live="polite"')
    expect(leadsBoard.match(/role="alert" aria-live="assertive"/g)?.length).toBeGreaterThanOrEqual(2)
    expect(leadsBoard).toContain("리드 목록을 불러오는 중입니다.")
  })

  it("uses native, labelled mobile card actions instead of nested role buttons", () => {
    expect(leadsBoard).not.toContain('role="button"')
    expect(leadsBoard).toContain('aria-label={`${getLeadDisplayName(lead)} 상세 열기`}')
    expect(leadsBoard).toContain("상세 보기")
    expect(leadsBoard).toContain('aria-label="리드 검색"')
    expect(leadsBoard).toContain('aria-label="세부 유입 필터"')
    expect(leadsBoard).toContain('aria-label="리드마그넷 필터"')
  })

  it("keeps failed lead notes and contact logs retryable", () => {
    expect(leadsBoard).toContain("폼 값은 유지해 사용자가 바로 재시도할 수 있게 한다")
    expect(leadsBoard).toContain("성공 배지는 띄우지 않고 작성 내용은 유지한다")
    expect(leadsBoard).toContain('aria-label={saving ? "연락 기록 저장 중" : "연락 기록 저장"}')
    expect(leadsBoard).toContain('aria-label="리드 메모"')
  })
})

describe("Customer 360 drawer accessibility contract", () => {
  it("keeps every primary control touch-safe on mobile with desktop resets", () => {
    expect(customer360).toContain("[&_button]:min-h-11")
    expect(customer360).toContain("[&_button]:min-w-11")
    expect(customer360).toContain("[&_a]:min-h-11")
    expect(customer360).toContain("[&_input]:min-h-11")
    expect(customer360).toContain("[&_select]:min-h-11")
    expect(customer360).toContain("sm:[&_button]:min-h-0")
    expect(customer360).toContain("sm:[&_input]:min-h-0")
    expect(customer360).toContain("flex h-16 w-11")
  })

  it("announces loading and mutation states while preserving modal semantics", () => {
    expect(customer360).toContain('role="dialog"')
    expect(customer360).toContain('aria-modal="true"')
    expect(customer360).toContain("aria-busy={loading || eventsLoading || tagBusy || neoLinkBusy || actingId !== null}")
    expect(customer360).toContain('role="status" aria-live="polite"')
    expect(customer360).toContain("고객 정보를 불러오는 중입니다.")
    expect(customer360).toContain('aria-label={loading ? "고객 정보 새로고침 중" : "고객 정보 새로고침"}')
  })

  it("exposes activity selection and form fields to assistive technology", () => {
    expect(customer360).toContain('role="tablist" aria-label="고객 활동 보기"')
    expect(customer360).toContain("aria-selected={activityTab === tab.key}")
    expect(customer360).toContain('role="group" aria-label="고객 활동 출처 필터"')
    expect(customer360).toContain("aria-pressed={activitySource === opt.key}")
    for (const label of [
      "새 고객 라벨",
      "새 할 일 제목",
      "새 할 일 유형",
      "새 할 일 기한",
      "새 딜 제목",
      "새 딜 예상 금액",
      "새 딜 단계",
    ]) {
      expect(customer360).toContain(`aria-label="${label}"`)
    }
    expect(customer360).toContain("const contentId = useId()")
    expect(customer360).toContain("aria-controls={contentId}")
  })
})
