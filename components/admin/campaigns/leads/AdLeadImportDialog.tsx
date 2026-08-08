"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { AlertCircle, ClipboardList, Loader2, X } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import { checkPastedLeads, parsePastedLeads } from "@/lib/crm/lead-paste"

// 캠페인 허브 "광고 리드 가져오기" — 광고 매체 리포트·오프라인 명단을 시트에서 그대로 붙여넣는다.
// 파서·행 검증은 리드 보드의 벌크 등록(LeadRegisterModal)과 같은 lib/crm/lead-paste를 쓴다.
// 다른 점은 유입 표기다: 여기서 들어온 리드는 광고 탭에서 다시 보여야 하므로
// source/utm_*를 함께 붙여 마케팅 렌즈·캠페인 축 롤업에 곧바로 잡히게 한다.

const MAX_ROWS = 500

interface ImportResult {
  created: number
  failed: number
  invalid?: number
  duplicates?: number
}

export default function AdLeadImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  /** 등록 성공 후 목록을 다시 불러오게 한다(로컬 낙관 삽입 없음 — 서버가 부여한 id·중복 판정이 진실). */
  onImported: () => void
}) {
  const [text, setText] = useState("")
  const [campaign, setCampaign] = useState("")
  const [sourceDetail, setSourceDetail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const reset = useCallback(() => {
    setText("")
    setCampaign("")
    setSourceDetail("")
    setError(null)
    setResult(null)
  }, [])

  // 작성 중 닫기(Escape 포함)는 확인을 거친다 — 붙여넣은 명단이 실수로 날아가지 않게.
  const close = useCallback(() => {
    if (!result && text.trim() && !window.confirm("붙여넣은 내용이 있습니다. 닫으면 사라집니다. 닫을까요?")) return
    reset()
    onClose()
  }, [onClose, reset, result, text])

  useDialogFocus(open, close, closeButtonRef)

  const checked = useMemo(() => checkPastedLeads(parsePastedLeads(text)), [text])
  const validRows = useMemo(
    () => checked.filter((row) => row.issues.length === 0).map((row) => row.row),
    [checked]
  )
  const excludedCount = checked.length - validRows.length
  const overLimit = validRows.length > MAX_ROWS

  if (!open) return null

  async function handleSubmit() {
    if (validRows.length === 0 || overLimit) return
    setSubmitting(true)
    setError(null)
    try {
      const trimmedCampaign = campaign.trim()
      const data = await adminFetchJson<ImportResult>("/api/admin/leads", {
        method: "POST",
        body: JSON.stringify({
          leads: validRows.map((row) => ({
            ...row,
            // 광고 유입 렌즈에 잡히도록 매체 표기를 붙인다 — 캠페인명을 적었으면 캠페인 축 롤업까지 함께 선다.
            source: "admin_manual",
            source_detail: sourceDetail.trim() || "캠페인 허브 가져오기",
            utm_medium: "cpc",
            utm_campaign: trimmedCampaign || undefined,
          })),
        }),
      })
      setResult(data)
      if (data.created > 0) onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : "리드 가져오기에 실패했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="광고 리드 가져오기"
        className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">가져오기</p>
            <h2 className="mt-0.5 flex items-center gap-1.5 text-base font-semibold text-[#111110]">
              <ClipboardList className="h-4 w-4" />
              광고 리드 붙여넣기
            </h2>
            <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
              엑셀·구글시트에서 복사해 그대로 붙여넣으세요. 학원명·이름·전화·이메일을 알아서 구분합니다.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={close}
            aria-label="닫기"
            className="text-[#1a1a1a]/40 hover:text-[#111110]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto px-4 py-4 sm:max-h-[70vh] sm:px-6">
          {result ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-[#ECFDF5] px-4 py-3">
                <p className="text-[13px] font-semibold text-[#084734]">{result.created}건을 등록했습니다.</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#084734]/70">
                  {result.duplicates ? `중복 ${result.duplicates}건 제외 · ` : ""}
                  {result.invalid ? `형식 불량 ${result.invalid}건 제외 · ` : ""}
                  실패 {result.failed}건
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] font-bold text-[#111110] hover:bg-[#F6F5F4]"
                >
                  계속 등록
                </button>
                <button
                  type="button"
                  onClick={() => {
                    reset()
                    onClose()
                  }}
                  className="rounded-md bg-[#084734] px-3 py-2 text-[12px] font-bold text-white hover:bg-[#063d2a]"
                >
                  닫기
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-medium text-[#1a1a1a]/55">캠페인명 (선택)</span>
                  <input
                    value={campaign}
                    onChange={(e) => setCampaign(e.target.value)}
                    placeholder="예: 2026 여름 HW"
                    className="mt-1 w-full rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:bg-white"
                  />
                  <span className="mt-1 block text-[10.5px] text-[#1a1a1a]/40">
                    적어두면 캠페인 축 롤업에서 이 묶음이 한 줄로 잡힙니다.
                  </span>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[#1a1a1a]/55">세부 유입 (선택)</span>
                  <input
                    value={sourceDetail}
                    onChange={(e) => setSourceDetail(e.target.value)}
                    placeholder="예: 네이버 GFA 리포트"
                    className="mt-1 w-full rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:bg-white"
                  />
                  <span className="mt-1 block text-[10.5px] text-[#1a1a1a]/40">
                    비우면 &quot;캠페인 허브 가져오기&quot;로 기록됩니다.
                  </span>
                </label>
              </div>

              <label className="block">
                <span className="text-[11px] font-medium text-[#1a1a1a]/55">명단 붙여넣기</span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  placeholder={"학원명\t담당자\t연락처\t이메일\n클래스인 영어학원\t김원장\t010-1111-2222\towner@example.com"}
                  className="mt-1 w-full rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2 font-mono text-[12px] leading-relaxed text-[#111110] outline-none focus:border-[#084734] focus:bg-white"
                />
              </label>

              {checked.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-[#e8e8e4]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0f0ec] bg-[#fafaf8] px-3 py-2 text-[11px]">
                    <span className="font-semibold text-[#111110]">
                      등록 대상 {validRows.length}건
                      {excludedCount > 0 ? ` · 제외 ${excludedCount}건` : ""}
                    </span>
                    <span className="text-[#1a1a1a]/40">미리보기 상위 8행</span>
                  </div>
                  <div className="divide-y divide-[#f0f0ec]">
                    {checked.slice(0, 8).map((item, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between gap-3 px-3 py-2 text-[12px] ${
                          item.issues.length > 0 ? "bg-amber-50/60" : ""
                        }`}
                      >
                        <span className="min-w-0 truncate text-[#111110]">
                          {[item.row.org, item.row.name, item.row.phone, item.row.email].filter(Boolean).join(" · ")}
                        </span>
                        {item.issues.length > 0 ? (
                          <span className="shrink-0 text-[11px] font-medium text-[#B85C33]">
                            제외 · {item.issues.join(", ")}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {overLimit && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>한 번에 등록할 수 있는 리드는 최대 {MAX_ROWS}행입니다. 나눠서 붙여넣으세요.</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] font-bold text-[#111110] hover:bg-[#F6F5F4]"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting || validRows.length === 0 || overLimit}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-2 text-[12px] font-bold text-white transition hover:bg-[#063d2a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {validRows.length > 0 ? `${validRows.length}건 등록` : "등록"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
