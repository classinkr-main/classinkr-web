import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  validateAdminPasswordChange,
} from "@/lib/auth/admin-password"

describe("admin password security policy", () => {
  it("requires the current password", () => {
    expect(
      validateAdminPasswordChange({
        currentPassword: "",
        newPassword: "StrongPassword!42",
        confirmPassword: "StrongPassword!42",
      })
    ).toBe("현재 비밀번호를 입력해 주세요.")
  })

  it("does not impose a client-side complexity policy", () => {
    expect(
      validateAdminPasswordChange({
        currentPassword: "old-password",
        newPassword: "simple",
        confirmPassword: "simple",
      })
    ).toBeNull()
  })

  it("rejects password reuse and mismatched confirmation", () => {
    expect(
      validateAdminPasswordChange({
        currentPassword: "StrongPassword!42",
        newPassword: "StrongPassword!42",
        confirmPassword: "StrongPassword!42",
      })
    ).toContain("다른 새 비밀번호")

    expect(
      validateAdminPasswordChange({
        currentPassword: "OldPassword!42",
        newPassword: "StrongPassword!42",
        confirmPassword: "DifferentPassword!42",
      })
    ).toContain("일치하지 않습니다")
  })

  it("accepts a valid password change request", () => {
    expect(
      validateAdminPasswordChange({
        currentPassword: "OldPassword!42",
        newPassword: "StrongPassword!42",
        confirmPassword: "StrongPassword!42",
      })
    ).toBeNull()
  })
})

describe("Settings security flow", () => {
  const settingsSource = readFileSync(join(process.cwd(), "app/admin/settings/page.tsx"), "utf8")
  const panelSource = readFileSync(
    join(process.cwd(), "components/admin/settings/SecurityPanel.tsx"),
    "utf8"
  )

  it("exposes a dedicated security tab", () => {
    expect(settingsSource).toContain('key: "security"')
    expect(settingsSource).toContain('activeTab === "security"')
    expect(settingsSource).toContain("<SecurityPanel />")
  })

  it("reauthenticates, changes the password, and globally signs out", () => {
    expect(panelSource).toContain("signInWithPassword")
    expect(panelSource).toContain("updateUser")
    expect(panelSource).toContain('signOut({ scope: "global" })')
    expect(panelSource).toContain('fetch("/api/admin/auth/logout", { method: "POST" })')
    expect(panelSource).toContain("clearAdminSessionStorage()")
  })

  it("does not persist password values in browser storage", () => {
    expect(panelSource).not.toMatch(/sessionStorage\.setItem\([^,]+,\s*(currentPassword|newPassword|confirmPassword)/)
    expect(panelSource).not.toMatch(/localStorage\.setItem\([^,]+,\s*(currentPassword|newPassword|confirmPassword)/)
  })
})
