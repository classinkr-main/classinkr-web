import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

const periodToggle = read("components/admin/PeriodToggle.tsx")
const eventDateField = read("components/admin/EventDateField.tsx")
const crmSubnav = read("components/admin/crm/CrmSubnav.tsx")
const csConsoleNav = read("components/admin/cs/CsConsoleNav.tsx")
const adminError = read("app/admin/error.tsx")
const crmError = read("app/admin/crm/error.tsx")
const adminLoading = read("components/admin/AdminRouteLoading.tsx")
const crmLoading = read("app/admin/crm/loading.tsx")
const hardwareInventory = read("components/admin/hardware/HardwareInventoryClient.tsx")

describe("admin shared controls accessibility contract", () => {
  it("keeps period controls touch-safe on mobile and keyboard-visible", () => {
    expect(periodToggle).toContain("min-h-11")
    expect(periodToggle).toContain("sm:min-h-0")
    expect(periodToggle).toContain("focus-visible:ring-2")
    expect(periodToggle).toContain('role="group"')
    expect(periodToggle).toContain("aria-pressed={value === option.id}")
  })

  it("keeps CRM and CS navigation targets at least 44px on mobile", () => {
    expect(crmSubnav.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(3)
    expect(crmSubnav.match(/focus-visible:ring-2/g)?.length).toBeGreaterThanOrEqual(3)
    expect(crmSubnav).toContain('aria-label="CRM 주요 메뉴"')
    expect(crmSubnav).toContain('aria-label="CRM 고객 메뉴"')
    expect(crmSubnav).toContain('aria-label="CRM 돈흐름 메뉴"')

    expect(csConsoleNav.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(2)
    expect(csConsoleNav.match(/focus-visible:ring-2/g)?.length).toBeGreaterThanOrEqual(2)
    expect(csConsoleNav).toContain("h-[106px]")
    expect(csConsoleNav).toContain("sm:h-[90px]")
  })

  it("labels event schedule fields and protects every compact mobile action", () => {
    expect(eventDateField).toContain("const fieldId = useId()")
    for (const suffix of ["range-start", "range-end", "session-start", "session-end"]) {
      expect(eventDateField).toContain(`htmlFor={\`${"${fieldId}"}-${suffix}\`}`)
      expect(eventDateField).toContain(`id={\`${"${fieldId}"}-${suffix}\`}`)
    }
    expect(eventDateField).toContain('aria-label="행사 일정 입력 방식"')
    expect(eventDateField).toContain("min-w-80 sm:min-w-0")
    expect(eventDateField.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(7)
    expect(eventDateField.match(/focus-visible:ring-2/g)?.length).toBeGreaterThanOrEqual(8)
    expect(eventDateField).toContain('aria-live="polite"')
  })

  it("enforces touch and focus affordances across the hardware workspace on mobile", () => {
    expect(hardwareInventory).toContain("[&_button]:min-h-11")
    expect(hardwareInventory).toContain("[&_button]:min-w-11")
    expect(hardwareInventory).toContain("[&_button]:focus-visible:ring-2")
    expect(hardwareInventory).toContain("[&_input:not([type=checkbox]):not([type=file])]:min-h-11")
    expect(hardwareInventory).toContain("[&_select]:min-h-11")
    expect(hardwareInventory).toContain("[&_textarea]:min-h-11")
    expect(hardwareInventory).toContain("md:[&_button]:min-h-0")
    expect(hardwareInventory).toContain("md:[&_input:not([type=checkbox]):not([type=file])]:min-h-0")
    expect(hardwareInventory).toContain("md:[&_select]:min-h-0")
  })
})

describe("admin route state accessibility contract", () => {
  it("announces route errors and provides touch-safe, reachable recovery", () => {
    for (const source of [adminError, crmError]) {
      expect(source).toContain('role="alert"')
      expect(source).toContain('aria-live="assertive"')
      expect(source).toContain("min-h-11")
      expect(source).toContain("focus-visible:ring-2")
    }

    expect(adminError).toContain('href="/admin/calendar"')
    expect(adminError).not.toContain('href="/admin/overview"')
  })

  it("announces shared and CRM route loading without exposing skeleton noise", () => {
    expect(adminLoading).toContain('role="status"')
    expect(adminLoading).toContain('aria-live="polite"')
    expect(adminLoading).toContain('aria-busy="true"')

    expect(crmLoading).toContain('role="status"')
    expect(crmLoading).toContain('aria-live="polite"')
    expect(crmLoading).toContain('aria-busy="true"')
    expect(crmLoading).toContain('aria-hidden="true"')
    expect(crmLoading).toContain("CRM 화면을 불러오는 중입니다.")
  })
})
