"use client"

import { useState, useEffect } from "react"
import { ShieldCheck, Building2, Info } from "lucide-react"

interface AdminUser {
  name: string
  role: "admin" | "branch"
  branch?: string
}

function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

const ROLE_LABEL = { admin: "관리자", branch: "지사장" }
const ROLE_COLOR = {
  admin: "bg-[#111110] text-white",
  branch: "bg-blue-50 text-blue-600",
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminFetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .finally(() => setLoading(false))
  }, [])

  const admins = users.filter((u) => u.role === "admin")
  const branches = users.filter((u) => u.role === "branch")

  return (
    <div className="px-8 pt-12 pb-20 max-w-2xl">
      <div className="mb-8">
        <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
        <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">회원 관리</h1>
      </div>

      <div className="flex items-start gap-3 bg-[#f0f0ec] rounded-xl px-4 py-3.5 mb-6 text-[13px] text-[#1a1a1a]/60">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#1a1a1a]/40" />
        <p>
          계정 추가·삭제는 서버의 <code className="font-mono bg-white px-1.5 py-0.5 rounded text-[12px]">.env.local</code> 파일의{" "}
          <code className="font-mono bg-white px-1.5 py-0.5 rounded text-[12px]">ADMIN_USERS</code> 값을 수정하세요.
        </p>
      </div>

      {loading ? (
        <p className="text-[13px] text-[#1a1a1a]/30">불러오는 중...</p>
      ) : (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e8e8e4]">
              <ShieldCheck className="w-4 h-4 text-[#1a1a1a]/40" />
              <h2 className="text-[13px] font-semibold text-[#111110]">팀원</h2>
              <span className="ml-auto text-[12px] text-[#1a1a1a]/40">{admins.length}명</span>
            </div>
            {admins.length === 0 ? (
              <p className="text-center py-8 text-[13px] text-[#1a1a1a]/30">팀원 없음</p>
            ) : (
              <ul>
                {admins.map((u, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-[#e8e8e4] last:border-0">
                    <div className="w-8 h-8 rounded-full bg-[#111110] flex items-center justify-center text-[12px] font-bold text-white shrink-0">
                      {u.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-medium text-[#111110]">{u.name}</p>
                      <p className="text-[11px] text-[#1a1a1a]/40">전체 접근 권한</p>
                    </div>
                    <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${ROLE_COLOR[u.role]}`}>
                      {ROLE_LABEL[u.role]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e8e8e4]">
              <Building2 className="w-4 h-4 text-[#1a1a1a]/40" />
              <h2 className="text-[13px] font-semibold text-[#111110]">지사장</h2>
              <span className="ml-auto text-[12px] text-[#1a1a1a]/40">{branches.length}명</span>
            </div>
            {branches.length === 0 ? (
              <p className="text-center py-8 text-[13px] text-[#1a1a1a]/30">등록된 지사장 없음</p>
            ) : (
              <ul>
                {branches.map((u, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-[#e8e8e4] last:border-0">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[12px] font-bold text-blue-600 shrink-0">
                      {u.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-medium text-[#111110]">{u.name}</p>
                      <p className="text-[11px] text-[#1a1a1a]/40">{u.branch ?? "지사 미지정"} · 본인 지사만 열람</p>
                    </div>
                    <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${ROLE_COLOR[u.role]}`}>
                      {ROLE_LABEL[u.role]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
