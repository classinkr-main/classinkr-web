import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { AdminCrmTeamRole, AdminProfile, AdminRole, AdminStatus } from "@/lib/supabase/database.types"

export type AdminUserSource = "supabase" | "env" | "fallback"

export interface AdminCrmOwnerOption {
  userId: string | null
  source: AdminUserSource
  displayName: string
  role: AdminRole | "legacy_admin" | "legacy_branch"
  status: AdminStatus | "ACTIVE"
  branchName: string | null
  teamRole: AdminCrmTeamRole
  teamRoleLabel: string
  assignable: boolean
  ownerKey: string
  ownerAliases: string[]
  neoOwnerId: string | null
  sortOrder: number
}

export interface AdminUserDirectory {
  generatedAt: string
  source: AdminUserSource
  health: {
    ok: boolean
    message: string | null
  }
  users: AdminCrmOwnerOption[]
  crmOwners: AdminCrmOwnerOption[]
}

interface LegacyAdminUser {
  name: string
  role: "admin" | "branch"
  branch?: string
}

type BaseAdminProfile = Pick<
  AdminProfile,
  "user_id" | "display_name" | "role" | "status" | "last_login_at" | "created_at" | "updated_at"
>

type ExtendedAdminProfile = BaseAdminProfile &
  Pick<
    AdminProfile,
    | "branch_name"
    | "crm_team_role"
    | "crm_assignable"
    | "crm_owner_key"
    | "crm_owner_aliases"
    | "neo_owner_id"
    | "crm_sort_order"
  >

const CRM_ASSIGNABLE_ROLES = new Set<AdminRole>(["SUPER_ADMIN", "ADMIN", "BRANCH"])

export function crmTeamRoleLabel(role: AdminCrmTeamRole) {
  if (role === "branch_director") return "지사장"
  if (role === "manager") return "매니저"
  if (role === "ops") return "운영"
  return "관리자"
}

function normalizeOwnerKey(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed || fallback.trim()
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
}

function fallbackTeamRole(role: AdminRole | "legacy_admin" | "legacy_branch"): AdminCrmTeamRole {
  if (role === "BRANCH" || role === "legacy_branch") return "branch_director"
  if (role === "SUPER_ADMIN") return "admin"
  return "manager"
}

function toCrmOwnerOption(profile: ExtendedAdminProfile | BaseAdminProfile): AdminCrmOwnerOption {
  const extended = profile as Partial<ExtendedAdminProfile>
  const teamRole = extended.crm_team_role ?? fallbackTeamRole(profile.role)
  const ownerKey = normalizeOwnerKey(extended.crm_owner_key, profile.display_name)
  const aliases = uniqueStrings([...(extended.crm_owner_aliases ?? []), profile.display_name, ownerKey])
  const assignable = Boolean(extended.crm_assignable ?? CRM_ASSIGNABLE_ROLES.has(profile.role))

  return {
    userId: profile.user_id,
    source: "supabase",
    displayName: profile.display_name,
    role: profile.role,
    status: profile.status,
    branchName: extended.branch_name ?? null,
    teamRole,
    teamRoleLabel: crmTeamRoleLabel(teamRole),
    assignable,
    ownerKey,
    ownerAliases: aliases,
    neoOwnerId: extended.neo_owner_id ?? null,
    sortOrder: extended.crm_sort_order ?? 100,
  }
}

function legacyRoleToAdminRole(role: LegacyAdminUser["role"]): AdminCrmOwnerOption["role"] {
  return role === "branch" ? "legacy_branch" : "legacy_admin"
}

function toLegacyOwnerOption(user: LegacyAdminUser, index: number, source: AdminUserSource): AdminCrmOwnerOption {
  const role = legacyRoleToAdminRole(user.role)
  const teamRole = fallbackTeamRole(role)
  const ownerKey = normalizeOwnerKey(user.name, `admin-${index + 1}`)
  return {
    userId: null,
    source,
    displayName: ownerKey,
    role,
    status: "ACTIVE",
    branchName: user.branch?.trim() || null,
    teamRole,
    teamRoleLabel: crmTeamRoleLabel(teamRole),
    assignable: true,
    ownerKey,
    ownerAliases: uniqueStrings([ownerKey, user.name]),
    neoOwnerId: null,
    sortOrder: index + 1,
  }
}

function parseEnvUsers(): AdminCrmOwnerOption[] {
  const raw = process.env.ADMIN_USERS?.trim()
  if (!raw) {
    const fallback = process.env.ADMIN_PASSWORD?.trim()
    return fallback ? [toLegacyOwnerOption({ name: "Admin", role: "admin" }, 0, "fallback")] : []
  }

  try {
    const parsed = JSON.parse(raw) as Array<Partial<LegacyAdminUser> & { password?: string }>
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") return null
        const name = typeof entry.name === "string" ? entry.name.trim() : ""
        const role = entry.role === "branch" ? "branch" : entry.role === "admin" ? "admin" : null
        const branch = typeof entry.branch === "string" ? entry.branch : undefined
        if (!name || !role) return null
        return toLegacyOwnerOption({ name, role, branch }, index, "env")
      })
      .filter((item): item is AdminCrmOwnerOption => Boolean(item))
  } catch {
    return []
  }
}

function sortOwners(users: AdminCrmOwnerOption[]) {
  const roleRank: Record<AdminCrmTeamRole, number> = {
    branch_director: 0,
    manager: 1,
    ops: 2,
    admin: 3,
  }

  return [...users].sort(
    (a, b) =>
      roleRank[a.teamRole] - roleRank[b.teamRole] ||
      a.sortOrder - b.sortOrder ||
      a.displayName.localeCompare(b.displayName, "ko")
  )
}

function isMissingCrmProfileColumns(error: { code?: string; message?: string; details?: string; hint?: string }) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    haystack.includes("42703") ||
    haystack.includes("branch_name") ||
    haystack.includes("crm_team_role") ||
    haystack.includes("crm_assignable") ||
    haystack.includes("crm_owner_key") ||
    haystack.includes("neo_owner_id")
  )
}

async function listSupabaseAdminProfiles(): Promise<{ users: AdminCrmOwnerOption[]; warning: string | null }> {
  const supabase = createSupabaseAdminClient()
  const extendedSelect =
    "user_id, display_name, role, status, last_login_at, created_at, updated_at, branch_name, crm_team_role, crm_assignable, crm_owner_key, crm_owner_aliases, neo_owner_id, crm_sort_order"

  const extended = await supabase
    .from("admin_profiles")
    .select(extendedSelect)
    .order("crm_sort_order", { ascending: true })
    .order("display_name", { ascending: true })

  if (!extended.error) {
    return { users: sortOwners((extended.data ?? []).map((profile) => toCrmOwnerOption(profile as ExtendedAdminProfile))), warning: null }
  }

  if (!isMissingCrmProfileColumns(extended.error)) {
    throw new Error(`[admin-users] 관리자 프로필 조회 실패: ${extended.error.message}`)
  }

  const base = await supabase
    .from("admin_profiles")
    .select("user_id, display_name, role, status, last_login_at, created_at, updated_at")
    .order("display_name", { ascending: true })

  if (base.error) {
    throw new Error(`[admin-users] 관리자 프로필 조회 실패: ${base.error.message}`)
  }

  return {
    users: sortOwners((base.data ?? []).map((profile) => toCrmOwnerOption(profile as BaseAdminProfile))),
    warning: "CRM 담당자 매핑 마이그레이션이 아직 적용되지 않아 기본 관리자 이름으로 표시합니다.",
  }
}

export async function listAdminUserDirectory(): Promise<AdminUserDirectory> {
  const envUsers = parseEnvUsers()

  try {
    const { users, warning } = await listSupabaseAdminProfiles()
    if (users.length > 0) {
      return {
        generatedAt: new Date().toISOString(),
        source: "supabase",
        health: { ok: !warning, message: warning },
        users,
        crmOwners: users.filter((user) => user.status === "ACTIVE" && user.assignable),
      }
    }
  } catch (error) {
    if (envUsers.length === 0) throw error
    return {
      generatedAt: new Date().toISOString(),
      source: "env",
      health: {
        ok: false,
        message: error instanceof Error ? error.message : "Supabase 관리자 프로필을 불러오지 못해 env 계정으로 대체했습니다.",
      },
      users: envUsers,
      crmOwners: envUsers.filter((user) => user.assignable),
    }
  }

  const fallbackUsers = envUsers.length > 0 ? envUsers : [toLegacyOwnerOption({ name: "Admin", role: "admin" }, 0, "fallback")]

  return {
    generatedAt: new Date().toISOString(),
    source: fallbackUsers[0]?.source ?? "fallback",
    health: {
      ok: envUsers.length > 0,
      message: envUsers.length > 0 ? null : "관리자 프로필이 없어 기본 Admin 계정을 표시합니다.",
    },
    users: fallbackUsers,
    crmOwners: fallbackUsers.filter((user) => user.assignable),
  }
}
