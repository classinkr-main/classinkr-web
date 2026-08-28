"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { CheckCircle2, ClipboardList, Loader2, Plus, UserPlus, X } from "lucide-react"

import { adminFetch, adminFetchJson } from "@/lib/admin-client"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
// 붙여넣기 파서·행 검증은 lib/crm/lead-paste가 SSOT — 캠페인 허브의 리드 가져오기와 공유한다.
import { checkPastedLeads, parsePastedLeads } from "@/lib/crm/lead-paste"
import type { CompassDuplicateWarning } from "@/lib/compass/overlay"

const EMPTY_SINGLE = { org: "", name: "", phone: "", email: "", source: "", notes: "" }

/**
 * Compass 교차 중복 경고 — 우리 테이블 중복(409)과 다른 축이다.
 * 우리 쪽에 없어도 마케팅팀이 이미 콜을 돌리고 있으면 알린다. **차단이 아니라 경고**라
 * 등록은 이미 끝났거나 그대로 진행된다. 톤은 아웃라인 주의색(채움 금지).
 */
function CompassDuplicateNotice({
  warning,
  extraCount = 0,
  registered,
}: {
  warning: CompassDuplicateWarning
  extraCount?: number
  /** 이 요청으로 실제 등록이 일어났는지 — 409(우리 쪽 중복)로 막힌 경우와 문구를 나눈다. */
  registered: boolean
}) {
  const who = warning.academy || warning.name || "학원명 미기재"
  const staff = warning.caller || warning.owner
  const parts = [who, warning.stageLabel, staff ? `담당 ${staff}` : null].filter(Boolean)
  return (
    <div className="mt-3 rounded-lg border border-[#ECD29C] bg-white px-3 py-2 text-left">
      <p className="text-[12px] font-semibold text-[#7A520F]">
        이미 마케팅팀이 콜 진행 중 — {parts.join(" · ")}
      </p>
      <p className="mt-0.5 text-[11px] text-[#1a1a1a]/50">
        {registered ? "등록은 그대로 진행됐습니다. " : ""}
        같은 학원을 두 원장에서 따로 굴리지 않도록 Compass 쪽 진행 상황을 먼저 확인하세요.
        {extraCount > 1 ? ` (이 요청에서 Compass에 이미 있는 건 ${extraCount.toLocaleString("ko-KR")}건)` : ""}
      </p>
      <a
        href={warning.url}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex font-semibold text-[12px] text-[#7A520F] underline underline-offset-2"
      >
        Compass에서 열기
      </a>
    </div>
  )
}

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
  // 단건 중복(409) 시 기존 리드로 바로 이동할 수 있게 id를 따로 든다.
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  // Compass(마케팅팀 앱) 교차 중복 — 등록을 막지 않고 병기하는 경고.
  const [compassDuplicate, setCompassDuplicate] = useState<CompassDuplicateWarning | null>(null)
  const [compassDuplicateCount, setCompassDuplicateCount] = useState(0)
  // 브리지 장애로 대조를 못 한 경우 — "겹치는 리드 없음"과 구분해서 말한다.
  const [compassDown, setCompassDown] = useState(false)
  const [result, setResult] = useState<{
    created: number
    failed: number
    invalid?: number
    duplicates?: number
    firstId?: string | null
  } | null>(null)

  const bulkRows = useMemo(() => parsePastedLeads(bulkText), [bulkText])
  // 행별 검증 — 제외 행도 사유와 함께 미리보기에 남겨 "왜 줄었는지"를 등록 전에 보여준다.
  const checkedRows = useMemo(() => checkPastedLeads(bulkRows), [bulkRows])
  const validRows = useMemo(
    () => checkedRows.filter((checked) => checked.issues.length === 0).map((checked) => checked.row),
    [checkedRows]
  )
  const excludedCount = bulkRows.length - validRows.length

  // 작성 중(단건 입력 or 벌크 붙여넣기) 닫기 시 실수로 내용이 날아가지 않게 확인한다.
  const isDirty =
    Boolean(single.org || single.name || single.phone || single.email || single.source || single.notes) ||
    Boolean(bulkText.trim())

  const close = useCallback(() => {
    if (isDirty && !result && !window.confirm("작성 중인 내용이 있습니다. 닫으면 사라집니다. 닫을까요?")) return
    setError(null)
    setDuplicateId(null)
    setCompassDuplicate(null)
    setCompassDuplicateCount(0)
    setCompassDown(false)
    setResult(null)
    setSingle(EMPTY_SINGLE)
    setBulkText("")
    onClose()
  }, [isDirty, result, onClose])

  // Escape 닫기 + Tab 포커스 트랩 + 이전 포커스 복귀. 이 모달은 셋 다 없어서 키보드 사용자가
  // Escape로 닫지 못하고, Tab이 배경 페이지로 새어 나갔다(aria-modal 계약 위반).
  // 훅은 조기 반환보다 위에 둔다 — open 토글마다 호출 순서가 달라지면 안 된다.
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(open, close, closeButtonRef)

  if (!open || typeof document === "undefined") return null

  const submitSingle = async () => {
    if (!single.org && !single.name && !single.phone && !single.email) {
      setError("학원명·이름·전화·이메일 중 하나는 입력하세요.")
      return
    }
    // 형식 검사가 전혀 없어 "asdf" 같은 값도 그대로 저장됐다. 나중에 문자·메일 발송이
    // 조용히 실패하는 연락처가 CRM에 쌓인다. 벌크 파서와 같은 기준을 쓴다.
    const phone = single.phone.trim()
    if (phone && !/^[\d()+\-\s]{8,}$/.test(phone)) {
      setError("전화번호 형식을 확인하세요. 숫자와 - ( ) + 공백만 쓸 수 있고 8자 이상이어야 합니다.")
      return
    }
    const email = single.email.trim()
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setError("이메일 형식을 확인하세요. 예: name@example.com")
      return
    }
    setSubmitting(true)
    setError(null)
    setDuplicateId(null)
    setCompassDuplicate(null)
    setCompassDuplicateCount(0)
    setCompassDown(false)
    try {
      // 409(중복)는 본문의 existingId까지 읽어야 해서 예외로 뭉개는 adminFetchJson 대신
      // 원시 응답을 직접 다룬다.
      const response = await adminFetch("/api/admin/leads", {
        method: "POST",
        body: JSON.stringify({ ...single, source: single.source || undefined }),
      })
      const data = (await response.json().catch(() => null)) as
        | {
            created?: number
            failed?: number
            invalid?: number
            duplicates?: number
            firstId?: string | null
            error?: string
            existingId?: string | null
            compassDuplicate?: CompassDuplicateWarning | null
            compassDuplicates?: number
            compassDown?: boolean
          }
        | null
      if (response.status === 409) {
        setDuplicateId(data?.existingId ?? null)
        setCompassDuplicate(data?.compassDuplicate ?? null)
        setCompassDuplicateCount(data?.compassDuplicates ?? 0)
        setCompassDown(Boolean(data?.compassDown))
        setError(data?.error ?? "이미 등록된 리드입니다(전화/이메일 일치).")
        return
      }
      if (!response.ok || !data) {
        throw new Error(data?.error ?? "리드 등록에 실패했습니다.")
      }
      setCompassDuplicate(data.compassDuplicate ?? null)
      setCompassDuplicateCount(data.compassDuplicates ?? 0)
      setCompassDown(Boolean(data.compassDown))
      setResult({
        created: data.created ?? 0,
        failed: data.failed ?? 0,
        invalid: data.invalid,
        duplicates: data.duplicates,
        firstId: data.firstId,
      })
      setSingle(EMPTY_SINGLE)
      onDone?.(data.created ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : "리드 등록에 실패했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  const submitBulk = async () => {
    if (validRows.length === 0) {
      setError("붙여넣은 유효한 리드가 없습니다.")
      return
    }
    setSubmitting(true)
    setError(null)
    setDuplicateId(null)
    setCompassDuplicate(null)
    setCompassDuplicateCount(0)
    setCompassDown(false)
    try {
      const res = await adminFetchJson<{
        created: number
        failed: number
        total: number
        invalid?: number
        duplicates?: number
        firstId?: string | null
        compassDuplicate?: CompassDuplicateWarning | null
        compassDuplicates?: number
        compassDown?: boolean
      }>("/api/admin/leads", {
        method: "POST",
        // 형식 불량 행은 서버에서도 거르지만, 미리보기에서 제외로 안내한 행만 보낸다.
        body: JSON.stringify({ leads: validRows }),
      })
      setCompassDuplicate(res.compassDuplicate ?? null)
      setCompassDuplicateCount(res.compassDuplicates ?? 0)
      setCompassDown(Boolean(res.compassDown))
      setResult({
        created: res.created,
        failed: res.failed,
        // 클라이언트에서 이미 제외한 형식 오류 행도 결과에 합산해 보여준다.
        invalid: (res.invalid ?? 0) + excludedCount,
        duplicates: res.duplicates,
        firstId: res.firstId,
      })
      setBulkText("")
      onDone?.(res.created)
    } catch (err) {
      setError(err instanceof Error ? err.message : "벌크 등록에 실패했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  // label↔input을 id로 묶는다 — 라벨 클릭 포커스와 스크린리더 필드명 낭독이 여기에 걸린다.
  const field = (key: keyof typeof EMPTY_SINGLE, label: string, placeholder: string) => (
    <div>
      <label htmlFor={`crm-lead-field-${key}`} className="text-[11px] font-semibold text-[#1a1a1a]/40">
        {label}
      </label>
      <input
        id={`crm-lead-field-${key}`}
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
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-lead-register-title"
      >
        <div className="flex items-center justify-between border-b border-[#e8e8e4] px-5 py-4">
          <h2 id="crm-lead-register-title" className="flex items-center gap-2 text-[16px] font-bold text-[#111110]">
            <UserPlus className="h-4 w-4 text-[#084734]" />
            리드 등록
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2]"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div
            role="tablist"
            aria-label="리드 등록 방식"
            className="inline-flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-0.5"
          >
            {(
              [
                { key: "single", label: "단건", icon: <Plus className="h-3.5 w-3.5" /> },
                { key: "bulk", label: "벌크 붙여넣기", icon: <ClipboardList className="h-3.5 w-3.5" /> },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => {
                  setTab(t.key)
                  setResult(null)
                  setError(null)
                  setDuplicateId(null)
                  setCompassDuplicate(null)
                  setCompassDuplicateCount(0)
                  setCompassDown(false)
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
                {[
                  `${result.created.toLocaleString("ko-KR")}건 등록`,
                  result.duplicates ? `중복 ${result.duplicates.toLocaleString("ko-KR")}건 건너뜀` : null,
                  result.invalid ? `형식 오류 ${result.invalid.toLocaleString("ko-KR")}건` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {result.failed > 0 ? (
                <p className="mt-0.5 text-[12px] text-[#B85C33]">{result.failed}건 저장 실패</p>
              ) : null}
              {compassDuplicate ? (
                <CompassDuplicateNotice warning={compassDuplicate} extraCount={compassDuplicateCount} registered />
              ) : compassDown ? (
                <p className="mt-2 text-[11px] text-[#84827a]">
                  Compass 연결 끊김 — 마케팅팀이 이미 콜 중인 학원인지 대조하지 못했습니다(겹치는 리드가 없다는
                  뜻이 아닙니다).
                </p>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    미리보기 유효 {validRows.length}건
                    {excludedCount > 0 ? ` · 제외 ${excludedCount}건` : ""} (상위 5)
                  </p>
                  <div className="overflow-hidden rounded-lg border border-[#f0f0ec]">
                    {checkedRows.slice(0, 5).map(({ row: r, issues }, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 border-b border-[#f5f5f2] px-2.5 py-1.5 text-[12px] last:border-b-0 ${
                          issues.length > 0 ? "opacity-45" : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-[#111110]">
                          {r.org ?? r.name ?? "—"}
                        </span>
                        <span className="truncate text-[#1a1a1a]/45">{r.phone ?? r.email ?? ""}</span>
                        {issues.length > 0 ? (
                          <span className="shrink-0 font-semibold text-[#B85C33]">제외 · {issues.join(" · ")}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {error ? (
            <div className="mt-3 rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
              <p>{error}</p>
              {duplicateId ? (
                <Link
                  href={`/admin/crm/customers/leads?lead=${encodeURIComponent(duplicateId)}`}
                  onClick={() => onClose()}
                  className="mt-1 inline-flex font-semibold text-[#084734] underline underline-offset-2"
                >
                  기존 리드 열기
                </Link>
              ) : null}
            </div>
          ) : null}

          {/* 등록 실패(에러 블록)와 별개 축 — 우리 쪽 결과와 무관하게 Compass 상태를 알린다. */}
          {!result && compassDuplicate ? (
            <CompassDuplicateNotice
              warning={compassDuplicate}
              extraCount={compassDuplicateCount}
              registered={false}
            />
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
              disabled={submitting || (tab === "bulk" && validRows.length === 0)}
              title={tab === "bulk" && validRows.length === 0 ? "붙여넣은 유효한 리드가 없습니다" : undefined}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#084734] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              {tab === "single" ? "리드 등록" : `${validRows.length}건 등록`}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
