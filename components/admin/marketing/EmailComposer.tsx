/**
 * EmailComposer — 이메일 캠페인 작성 & 발송
 * - 변수 블록 카드 (클릭 → 커서 위치에 삽입)
 * - 실시간 미리보기 (에디터 아래 확장 패널, 이메일 프레임)
 * - 테스트 계정 저장 (localStorage, 빠른 선택 칩)
 * - 발송 확인 모달 (window.confirm 완전 제거)
 */

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MailCheck,
  Plus,
  Send,
  X,
} from "lucide-react"
import { adminFetch } from "@/lib/admin-client"
import type { EmailDraft } from "@/lib/marketing-types"
import TagSelector from "./TagSelector"

interface Props {
  value: EmailDraft
  onChange: (value: EmailDraft) => void
  onSend: (data: EmailDraft) => Promise<void>
  loading?: boolean
  subscriberCount: number
  countMap?: Record<string, number>
  presendWarnings?: string[]
  presendErrors?: string[]
  selectedAudience?: number
}

// ── 변수 메타 ─────────────────────────────────────────────────
const VARIABLES = [
  {
    token: "{name}",
    label: "이름",
    example: "김원장",
    hint: "수신자 이름으로 치환",
  },
  {
    token: "{org}",
    label: "학원명",
    example: "클래스인 아카데미",
    hint: "소속 기관으로 치환",
  },
  {
    token: "{role}",
    label: "직책",
    example: "원장",
    hint: "직책·역할로 치환",
  },
]

// ── 테스트 계정 로컬스토리지 ──────────────────────────────────
const TEST_ACCOUNTS_KEY = "classin.admin.testAccounts.v1"

function loadTestAccounts(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(TEST_ACCOUNTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
  } catch {
    return []
  }
}

function saveTestAccounts(accounts: string[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(TEST_ACCOUNTS_KEY, JSON.stringify(accounts))
}

// ── 변수 치환 헬퍼 ────────────────────────────────────────────
const PREVIEW_SAMPLE = { name: "김원장", org: "클래스인 아카데미", role: "원장" }

function applyVariables(text: string) {
  return text
    .replace(/\{name\}/g, PREVIEW_SAMPLE.name)
    .replace(/\{org\}/g, PREVIEW_SAMPLE.org)
    .replace(/\{role\}/g, PREVIEW_SAMPLE.role)
}
export default function EmailComposer({
  value,
  onChange,
  onSend,
  loading,
  subscriberCount,
  countMap,
  presendWarnings = [],
  presendErrors = [],
  selectedAudience,
}: Props) {
  const [showPreview, setShowPreview] = useState(false)

  // 테스트 계정
  const [testAccounts, setTestAccounts] = useState<string[]>(() => loadTestAccounts())
  const [testEmail, setTestEmail] = useState("")
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // 발송 확인 모달
  const [showConfirm, setShowConfirm] = useState(false)
  const [sendingConfirmed, setSendingConfirmed] = useState(false)

  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // 테스트 계정 localStorage 동기화
  useEffect(() => {
    saveTestAccounts(testAccounts)
  }, [testAccounts])

  const updateDraft = (next: Partial<EmailDraft>) => onChange({ ...value, ...next })

  // 변수 삽입 — textarea cursor 위치 정확 삽입
  const insertVariable = (token: string) => {
    const el = bodyRef.current
    if (!el) {
      updateDraft({ body: value.body + token })
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    updateDraft({ body: value.body.slice(0, start) + token + value.body.slice(end) })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  // 테스트 계정 저장
  const addTestAccount = () => {
    const email = testEmail.trim()
    if (!email || testAccounts.includes(email)) return
    setTestAccounts((prev) => [email, ...prev].slice(0, 5))
  }

  const removeTestAccount = (email: string) => {
    setTestAccounts((prev) => prev.filter((e) => e !== email))
    if (testEmail === email) setTestEmail("")
  }

  // 테스트 발송
  const handleTestSend = async (overrideEmail?: string) => {
    const target = (overrideEmail ?? testEmail).trim()
    if (!target || !value.subject.trim() || !value.body.trim()) return
    setTestLoading(true)
    setTestResult(null)
    if (!testAccounts.includes(target)) {
      setTestAccounts((prev) => [target, ...prev].slice(0, 5))
    }
    try {
      const res = await adminFetch("/api/admin/email/send", {
        method: "POST",
        body: JSON.stringify({ subject: value.subject, body: value.body, targetTags: value.targetTags, mode: "test", testEmail: target }),
      })
      const result = await res.json()
      if (!res.ok || !result.ok || result.status === "failed") {
        setTestResult({ ok: false, msg: result.error || "테스트 발송에 실패했습니다." })
        return
      }
      setTestResult({ ok: true, msg: `${target}로 테스트 발송했습니다.` })
    } catch {
      setTestResult({ ok: false, msg: "테스트 발송에 실패했습니다." })
    } finally {
      setTestLoading(false)
    }
  }

  // 발송 확인
  const handleSendClick = () => {
    if (!value.subject.trim() || !value.body.trim()) return
    setShowConfirm(true)
  }
  const handleConfirmedSend = async () => {
    setSendingConfirmed(true)
    setShowConfirm(false)
    try {
      await onSend(value)
    } finally {
      setSendingConfirmed(false)
    }
  }

  const previewBody = useMemo(() => applyVariables(value.body), [value.body])
  const previewSubject = useMemo(() => applyVariables(value.subject), [value.subject])

  const audienceCount = selectedAudience ?? subscriberCount
  const canSend = !!value.subject.trim() && !!value.body.trim() && presendErrors.length === 0
  const testCanSend = !!value.subject.trim() && !!value.body.trim() && !!testEmail.trim()

  return (
    <>
      <div className="space-y-4">

        {/* ══ Step 1: 내용 작성 ══════════════════════════ */}
        <div className="overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-4 py-3">
            <StepBadge n={1} />
            <span className="text-[13px] font-semibold text-[#111110]">내용 작성</span>
          </div>

          <div className="space-y-4 p-4">
            {/* 제목 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-subject" className="text-[12px] font-medium text-[#1a1a1a]/55">
                  제목 <span className="text-red-400">*</span>
                </Label>
                <span className="text-[11px] text-[#1a1a1a]/30">{value.subject.length}자</span>
              </div>
              <Input
                id="email-subject"
                value={value.subject}
                onChange={(e) => updateDraft({ subject: e.target.value })}
                placeholder="예) {name}님, 클래스인 4월 세미나에 초대합니다"
                className="text-[13px]"
              />
            </div>

            {/* 변수 블록 카드 */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-[#1a1a1a]/40">
                변수 삽입 — 클릭하면 커서 위치에 바로 들어갑니다
              </p>
              <div className="grid grid-cols-3 gap-2">
                {VARIABLES.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => insertVariable(v.token)}
                    className="group flex flex-col items-start gap-1.5 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2.5 text-left transition-all hover:border-[#084734]/35 hover:bg-[#ECFDF5] active:scale-[0.97]"
                  >
                    <span className="font-mono text-[12px] font-semibold text-[#084734]">
                      {v.token}
                    </span>
                    <span className="text-[11px] font-medium text-[#111110]">{v.label}</span>
                    <span className="text-[10px] leading-snug text-[#1a1a1a]/35 group-hover:text-[#084734]/60">
                      예) {v.example}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 본문 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-body" className="text-[12px] font-medium text-[#1a1a1a]/55">
                  본문 <span className="text-red-400">*</span>
                </Label>
                <span className="text-[11px] text-[#1a1a1a]/30">
                  {value.body.replace(/\s+/g, " ").trim().length}자
                </span>
              </div>
              <textarea
                id="email-body"
                ref={bodyRef}
                value={value.body}
                onChange={(e) => updateDraft({ body: e.target.value })}
                rows={9}
                placeholder={`안녕하세요 {name}님,\n\nClassin에서 준비한 소식을 전해드립니다.\n\n{org} 관계자 여러분을 위한...\n\n감사합니다.\nClassin 팀`}
                className="w-full resize-y rounded-lg border border-[#e8e8e4] p-3 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#084734]/20"
              />
            </div>

            {/* 미리보기 토글 패널 */}
            <div className="overflow-hidden rounded-xl border border-[#e8e8e4]">
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="flex w-full items-center justify-between bg-[#fafaf8] px-4 py-2.5 text-left transition-colors hover:bg-[#f0f0ec]"
              >
                <span className="text-[12px] font-medium text-[#1a1a1a]/55">
                  미리보기 — 변수 치환 결과 확인
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-[#1a1a1a]/35 transition-transform duration-200 ${showPreview ? "rotate-180" : ""}`}
                />
              </button>

              {showPreview && (
                <div className="border-t border-[#e8e8e4] bg-white p-4">
                  {/* 이메일 프레임 */}
                  <div className="overflow-hidden rounded-xl border border-[#e8e8e4] shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    {/* 헤더바 */}
                    <div className="border-b border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1.5">
                          <div className="h-2.5 w-2.5 rounded-full bg-[#e8e8e4]" />
                          <div className="h-2.5 w-2.5 rounded-full bg-[#e8e8e4]" />
                          <div className="h-2.5 w-2.5 rounded-full bg-[#e8e8e4]" />
                        </div>
                        <div className="flex-1 rounded-md bg-white border border-[#e8e8e4] px-2 py-0.5 text-center text-[10px] text-[#1a1a1a]/30">
                          이메일 미리보기
                        </div>
                      </div>
                    </div>
                    {/* 메일 헤더 */}
                    <div className="border-b border-[#e8e8e4] bg-white px-5 py-4 space-y-1.5">
                      <div className="flex items-baseline gap-2">
                        <span className="w-10 shrink-0 text-[10px] text-[#1a1a1a]/35">보낸 이</span>
                        <span className="text-[12px] text-[#1a1a1a]/60">Classin &lt;no-reply@classin.kr&gt;</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="w-10 shrink-0 text-[10px] text-[#1a1a1a]/35">제목</span>
                        <span className="text-[13px] font-semibold text-[#111110]">
                          {previewSubject || <span className="text-[#1a1a1a]/25 font-normal">(제목 없음)</span>}
                        </span>
                      </div>
                    </div>
                    {/* 본문 */}
                    <div className="bg-white px-5 py-5 min-h-[120px]">
                      {previewBody
                        ? <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#111110]">{previewBody}</p>
                        : <p className="text-[12px] text-[#1a1a1a]/25">(본문을 작성해주세요)</p>}
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-[#1a1a1a]/30 text-center">
                    예시 수신자 — 이름: 김원장 · 학원명: 클래스인 아카데미 · 직책: 원장
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ Step 2: 발송 대상 ══════════════════════════ */}
        <div className="overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-4 py-3">
            <StepBadge n={2} />
            <span className="text-[13px] font-semibold text-[#111110]">발송 대상 선택</span>
            <span className="ml-auto text-[12px] font-medium text-[#084734]">예상 {audienceCount}명</span>
          </div>
          <div className="p-4">
            <TagSelector
              selected={value.targetTags}
              onChange={(tags) => updateDraft({ targetTags: tags })}
              countMap={countMap}
              totalCount={subscriberCount}
            />
          </div>
        </div>

        {/* ══ Step 3: 테스트 발송 ════════════════════════ */}
        <div className="overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-4 py-3">
            <StepBadge n={3} />
            <span className="text-[13px] font-semibold text-[#111110]">테스트 발송</span>
            <span className="ml-2 text-[11px] text-[#1a1a1a]/35">실제 구독자에게 발송되지 않습니다</span>
          </div>

          <div className="space-y-3 p-4">
            {/* 저장된 계정 칩 */}
            {testAccounts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-[#1a1a1a]/40">저장된 계정 — 클릭해서 바로 발송</p>
                <div className="flex flex-wrap gap-2">
                  {testAccounts.map((email) => (
                    <div
                      key={email}
                      className={`group flex items-center gap-1.5 rounded-full border pl-3 pr-2 py-1 text-[12px] transition-all cursor-pointer ${
                        testEmail === email
                          ? "border-[#084734] bg-[#084734] text-white"
                          : "border-[#e8e8e4] bg-[#fafaf8] text-[#111110] hover:border-[#084734]/40 hover:bg-[#ECFDF5]"
                      }`}
                      onClick={() => setTestEmail(email)}
                    >
                      <span>{email}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeTestAccount(email)
                        }}
                        className={`flex h-4 w-4 items-center justify-center rounded-full transition-colors ${
                          testEmail === email
                            ? "hover:bg-white/20 text-white/70"
                            : "hover:bg-[#1a1a1a]/10 text-[#1a1a1a]/35"
                        }`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 이메일 입력 + 저장 + 발송 */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                  className="pr-9 text-[13px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      if (testCanSend) handleTestSend()
                    }
                  }}
                />
                {/* 저장 버튼 — 입력값이 있고 아직 저장 안 됐을 때 표시 */}
                {testEmail.trim() && !testAccounts.includes(testEmail.trim()) && (
                  <button
                    type="button"
                    onClick={addTestAccount}
                    title="계정 저장"
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-[#084734]/10 text-[#084734] hover:bg-[#084734]/20 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleTestSend()}
                disabled={loading || testLoading || !testCanSend}
                className="shrink-0 gap-1.5"
              >
                {testLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <MailCheck className="h-3.5 w-3.5" />}
                {testLoading ? "전송 중..." : "테스트"}
              </Button>
            </div>

            {/* 저장된 계정으로 원클릭 발송 */}
            {testAccounts.length > 0 && testEmail && testAccounts.includes(testEmail) && (
              <button
                type="button"
                onClick={() => handleTestSend(testEmail)}
                disabled={loading || testLoading || !value.subject.trim() || !value.body.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#084734]/20 bg-[#ECFDF5] py-2 text-[12px] font-medium text-[#084734] transition-colors hover:bg-[#D1FAE5] disabled:opacity-40"
              >
                <MailCheck className="h-3.5 w-3.5" />
                {testEmail}로 바로 발송
              </button>
            )}

            {testResult && (
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] ${
                testResult.ok
                  ? "border-green-100 bg-green-50 text-green-700"
                  : "border-red-100 bg-red-50 text-red-600"
              }`}>
                {testResult.ok
                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                {testResult.msg}
              </div>
            )}
          </div>
        </div>

        {/* ══ 발송 버튼 바 ══════════════════════════════ */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
          <p className="text-[12px]">
            {presendErrors.length > 0
              ? <span className="text-red-500">{presendErrors[0]}</span>
              : presendWarnings.length > 0
                ? <span className="text-amber-600">주의 {presendWarnings.length}개 · 확인 후 발송</span>
                : <span className="text-[#084734] font-medium">준비 완료 — {audienceCount}명</span>}
          </p>
          <Button
            onClick={handleSendClick}
            disabled={loading || sendingConfirmed || !canSend}
            className="bg-[#084734] text-white hover:bg-[#084734]/90 disabled:opacity-40"
          >
            {loading || sendingConfirmed
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />발송 중...</>
              : <><Send className="mr-1.5 h-3.5 w-3.5" />{audienceCount}명에게 발송</>}
          </Button>
        </div>
      </div>

      {/* ══ 발송 확인 모달 ════════════════════════════════ */}
      <Dialog open={showConfirm} onOpenChange={(v) => !loading && setShowConfirm(v)}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">발송 최종 확인</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="divide-y divide-[#e8e8e4] overflow-hidden rounded-xl border border-[#e8e8e4] bg-[#fafaf8]">
              <div className="flex gap-3 px-4 py-3">
                <span className="w-12 shrink-0 text-[11px] text-[#1a1a1a]/40">제목</span>
                <span className="break-all text-[13px] font-medium text-[#111110]">{value.subject}</span>
              </div>
              <div className="flex gap-3 px-4 py-3">
                <span className="w-12 shrink-0 text-[11px] text-[#1a1a1a]/40">대상</span>
                <span className="text-[13px] text-[#111110]">
                  {value.targetTags.length > 0 ? value.targetTags.join(" · ") : "전체 active 구독자"}
                  <span className="ml-1.5 font-semibold text-[#084734]">{audienceCount}명</span>
                </span>
              </div>
            </div>

            {presendWarnings.length > 0 ? (
              <div className="space-y-1.5">
                {presendWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span className="text-[12px] text-amber-700">{w}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                <span className="text-[12px] text-green-700">모든 체크를 통과했습니다.</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>취소</Button>
            <Button onClick={handleConfirmedSend} className="bg-[#084734] text-white hover:bg-[#084734]/90">
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {audienceCount}명에게 발송
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────
function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#084734] text-[10px] font-bold text-white">
      {n}
    </span>
  )
}
