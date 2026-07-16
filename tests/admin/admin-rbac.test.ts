import { afterEach, describe, expect, it, vi } from "vitest"

import {
  authenticateUser,
  defaultAdminApiRolesForMethod,
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  hasAdminCapability,
  toAdminActorSnapshot,
} from "@/lib/admin-auth"
import { ADMIN_AUTH_ERROR_CODE } from "@/lib/admin-auth-errors"

describe("admin RBAC canon", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("disables plaintext legacy admin authentication in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ADMIN_PASSWORD", "legacy-secret")

    expect(authenticateUser("legacy-secret")).toEqual({
      session: null,
      code: ADMIN_AUTH_ERROR_CODE.LEGACY_DISABLED,
    })
  })

  it("keeps legacy authentication available for local development only", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("ADMIN_PASSWORD", "local-secret")
    vi.stubEnv("ADMIN_USERS", "")

    expect(authenticateUser("local-secret").session).toMatchObject({
      name: "Admin",
      role: "admin",
    })
  })

  it("grants explicit account capabilities and gives SUPER_ADMIN an implicit wildcard", () => {
    expect(hasAdminCapability({ role: "ADMIN", capabilities: ["hardware.finalize"] }, "hardware.finalize")).toBe(true)
    expect(hasAdminCapability({ role: "ADMIN", capabilities: [] }, "hardware.finalize")).toBe(false)
    expect(hasAdminCapability({ role: "SUPER_ADMIN", capabilities: [] }, "hardware.finalize")).toBe(true)
  })

  it("allows all internal operators to edit hardware while finalization stays capability-gated", () => {
    expect(HARDWARE_EDITOR_ADMIN_API_ROLES).toEqual(["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"])
    expect(hasAdminCapability({ role: "BRANCH", capabilities: [] }, "hardware.finalize")).toBe(false)
  })

  it("opens default reads to branch directors without opening default writes", () => {
    expect(defaultAdminApiRolesForMethod("GET")).toContain("BRANCH")
    expect(defaultAdminApiRolesForMethod("GET")).toContain("EDITOR")
    expect(defaultAdminApiRolesForMethod("GET")).toContain("VIEWER")
    expect(defaultAdminApiRolesForMethod("HEAD")).toContain("BRANCH")
    expect(defaultAdminApiRolesForMethod("POST")).not.toContain("BRANCH")
    expect(defaultAdminApiRolesForMethod("PATCH")).not.toContain("BRANCH")
  })

  it("creates the canonical immutable actor snapshot shape", () => {
    expect(toAdminActorSnapshot({
      userId: "f2536db0-1b4d-4a80-aecc-359c3801cf8f",
      name: "왕찬",
      role: "ADMIN",
    })).toEqual({
      actor_user_id: "f2536db0-1b4d-4a80-aecc-359c3801cf8f",
      actor_display_name: "왕찬",
      actor_role: "ADMIN",
    })
  })
})
