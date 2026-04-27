"use client"
import { useEffect, useState } from "react"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
interface Issue { id: string; severity: "info"|"warn"|"error"; message: string; samples?: unknown[] }
const TONE: Record<Issue["severity"], string> = {
  info: "border-sky-200 bg-sky-50 text-sky-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
}

export default function DataQualityPanel({ refreshKey }: { refreshKey: number }) {
  const [issues, setIssues] = useState<Issue[] | null>(null)
  useEffect(() => {
    adminFetch("/api/admin/branch/data-quality")
      .then((r) => r.json())
      .then((d) => setIssues((d.issues as Issue[]) ?? []))
      .catch(() => setIssues([]))
  }, [refreshKey])
  if (!issues) return <div className="h-32 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">데이터 품질 점검</h2>
      <div className="space-y-2">
        {issues.length === 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-700">
            현재 검출된 이슈 없음
          </div>
        )}
        {issues.map((i) => (
          <details key={`${i.id}-${i.message}`} className={`rounded-2xl border p-3 text-[12px] ${TONE[i.severity]}`}>
            <summary className="cursor-pointer">
              <span className="font-medium">[{i.id}]</span> {i.message}
            </summary>
            {i.samples && i.samples.length > 0 && (
              <pre className="mt-2 max-h-40 overflow-auto rounded bg-white/40 p-2 text-[11px]">
                {JSON.stringify(i.samples, null, 2)}
              </pre>
            )}
          </details>
        ))}
      </div>
    </section>
  )
}
