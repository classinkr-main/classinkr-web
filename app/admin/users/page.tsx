"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Building2, Info, ShieldCheck, UserRound } from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"

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
}

interface AdminUsersResponse {
  generatedAt: string
  source: "supabase" | "env" | "fallback"
  health: {
    ok: boolean
    message: string | null
  }
  users: AdminUser[]
  crmOwners: AdminUser[]
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
}: {
  title: string
  icon: ReactNode
  users: AdminUser[]
  empty: string
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
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function UsersPage() {
  const [directory, setDirectory] = useState<AdminUsersResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminFetchJsonCached<AdminUsersResponse>("/api/admin/users", undefined, { ttlMs: 60_000 })
      .then((data) => setDirectory(data))
      .finally(() => setLoading(false))
  }, [])

  const crmOwners = directory?.crmOwners ?? []
  const branchDirectors = crmOwners.filter((user) => user.teamRole === "branch_director")
  const managers = crmOwners.filter((user) => user.teamRole === "manager")
  const others = (directory?.users ?? []).filter(
    (user) => user.teamRole !== "branch_director" && user.teamRole !== "manager"
  )

  return (
    <div className="max-w-3xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-20 lg:pt-10">
      <div className="mb-6 sm:mb-8">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Admin</p>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">회원 관리</h1>
        <p className="mt-1 text-[13px] text-[#1a1a1a]/45">
          지사장과 매니저 계정을 CRM 담당자 목록에 연결합니다. 매니저가 늘어나도 활성 Admin 계정 기준으로 자동 반영됩니다.
        </p>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-xl bg-[#f0f0ec] px-4 py-3.5 text-[13px] text-[#1a1a1a]/60">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1a1a1a]/40" />
        <p>
          Supabase <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px]">admin_profiles</code>가 있으면
          이를 기준으로 표시하고, 개발 환경에서는{" "}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px]">ADMIN_USERS</code> env 계정으로 대체합니다.
        </p>
      </div>

      {directory?.health.ok === false && directory.health.message ? (
        <div className="mb-5 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
          {directory.health.message}
        </div>
      ) : null}

      {loading ? (
        <p className="text-[13px] text-[#1a1a1a]/30">불러오는 중...</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-4">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">CRM 담당자</p>
              <p className="mt-1 text-2xl font-bold text-[#111110]">{crmOwners.length.toLocaleString("ko-KR")}</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">지사장</p>
              <p className="mt-1 text-2xl font-bold text-[#111110]">{branchDirectors.length.toLocaleString("ko-KR")}</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">매니저</p>
              <p className="mt-1 text-2xl font-bold text-[#084734]">{managers.length.toLocaleString("ko-KR")}</p>
            </div>
          </div>

          <UserSection
            title="지사장"
            icon={<Building2 className="h-4 w-4 text-[#1a1a1a]/40" />}
            users={branchDirectors}
            empty="등록된 지사장 없음"
          />
          <UserSection
            title="매니저"
            icon={<UserRound className="h-4 w-4 text-[#1a1a1a]/40" />}
            users={managers}
            empty="등록된 매니저 없음"
          />
          <UserSection
            title="기타 관리자"
            icon={<ShieldCheck className="h-4 w-4 text-[#1a1a1a]/40" />}
            users={others}
            empty="기타 관리자 없음"
          />
        </div>
      )}
    </div>
  )
}
