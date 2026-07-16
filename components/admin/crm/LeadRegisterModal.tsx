"use client"

import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { CheckCircle2, ClipboardList, Loader2, Plus, UserPlus, X } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"

interface BulkRow {
  org?: string
  name?: string
  phone?: string
  email?: string
}

// 붙여넣기(엑셀/구글시트 TSV·CSV·줄단위)를 리드 행으로. 헤더가 있으면 컬럼 매핑, 없으면 내용으로 추론.
function parseBulk(text: string): BulkRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : "\t"
  const firstCols = lines[0].split(delim).map((c) => c.trim().toLowerCase())
  const headerHit = firstCols.some((c) => /학원|기관|회사|업체|org|이름|name|담당|전화|phone|연락|email|이메일|메일/.test(c))

  const colMap: { org?: number; name?: number; phone?: number; email?: number } = {}
  let dataLines = lines
  if (headerHit) {
    firstCols.forEach((c, i) => {
      if (colMap.org == null && /학원|기관|회사|업체|org/.test(c)) colMap.org = i
      else if (colMap.name == null && /이름|name|담당|성함/.test(c)) colMap.name = i
      else if (colMap.phone == null && /전화|phone|연락|휴대|hp|핸드/.test(c)) colMap.phone = i
      else if (colMap.email == null && /email|이메일|메일/.test(c)) colMap.email = i
    })
    dataLines = lines.slice(1)
  }

  return dataLines
    .map<BulkRow>((line) => {
      const cols = line.split(delim).map((c) => c.trim())
      if (headerHit) {
        return {
          org: colMap.org != null ? cols[colMap.org] || undefined : undefined,
          name: colMap.name != null ? cols[colMap.name] || undefined : undefined,
          phone: colMap.phone != null ? cols[colMap.phone] || undefined : undefined,
          email: colMap.email != null ? cols[colMap.email] || undefined : undefined,
        }
      }
      // 헤더 없음: @=이메일, 숫자많음=전화, 나머지 앞에서부터 학원/이름.
      let email: string | undefined
      let phone: string | undefined
      const rest: string[] = []
      for (const c of cols) {
        if (!c) continue
        if (c.includes("@")) email = email ?? c
        else if (/^[\d()+\-\s]{8,}$/.test(c)) phone = phone ?? c
        else rest.push(c)
      }
      return { org: rest[0], name: rest[1], phone, email }
    })
    .filter((r) => r.org || r.name || r.phone || r.email)
}

const EMPTY_SINGLE = { org: "", name: "", phone: "", email: "", source: "", notes: "" }

export default function LeadRegisterModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone?: (created: number) => void
}) {
  const [tab, setTab] = useState<"single" | "bulk">("single")
  const [single, setSingle] = useState(EMPTY_SINGLE)
  const [bulkText, setBulkText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; failed: number; firstId?: string | null } | null>(null)

  const bulkRows = useMemo(() => parseBulk(bulkText), [bulkText])

  if (!open || typeof document === "undefined") return null

  // 작성 중(단건 입력 or 벌크 붙여넣기) 닫기 시 실수로 내용이 날아가지 않게 확인한다.
  const isDirty =
    Boolean(single.org || single.name || single.phone || single.email || single.source || single.notes) ||
    Boolean(bulkText.trim())

  const close = () => {
    if (isDirty && !result && !window.confirm("작성 중인 내용이 있습니다. 닫으면 사라집니다. 닫을까요?")) return
    setError(null)
    setResult(null)
    setSingle(EMPTY_SINGLE)
    setBulkText("")
    onClose()
  }

  const submitSingle = async () => {
    if (!single.org && !single.name && !single.phone && !single.email) {
      setError("학원명·이름·전화·이메일 중 하나는 입력하세요.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await adminFetchJson<{ created: number; failed: number; firstId?: string | null }>("/api/admin/leads", {
        method: "POST",
        body: JSON.stringify({ ...single, source: single.source || undefined }),
      })
      setResult({ created: res.created, failed: res.failed, firstId: res.firstId })
      setSingle(EMPTY_SINGLE)
      onDone?.(res.created)
    } catch (err) {
      setError(err instanceof Error ? err.message : "리드 등록에 실패했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  const submitBulk = async () => {
    if (bulkRows.length === 0) {
      setError("붙여넣은 리드가 없습니다.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await adminFetchJson<{ created: number; failed: number; total: number; firstId?: string | null }>("/api/admin/leads", {
        method: "POST",
        body: JSON.stringify({ leads: bulkRows }),
      })
      setResult({ created: res.created, failed: res.failed, firstId: res.firstId })
      setBulkText("")
      onDone?.(res.created)
    } catch (err) {
      setError(err instanceof Error ? err.message : "벌크 등록에 실패했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  const field = (key: keyof typeof EMPTY_SINGLE, label: string, placeholder: string) => (
    <div>
      <label className="text-[11px] font-semibold text-[#1a1a1a]/40">{label}</label>
      <input
        value={single[key]}
        onChange={(e) => setSingle((s) => ({ ...s, [key]: e.target.value }))}
        placeholder={placeholder}
        className="mt-1 h-9 w-full rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[13px] text-[#111110] outline-none focus:border-[#084734]"
      />
    </div>
  )

  // document.body로 포털 — RouteTransition 래퍼 등 조상 transform이 fixed의 containing block이
  // 되면 모달이 콘텐츠 박스 중앙(뷰포트 밖)에 떠서 "안 열리는" 증상이 되는 문제를 차단한다.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20" onClick={close} aria-hidden />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e8e8e4] px-5 py-4">
          <h2 className="flex items-center gap-2 text-[16px] font-bold text-[#111110]">
            <UserPlus className="h-4 w-4 text-[#084734]" />
            리드 등록
          </h2>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2]"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="inline-flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-0.5">
            {(
              [
                { key: "single", label: "단건", icon: <Plus className="h-3.5 w-3.5" /> },
                { key: "bulk", label: "벌크 붙여넣기", icon: <ClipboardList className="h-3.5 w-3.5" /> },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTab(t.key)
                  setResult(null)
                  setError(null)
                }}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors ${
                  tab === t.key ? "bg-[#111110] text-white" : "text-[#1a1a1a]/55 hover:text-[#111110]"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {result ? (
            <div className="rounded-xl border border-[#D7EBDD] bg-[#ECFDF5] px-4 py-4 text-center">
              <CheckCircle2 className="mx-auto h-6 w-6 text-[#084734]" />
              <p className="mt-2 text-[14px] font-bold text-[#111110]">
                {result.created.toLocaleString("ko-KR")}건 등록 완료
              </p>
              {result.failed > 0 ? (
                <p className="mt-0.5 text-[12px] text-[#B85C33]">{result.failed}건 실패 (식별자 누락 등)</p>
              ) : null}
              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
                >
                  계속 등록
                </button>
                {result.created === 1 && result.firstId ? (
                  <Link
                    href={`/admin/crm/customers/leads?lead=${encodeURIComponent(result.firstId)}`}
                    onClick={() => onClose()}
                    className="inline-flex h-8 items-center rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    방금 등록한 리드 열기
                  </Link>
                ) : null}
              </div>
            </div>
          ) : tab === "single" ? (
            <div className="grid grid-cols-2 gap-3">
              {field("org", "학원명", "예: 강남청담어학원")}
              {field("name", "담당자 이름", "예: 이수진 원장")}
              {field("phone", "전화", "010-0000-0000")}
              {field("email", "이메일", "name@example.com")}
              {field("source", "유입 경로", "예: 행사·소개·웹")}
              {field("notes", "메모", "비고")}
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-[12px] text-[#1a1a1a]/45">
                엑셀/구글시트에서 복사하거나 줄 단위로 붙여넣으세요. 헤더(학원명·이름·전화·이메일)가 있으면 자동 매핑됩니다.
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={7}
                placeholder={"학원명\t이름\t전화\t이메일\n강남청담어학원\t이수진\t010-1234-5678\tlee@example.com"}
                className="w-full rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-2 font-mono text-[12px] text-[#111110] outline-none focus:border-[#084734]"
              />
              {bulkRows.length > 0 ? (
                <div className="mt-2">
                  <p className="mb-1 text-[11px] font-semibold text-[#1a1a1a]/45">
                    미리보기 {bulkRows.length}건 (상위 5)
                  </p>
                  <div className="overflow-hidden rounded-lg border border-[#f0f0ec]">
                    {bulkRows.slice(0, 5).map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 border-b border-[#f5f5f2] px-2.5 py-1.5 text-[12px] last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-[#111110]">
                          {r.org ?? r.name ?? "—"}
                        </span>
                        <span className="truncate text-[#1a1a1a]/45">{r.phone ?? r.email ?? ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {error ? (
            <p className="mt-3 rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
              {error}
            </p>
          ) : null}
        </div>

        {!result ? (
          <div className="flex items-center justify-end gap-2 border-t border-[#e8e8e4] px-5 py-3">
            <button
              type="button"
              onClick={close}
              className="inline-flex h-9 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/60 transition-colors hover:bg-[#f5f5f2]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void (tab === "single" ? submitSingle() : submitBulk())}
              disabled={submitting || (tab === "bulk" && bulkRows.length === 0)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#084734] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              {tab === "single" ? "리드 등록" : `${bulkRows.length}건 등록`}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
