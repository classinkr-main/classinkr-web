"use client"

/**
 * KakaoComposer — 카카오 알림톡 작성 & 테스트 발송
 *
 * 현실(solapi 실측): 알림톡 템플릿 0개 → empty state가 1차 화면.
 * 템플릿이 등록·승인되면: 선택 → 변수 입력 → 옐로우 말풍선 미리보기 → 테스트발송.
 *
 * 계약상 대량발송 API는 아직 미정 → 테스트발송까지만 활성화하고
 * 대량발송 버튼은 "백엔드 준비중"으로 비활성. 정직하게.
 */

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Send,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { adminFetch } from "@/lib/admin-client"
import {
  unwrapMessagingData,
  type MessagingTemplate,
  type MessagingTestSendResult,
} from "@/lib/messaging-client-types"

interface Props {
  templates: MessagingTemplate[]
  channelRegistered: boolean
  /** status API가 아직 안 붙었을 때 true — 안내 문구를 완화 */
  statusUnavailable?: boolean
  /**
   * 수신자 프리필(고객 360 딥링크) — 마운트 시 테스트 발송 번호의 초기값으로만 쓴다.
   * useState 초기화로만 소비하므로 이후 사용자가 수정한 값을 절대 덮지 않는다.
   */
  initialTestPhone?: string
}

const SOLAPI_CONSOLE_URL = "https://console.solapi.com"

function statusMeta(status: string): { label: string; tone: "success" | "warning" | "danger" } {
  const upper = status?.toUpperCase()
  if (upper === "APPROVED") return { label: "승인됨", tone: "success" }
  if (upper === "REJECTED") return { label: "반려됨", tone: "danger" }
  return { label: status || "검토 중", tone: "warning" }
}

/** 템플릿 변수 자동 감지 — 계약엔 name/status만 있으므로 이름에서 #{var} 패턴을 추출(있으면). */
function detectVariables(template: MessagingTemplate | undefined): string[] {
  if (!template) return []
  const found = new Set<string>()
  const re = /#\{([^}]+)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(template.name)) !== null) {
    found.add(m[1].trim())
  }
  return Array.from(found)
}

export default function KakaoComposer({
  templates,
  channelRegistered,
  statusUnavailable,
  initialTestPhone,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>("")
  const [vars, setVars] = useState<Array<{ key: string; value: string }>>([{ key: "", value: "" }])
  const [testPhone, setTestPhone] = useState(initialTestPhone ?? "")
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<MessagingTestSendResult | null>(null)

  const selected = useMemo(
    () => templates.find((t) => t.templateId === selectedId),
    [templates, selectedId]
  )

  const detectedVars = useMemo(() => detectVariables(selected), [selected])

  const variableRecord = useMemo(() => {
    const record: Record<string, string> = {}
    for (const { key, value } of vars) {
      const k = key.trim()
      if (k) record[k] = value
    }
    return record
  }, [vars])

  const selectedApproved = selected ? statusMeta(selected.status).tone === "success" : false
  const testCanSend = !!selected && selectedApproved && !!testPhone.trim() && !testLoading

  function applyDetectedVars() {
    if (detectedVars.length === 0) return
    setVars(detectedVars.map((key) => ({ key, value: "" })))
  }

  function updateVar(index: number, patch: Partial<{ key: string; value: string }>) {
    setVars((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  }

  function addVarRow() {
    setVars((prev) => [...prev, { key: "", value: "" }])
  }

  function removeVarRow(index: number) {
    setVars((prev) => (prev.length === 1 ? [{ key: "", value: "" }] : prev.filter((_, i) => i !== index)))
  }

  async function handleTestSend() {
    if (!testCanSend || !selected) return
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await adminFetch("/api/admin/messaging/test-send", {
        method: "POST",
        body: JSON.stringify({
          channel: "kakao",
          to: testPhone.trim(),
          templateId: selected.templateId,
          variables: variableRecord,
        }),
      })
      const json = await res.json().catch(() => null)
      const result = unwrapMessagingData<MessagingTestSendResult>(json)
      if (!res.ok || !result) {
        setTestResult({
          status: "failed",
          error:
            (json && typeof json === "object" && "error" in json
              ? String((json as Record<string, unknown>).error)
              : null) ?? `테스트 발송 요청이 실패했습니다. (${res.status})`,
        })
        return
      }
      setTestResult(result)
    } catch {
      setTestResult({ status: "failed", error: "네트워크 오류로 테스트 발송에 실패했습니다." })
    } finally {
      setTestLoading(false)
    }
  }

  // ── Empty state: 템플릿 0개 (1차 화면) ──
  if (templates.length === 0) {
    return (
      <div className="space-y-4">
        {!channelRegistered && !statusUnavailable && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#A8741A]" />
            <p className="text-[12px] leading-relaxed text-[#7A520F]">
              카카오 채널이 아직 연결되지 않았습니다. solapi 콘솔에서 카카오 비즈니스 채널을 먼저 연동해주세요.
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
          <div className="border-b border-[#e8e8e4] bg-[#fafaf8] px-6 py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FEE500] text-[#3C1E1E]">
              <MessageCircle className="h-6 w-6" />
            </div>
            <p className="mt-4 text-[15px] font-semibold text-[#111110]">
              발신 채널은 준비됐어요 — 알림톡 템플릿 승인만 남았습니다
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-[#1a1a1a]/45">
              solapi 발신 연동은 완료된 상태입니다. 카카오 알림톡은 사전에 승인된 템플릿으로만
              발송되므로, solapi 콘솔에서 템플릿을 등록하고 카카오 검수(보통 1~2영업일)를 통과하면
              이 화면에서 바로 발송할 수 있습니다.
            </p>
          </div>

          <div className="px-6 py-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
              등록 절차
            </p>
            <ol className="space-y-2.5">
              <ProcedureStep n={1} text="solapi 콘솔 → 카카오 → 알림톡 템플릿에서 새 템플릿을 작성합니다." />
              <ProcedureStep n={2} text="변수는 #{변수명} 형식으로 넣고, 버튼·강조 표기 규정을 지킵니다." />
              <ProcedureStep n={3} text="검수 요청 후 승인되면(보통 1~2영업일) 이 목록에 자동으로 나타납니다." />
            </ol>
            <a
              href={SOLAPI_CONSOLE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-[#084734]/25 bg-[#ECFDF5] px-3.5 py-2 text-[12px] font-medium text-[#084734] transition-colors hover:bg-[#D1FAE5]"
            >
              solapi 콘솔에서 템플릿 등록
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── 템플릿 있음: 작성 화면 ──
  return (
    <div className="space-y-4">
      {/* Step 1: 템플릿 선택 */}
      <StepCard n={1} title="알림톡 템플릿 선택">
        <div className="space-y-2 p-4">
          {templates.map((t) => {
            const meta = statusMeta(t.status)
            const active = t.templateId === selectedId
            const disabled = meta.tone !== "success"
            return (
              <button
                key={t.templateId}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setSelectedId(t.templateId)
                  setTestResult(null)
                }}
                className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  active
                    ? "border-[#084734] bg-[#084734]/[0.04] shadow-sm"
                    : disabled
                      ? "cursor-not-allowed border-[#e8e8e4] bg-[#fafaf8] opacity-60"
                      : "border-[#e8e8e4] bg-white hover:border-[#c8c8c4]"
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    active ? "bg-[#084734]/10 text-[#084734]" : "bg-[#f0f0ec] text-[#1a1a1a]/40"
                  }`}
                >
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#111110]">{t.name}</p>
                  <p className="truncate font-mono text-[10px] text-[#1a1a1a]/35">{t.templateId}</p>
                </div>
                <StatusBadge tone={meta.tone} label={meta.label} />
              </button>
            )
          })}
        </div>
      </StepCard>

      {selected && (
        <>
          {/* Step 2: 변수 입력 */}
          <StepCard n={2} title="변수 입력" hint="템플릿의 #{변수} 값을 채웁니다">
            <div className="space-y-3 p-4">
              {detectedVars.length > 0 && (
                <button
                  type="button"
                  onClick={applyDetectedVars}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#084734]/20 bg-[#ECFDF5] px-2.5 py-1.5 text-[11px] font-medium text-[#084734] transition-colors hover:bg-[#D1FAE5]"
                >
                  감지된 변수 {detectedVars.length}개 채우기 ({detectedVars.map((v) => `#{${v}}`).join(", ")})
                </button>
              )}
              <div className="space-y-2">
                {vars.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={v.key}
                      onChange={(e) => updateVar(i, { key: e.target.value })}
                      placeholder="변수명 (예: 이름)"
                      className="w-1/3 font-mono text-[12px]"
                    />
                    <span className="text-[12px] text-[#1a1a1a]/30">=</span>
                    <Input
                      value={v.value}
                      onChange={(e) => updateVar(i, { value: e.target.value })}
                      placeholder="치환값"
                      className="flex-1 text-[12px]"
                    />
                    <button
                      type="button"
                      onClick={() => removeVarRow(i)}
                      className="shrink-0 rounded-md px-2 py-1 text-[11px] text-[#1a1a1a]/35 hover:bg-[#f0f0ec] hover:text-[#111110]"
                    >
                      제거
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addVarRow}
                className="text-[12px] font-medium text-[#084734] hover:underline"
              >
                + 변수 추가
              </button>
            </div>
          </StepCard>

          {/* Step 3: 미리보기 + 테스트 발송 */}
          <StepCard n={3} title="미리보기 & 테스트 발송" hint="지정 번호로만 1건 발송">
            <div className="space-y-4 p-4">
              {/* 옐로우 말풍선 미리보기 */}
              <div>
                <p className="mb-2 text-[11px] font-medium text-[#1a1a1a]/40">카카오톡 미리보기</p>
                <div className="w-[260px] rounded-2xl bg-[#B2C7DA] p-3 shadow-inner">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#FEE500] text-[8px] font-bold text-[#3C1E1E]">
                      톡
                    </span>
                    <span className="text-[10px] font-medium text-[#3C1E1E]/70">알림톡 도착</span>
                  </div>
                  <div className="rounded-xl rounded-tl-sm bg-[#FEE500] p-3">
                    <p className="mb-1.5 text-[10px] font-semibold text-[#3C1E1E]/60">{selected.name}</p>
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#3C1E1E]">
                      {Object.keys(variableRecord).length > 0 ? (
                        Object.entries(variableRecord).map(([k, v]) => (
                          <span key={k}>
                            <span className="font-mono text-[10px] text-[#3C1E1E]/45">#{`{${k}}`}</span>
                            {" → "}
                            <span className="font-medium">{v || "(빈 값)"}</span>
                            {"\n"}
                          </span>
                        ))
                      ) : (
                        <span className="text-[#3C1E1E]/40">
                          변수를 입력하면 치환 값이 여기에 표시됩니다.
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="mt-1.5 text-[9px] leading-snug text-[#3C1E1E]/45">
                    실제 발송 문구·버튼은 카카오에 승인된 템플릿 본문 기준입니다.
                  </p>
                </div>
              </div>

              {/* 테스트 발송 */}
              <div className="flex gap-2">
                <Input
                  type="tel"
                  inputMode="numeric"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="01012345678 (숫자만)"
                  className="flex-1 text-[13px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      if (testCanSend) void handleTestSend()
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleTestSend()}
                  disabled={!testCanSend}
                  className="shrink-0 gap-1.5"
                >
                  {testLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageCircle className="h-3.5 w-3.5" />
                  )}
                  {testLoading ? "전송 중..." : "테스트"}
                </Button>
              </div>

              {!selectedApproved && (
                <p className="text-[11px] text-[#A8741A]">
                  이 템플릿은 아직 승인 상태가 아니라 테스트 발송이 비활성화됩니다.
                </p>
              )}

              {testResult && <TestResultView result={testResult} />}
            </div>
          </StepCard>

          {/* 대량 발송 — 백엔드 준비중 (정직하게 비활성) */}
          <div className="flex items-center justify-end gap-3 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
            <Button
              disabled
              title="백엔드 준비 중 — 테스트 발송으로 검증하세요"
              className="shrink-0 cursor-not-allowed bg-[#084734] text-white opacity-40"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              대량 발송
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────

function ProcedureStep({ n, text }: { n: number; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f0f0ec] text-[10px] font-bold text-[#1a1a1a]/55">
        {n}
      </span>
      <span className="text-[12px] leading-relaxed text-[#1a1a1a]/60">{text}</span>
    </li>
  )
}

function StepCard({
  n,
  title,
  hint,
  children,
}: {
  n: number
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
      <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-4 py-3">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#084734] text-[10px] font-bold text-white">
          {n}
        </span>
        <span className="text-[13px] font-semibold text-[#111110]">{title}</span>
        {hint && <span className="ml-2 text-[11px] text-[#1a1a1a]/35">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function StatusBadge({ tone, label }: { tone: "success" | "warning" | "danger"; label: string }) {
  const style =
    tone === "success"
      ? "bg-[#ECFDF5] text-[#084734]"
      : tone === "danger"
        ? "bg-[#FCE9E9] text-[#8F2C2C]"
        : "bg-[#FBF1E0] text-[#A8741A]"
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style}`}>
      {label}
    </span>
  )
}

function TestResultView({ result }: { result: MessagingTestSendResult }) {
  if (result.status === "sent") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-2 text-[12px] text-[#084734]">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          테스트 발송에 성공했습니다.
          {result.messageId && (
            <span className="ml-1 font-mono text-[11px] text-[#065c41]">#{result.messageId}</span>
          )}
        </span>
      </div>
    )
  }
  if (result.status === "simulated") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-[#e8e8e4] bg-[#f0f0ec] px-3 py-2 text-[12px] text-[#1a1a1a]/60">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/40" />
        <span>시뮬레이션 모드로 처리되었습니다. 실제 발송은 자격증명·채널 설정 후 가능합니다.</span>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2">
      <div className="flex items-start gap-2 text-[12px] font-medium text-[#8F2C2C]">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>테스트 발송에 실패했습니다.</span>
      </div>
      {result.error && (
        <p className="mt-1.5 break-all rounded bg-white/60 px-2 py-1 font-mono text-[11px] leading-relaxed text-[#8F2C2C]">
          {result.error}
        </p>
      )}
    </div>
  )
}
