"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Building2, Check, CircleAlert, Info, Loader2, ShieldCheck, UserRound } from "lucide-react"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"

// 구 /admin/users(회원 관리) 페이지 콘텐츠 — Settings "회원" 탭으로 흡수(2026-07-04).
// /admin/users 라우트는 /admin/settings?tab=members 로 리다이렉트 스텁 유지.
// 자족형: /api/admin/users 만 읽는 읽기 전용 디렉터리.

interface AdminUser {
  userId: string | null
  source: "supabase" | "env" | "fallback"
  displayName: string
  role: string
  status: string
  branchName: string | null
  teamRole: "branch_director" | "manager" | "admin" | "ops"
  teamRoleLabel: string
  assignable: boolean
  ownerKey: string
  ownerAliases: string[]
  neoOwnerId: string | null
  sortOrder: number
  capabilities?: string[]
}

type CapabilitySaveState =
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string }

const CAPABILITY_OPTIONS = [
  {
    key: "hardware.finalize",
    label: "하드웨어 최종 확정 · 이왕찬 담당",
    description: "모든 팀원은 일반 편집이 가능하며, 이 권한은 계획 출고 확정과 입출고 원장 취소만 제한합니다.",
  },
] as const

interface AdminUsersResponse {
  generatedAt: string
  source: "supabase" | "env" | "fallback"
  health: {
    ok: boolean
    message: string | null
  }
  users: AdminUser[]
  crmOwners: AdminUser[]
  viewer?: { role: string }
}

const TEAM_ROLE_TONE: Record<AdminUser["teamRole"], string> = {
  branch_director: "bg-[#111110] text-white",
  manager: "bg-[#ECFDF5] text-[#084734]",
  admin: "bg-[#fafaf8] text-[#111110]",
  ops: "bg-[#fafaf8] text-[#1a1a1a]/60",
}

function roleDescription(user: AdminUser) {
  if (!user.assignable) return "CRM 배정 제외"
  if (user.teamRole === "branch_director") return "지사 운영 총괄 · CRM 전체 흐름 확인"
  if (user.teamRole === "manager") return "고객·리드·회의 기록 담당"
  if (user.teamRole === "ops") return "운영 지원"
  return "관리자"
}

function UserSection({
  title,
  icon,
  users,
  empty,
  canManageCapabilities,
  capabilityStates,
  onCapabilityToggle,
}: {
  title: string
  icon: ReactNode
  users: AdminUser[]
  empty: string
  canManageCapabilities: boolean
  capabilityStates: Record<string, CapabilitySaveState | undefined>
  onCapabilityToggle: (user: AdminUser, capability: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
      <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-5 py-4">
        {icon}
        <h2 className="text-[13px] font-semibold text-[#111110]">{title}</h2>
        <span className="ml-auto text-[12px] text-[#1a1a1a]/40">{users.length}명</span>
      </div>
      {users.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-[#1a1a1a]/30">{empty}</p>
      ) : (
        <ul>
          {users.map((user) => (
            <li key={`${user.source}:${user.userId ?? user.ownerKey}`} className="border-b border-[#e8e8e4] px-4 py-3.5 last:border-0 sm:px-5">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#111110] text-[12px] font-bold text-white">
                  {user.displayName[0] ?? "A"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-semibold text-[#111110]">{user.displayName}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${TEAM_ROLE_TONE[user.teamRole]}`}>
                      {user.teamRoleLabel}
                    </span>
                    {user.status !== "ACTIVE" ? (
                      <span className="rounded-full bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-semibold text-[#B85C33]">
                        {user.status}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-[#1a1a1a]/42">
                    {user.branchName ? `${user.branchName} · ` : ""}
                    {roleDescription(user)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-[#1a1a1a]/42">
                    <span className="rounded-md bg-[#fafaf8] px-2 py-1">CRM key: {user.ownerKey}</span>
                    {user.neoOwnerId ? <span className="rounded-md bg-[#fafaf8] px-2 py-1">NEO: {user.neoOwnerId}</span> : null}
                    {user.ownerAliases.length > 1 ? (
                      <span className="rounded-md bg-[#fafaf8] px-2 py-1">alias {user.ownerAliases.length}</span>
                    ) : null}
                  </div>
                  {canManageCapabilities ? (
                    <div className="mt-3 rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold text-[#111110]">계정별 실행 권한</p>
                        {user.userId && capabilityStates[user.userId]?.status === "saving" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#1a1a1a]/50">
                            <Loader2 className="h-3 w-3 animate-spin" /> 저장 중
                          </span>
                        ) : null}
                        {user.userId && capabilityStates[user.userId]?.status === "saved" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#084734]">
                            <Check className="h-3 w-3" /> 저장됨
                          </span>
                        ) : null}
                        {user.userId && capabilityStates[user.userId]?.status === "error" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#B85C33]">
                            <CircleAlert className="h-3 w-3" /> 저장 실패
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        {CAPABILITY_OPTIONS.map((option) => {
                          const enabled = user.capabilities?.includes(option.key) ?? false
                          const saving = user.userId
                            ? capabilityStates[user.userId]?.status === "saving"
                            : false
                          return (
                            <button
                              key={option.key}
                              type="button"
                              aria-pressed={enabled}
                              disabled={!user.userId || user.source !== "supabase" || saving}
                              onClick={() => onCapabilityToggle(user, option.key)}
                              className="flex w-full items-start gap-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5 text-left transition-colors hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <span
                                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  enabled
                                    ? "border-[#084734] bg-[#084734] text-white"
                                    : "border-[rgba(0,0,0,0.16)] bg-white text-transparent"
                                }`}
                              >
                                <Check className="h-3 w-3" />
                              </span>
                              <span>
                                <span className="block text-[12px] font-semibold text-[#111110]">{option.label}</span>
                                <span className="mt-0.5 block text-[11px] leading-relaxed text-[#1a1a1a]/45">
                                  {option.description}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      {user.role === "SUPER_ADMIN" ? (
                        <p className="mt-2 text-[11px] text-[#1a1a1a]/45">
                          SUPER_ADMIN은 개별 설정과 관계없이 모든 실행 권한을 가집니다.
                        </p>
                      ) : null}
                      {user.userId && capabilityStates[user.userId]?.status === "error" ? (
                        <p role="alert" className="mt-2 text-[11px] text-[#B85C33]">
                          {(capabilityStates[user.userId] as Extract<CapabilitySaveState, { status: "error" }>).message}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MembersPanel() {
  const [directory, setDirectory] = useState<AdminUsersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [canManageCapabilities, setCanManageCapabilities] = useState(false)
  const [capabilityStates, setCapabilityStates] = useState<
    Record<string, CapabilitySaveState | undefined>
  >({})

  useEffect(() => {
    adminFetchJsonCached<AdminUsersResponse>("/api/admin/users", undefined, { ttlMs: 60_000 })
      .then((data) => {
        setDirectory(data)
        setCanManageCapabilities(data.viewer?.role.toUpperCase() === "SUPER_ADMIN")
      })
      .finally(() => setLoading(false))
  }, [])

  const handleCapabilityToggle = async (user: AdminUser, capability: string) => {
    if (!canManageCapabilities || !user.userId || user.source !== "supabase") return

    const current = user.capabilities ?? []
    const capabilities = current.includes(capability)
      ? current.filter((item) => item !== capability)
      : [...current, capability]
    const userId = user.userId

    setCapabilityStates((previous) => ({
      ...previous,
      [userId]: { status: "saving" },
    }))

    try {
      const response = await adminFetchJson<{
        user: { user_id: string; capabilities: string[] }
      }>("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, capabilities }),
      })

      const updateUsers = (users: AdminUser[]) => users.map((item) =>
        item.userId === response.user.user_id
          ? { ...item, capabilities: response.user.capabilities }
          : item
      )

      setDirectory((previous) => previous ? {
        ...previous,
        users: updateUsers(previous.users),
        crmOwners: updateUsers(previous.crmOwners),
      } : previous)
      setCapabilityStates((previous) => ({
        ...previous,
        [userId]: { status: "saved" },
      }))
    } catch (error) {
      setCapabilityStates((previous) => ({
        ...previous,
        [userId]: {
          status: "error",
          message: error instanceof Error ? error.message : "권한을 저장하지 못했습니다.",
        },
      }))
    }
  }

  const crmOwners = directory?.crmOwners ?? []
  const branchDirectors = crmOwners.filter((user) => user.teamRole === "branch_director")
  const managers = crmOwners.filter((user) => user.teamRole === "manager")
  const others = (directory?.users ?? []).filter(
    (user) => user.teamRole !== "branch_director" && user.teamRole !== "manager"
  )

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-[#111110]">회원</h2>
        <p className="mt-1 text-[13px] text-[#1a1a1a]/45">
          지사장과 매니저 계정을 CRM 담당자 목록에 연결합니다. 매니저가 늘어나도 활성 Admin 계정 기준으로 자동 반영됩니다.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl bg-[#f0f0ec] px-4 py-3.5 text-[13px] text-[#1a1a1a]/60">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1a1a1a]/40" />
        <p>
          Supabase <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px]">admin_profiles</code>가 있으면
          이를 기준으로 표시하고, 개발 환경에서는{" "}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px]">ADMIN_USERS</code> env 계정으로 대체합니다.
        </p>
      </div>

      {directory?.health.ok === false && directory.health.message ? (
        <div className="rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
          {directory.health.message}
        </div>
      ) : null}

      {loading ? (
        <p className="text-[13px] text-[#1a1a1a]/30">불러오는 중...</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#e8e8e4] bg-white p-4">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">CRM 담당자</p>
              <p className="mt-1 text-2xl font-bold text-[#111110]">{crmOwners.length.toLocaleString("ko-KR")}</p>
            </div>
            <div className="rounded-xl border border-[#e8e8e4] bg-white p-4">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">지사장</p>
              <p className="mt-1 text-2xl font-bold text-[#111110]">{branchDirectors.length.toLocaleString("ko-KR")}</p>
            </div>
            <div className="rounded-xl border border-[#e8e8e4] bg-white p-4">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">매니저</p>
              <p className="mt-1 text-2xl font-bold text-[#084734]">{managers.length.toLocaleString("ko-KR")}</p>
            </div>
          </div>

          <UserSection
            title="지사장"
            icon={<Building2 className="h-4 w-4 text-[#1a1a1a]/40" />}
            users={branchDirectors}
            canManageCapabilities={canManageCapabilities}
            capabilityStates={capabilityStates}
            onCapabilityToggle={handleCapabilityToggle}
            empty="등록된 지사장 없음"
          />
          <UserSection
            title="매니저"
            icon={<UserRound className="h-4 w-4 text-[#1a1a1a]/40" />}
            users={managers}
            canManageCapabilities={canManageCapabilities}
            capabilityStates={capabilityStates}
            onCapabilityToggle={handleCapabilityToggle}
            empty="등록된 매니저 없음"
          />
          <UserSection
            title="기타 관리자"
            icon={<ShieldCheck className="h-4 w-4 text-[#1a1a1a]/40" />}
            users={others}
            canManageCapabilities={canManageCapabilities}
            capabilityStates={capabilityStates}
            onCapabilityToggle={handleCapabilityToggle}
            empty="기타 관리자 없음"
          />
        </div>
      )}
    </div>
  )
}
