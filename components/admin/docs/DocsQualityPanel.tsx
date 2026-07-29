"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { cn } from "@/lib/utils"

// AI 품질 검수 — /admin/docs?tab=quality.
// 정본: docs/active/cs-admin-console-ia-2026-07-27.md §7 "중복 단일화".
//
// `챗봇 알파 준비도`와 `챗봇 품질 평가`는 ExternalChatbotOpsDashboard와 DocsGapsPanel에
// 사실상 같은 UI로 두 벌 존재했고 같은 엔드포인트를 호출했다. 두 블록을 이 화면 하나로 모으고
// 양쪽에서 제거한다 — 기능은 두 구현의 합집합으로 보존한다.
//
// 합집합 근거(어느 쪽에만 있던 것):
//  - 대시보드 쪽: 캐시 소비(adminFetchJsonCached, 사이드바 hover-warm 적중) · 통과 N/M 요약 ·
//    전항목 통과 메시지 · 미해결 큐 상세 보기 링크 · 평가 중복 실행 가드 · 실행 전 직전 결과 리셋 ·
//    인라인 평가 에러
//  - 보강 큐 쪽: 정상/주의/막힘 집계 + 생성 시각 · 실패뿐 아니라 전체 체크 렌더 ·
//    check.artifacts 코드 칩 · 로딩 플레이스홀더 · report.warnings 배너
// 품질 평가 2버튼(빠른 회귀/심판 포함)과 지표 9종·실패 목록은 두 구현이 동일했다.

type AlphaReadinessStatus = "ok" | "warning" | "blocked"

interface AlphaReadinessCheck {
  key: string
  label: string
  status: AlphaReadinessStatus
  detail: string
  action?: string
  artifacts?: string[]
}

interface AlphaReadinessReport {
  generatedAt: string
  overallStatus: AlphaReadinessStatus
  summary: Record<AlphaReadinessStatus, number>
  checks: AlphaReadinessCheck[]
  warnings: string[]
}

interface EvalReport {
  total: number
  durationMs: number
  deterministic: {
    categoryMatch: number
    modeOk: number
    withSources: number
    categoryMatchRate: number
    modeOkRate: number
    sourceRate: number
  }
  judge: {
    enabled: boolean
    judged: number
    faithfulRate: number | null
    hallucinationRate: number | null
    addressesRate: number | null
    avgScore: number | null
  }
  failures: {
    id: string
    question: string
    detectedCategory: string
    expectCategory: string
    answerMode: string
    flags: string[]
  }[]
}

// 준비도 응답이 오기 전에도 무엇을 점검하는지 보이게 하는 자리표시자(보강 큐 구현 승계).
const READINESS_PLACEHOLDER_LABELS = [
  "Supabase 운영 연결",
  "챗봇 DB 스키마",
  "Gemini 인식 엔진",
  "공개 문서 원본",
  "RAG 문서 청크",
  "임베딩 백필",
  "시작 추천 질문",
  "문서 보강 큐",
]

function pct(value: number | null | undefined) {
  if (value == null) return "—"
  return `${Math.round(value * 100)}%`
}

function ms(value: number | null | undefined) {
  if (value == null) return "—"
  if (value >= 1000) return `${(value / 1000).toFixed(1)}초`
  return `${value}ms`
}

function getReadinessStatusMeta(status: AlphaReadinessStatus) {
  if (status === "ok") return { label: "준비됨", badgeClass: "bg-[#ECFDF5] text-[#084734]" }
  if (status === "warning") return { label: "확인 필요", badgeClass: "bg-[#FFF7ED] text-[#B85C33]" }
  return { label: "막힘", badgeClass: "bg-[#FBEAE2] text-[#B85C33]" }
}

export default function DocsQualityPanel() {
  const [readiness, setReadiness] = useState<AlphaReadinessReport | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(true)
  const [readinessError, setReadinessError] = useState("")

  const [evalRunningMode, setEvalRunningMode] = useState<"fast" | "judge" | null>(null)
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null)
  const [evalError, setEvalError] = useState("")

  // 캐시 소비 — 사이드바 hover-warmup(warmAdminRequestCache, ttlMs 60초)이 같은 URL 키로 데운
  // 캐시를 그대로 쓴다(URL 문자열이 캐시 키라 warmup 목록과 byte-동일해야 적중).
  // 버튼으로 다시 확인할 때는 force로 캐시를 우회해 신선 조회한다.
  const loadReadiness = useCallback(async (options?: { force?: boolean }) => {
    setReadinessLoading(true)
    setReadinessError("")
    try {
      const data = await adminFetchJsonCached<AlphaReadinessReport>(
        "/api/admin/docs/alpha-readiness",
        undefined,
        { ttlMs: 60_000, force: options?.force }
      )
      setReadiness(data)
    } catch (e) {
      setReadiness(null)
      setReadinessError(e instanceof Error ? e.message : "알파 준비도를 불러오지 못했습니다.")
    } finally {
      setReadinessLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReadiness()
  }, [loadReadiness])

  const runEval = async (judge: boolean) => {
    // 중복 실행 가드 — 평가는 골든셋 전체를 실제 파이프라인에 태우는 무거운 작업이다.
    if (evalRunningMode != null) return
    setEvalRunningMode(judge ? "judge" : "fast")
    // 이전 실행 잔상 제거 — 재실행 중·실패 후에 직전 성공 결과가 현재 결과처럼 남지 않게 한다.
    setEvalReport(null)
    setEvalError("")
    try {
      const data = await adminFetchJson<EvalReport>("/api/admin/chatbot/eval", {
        method: "POST",
        body: JSON.stringify({ judge }),
      })
      setEvalReport(data)
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : "품질 평가 실행에 실패했습니다.")
    } finally {
      setEvalRunningMode(null)
    }
  }

  const checks = readiness?.checks ?? []
  const statusMeta = getReadinessStatusMeta(readiness?.overallStatus ?? "warning")
  const passCount = readiness?.summary.ok ?? 0
  const failingChecks = checks.filter((check) => check.status !== "ok")

  return (
    <div className="text-[#111110]">
      <div>
        <h2 className="text-xl font-bold tracking-[-0.02em]">AI 품질 검수</h2>
        <p className="mt-1.5 text-sm text-[#615D59]">
          공개 챗봇의 알파 준비도와 골든셋 회귀 품질을 한 화면에서 확인합니다.
        </p>
      </div>

      {/* 1. 알파 준비도 */}
      <section className="mt-6 rounded-[20px] border border-black/[0.08] bg-[#ECFDF5] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">챗봇 알파 준비도</h3>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  statusMeta.badgeClass
                )}
              >
                {readinessLoading ? "확인 중" : statusMeta.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#615D59]">
              {readiness
                ? `통과 ${passCount}/${checks.length} · 운영 DB, 문서 근거, 임베딩, 추천 질문, 보강 큐를 한 번에 점검합니다.`
                : "운영 DB, 문서 근거, 임베딩, 추천 질문, 보강 큐를 한 번에 점검합니다."}
            </p>
          </div>
          {/* 여기 있던 큐 바로가기 링크는 제거했다 — 콘솔 가로 메뉴의 형제 항목과
              목적지가 완전히 같아 한 화면에 같은 이동이 두 벌이었다(P6 이탈점 정리). */}
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void loadReadiness({ force: true })}
              disabled={readinessLoading}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#084734]/15 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              {readinessLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              준비도 확인
            </button>
          </div>
        </div>

        {readinessError ? (
          <p className="mt-3 rounded-[12px] border border-[#B85C33]/20 bg-[#FBEAE2] px-3 py-2 text-[12px] text-[#B85C33]">
            {readinessError}
          </p>
        ) : null}

        {readiness ? (
          <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-[#615D59]">
            <span>정상 {readiness.summary.ok}</span>
            <span>주의 {readiness.summary.warning}</span>
            <span>막힘 {readiness.summary.blocked}</span>
            <span>{new Date(readiness.generatedAt).toLocaleString("ko-KR")}</span>
          </div>
        ) : null}

        {readiness && failingChecks.length === 0 ? (
          <p className="mt-3 rounded-[14px] border border-[#084734]/15 bg-white px-3 py-2 text-sm font-semibold text-[#084734]">
            모든 항목이 통과했습니다.
          </p>
        ) : null}

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {readinessLoading && checks.length === 0
            ? READINESS_PLACEHOLDER_LABELS.map((label) => (
                <div key={label} className="rounded-[14px] border border-black/[0.06] bg-white/80 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#111110]">{label}</p>
                    <span className="rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[11px] text-[#615D59]">
                      대기
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-[#615D59]">상태를 확인하는 중입니다.</p>
                </div>
              ))
            : checks.map((check) => {
                const meta = getReadinessStatusMeta(check.status)
                return (
                  <div key={check.key} className="rounded-[14px] border border-black/[0.06] bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-[#111110]">{check.label}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          meta.badgeClass
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-[#615D59]">{check.detail}</p>
                    {check.action ? (
                      <p className="mt-1 text-[12px] font-medium text-[#084734]">{check.action}</p>
                    ) : null}
                    {check.artifacts && check.artifacts.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {check.artifacts.map((artifact) => (
                          <code
                            key={artifact}
                            className="max-w-full rounded-md border border-black/[0.06] bg-[#F6F5F4] px-1.5 py-1 text-[11px] leading-4 text-[#615D59]"
                          >
                            {artifact}
                          </code>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
        </div>

        {(readiness?.warnings.length ?? 0) > 0 ? (
          <div className="mt-3 rounded-[12px] border border-[#B85C33]/20 bg-[#FBEAE2] px-3 py-2 text-[12px] text-[#B85C33]">
            {readiness?.warnings.join(" · ")}
          </div>
        ) : null}
      </section>

      {/* 2. 품질 평가 실행 */}
      <section className="mt-6 rounded-[20px] border border-black/[0.08] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">챗봇 품질 평가</h3>
            <p className="mt-1 text-sm text-[#615D59]">
              골든셋을 실제 파이프라인에 돌려 회귀 여부와 출처 품질을 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runEval(false)}
              disabled={evalRunningMode != null}
              className="inline-flex items-center gap-2 rounded-full border border-[#084734]/15 bg-white px-4 py-2 text-sm font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:opacity-60"
            >
              {evalRunningMode === "fast" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              빠른 회귀 평가
            </button>
            <button
              type="button"
              onClick={() => void runEval(true)}
              disabled={evalRunningMode != null}
              className="inline-flex items-center gap-2 rounded-full bg-[#084734] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
            >
              {evalRunningMode === "judge" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              심판 포함 평가
            </button>
          </div>
        </div>

        {evalError ? (
          <p className="mt-4 rounded-[12px] border border-[#B85C33]/20 bg-[#FBEAE2] px-3 py-2 text-[12px] text-[#B85C33]">
            {evalError}
          </p>
        ) : null}

        {evalReport ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric
                label="카테고리 적중"
                value={`${pct(evalReport.deterministic.categoryMatchRate)} · ${evalReport.deterministic.categoryMatch}/${evalReport.total}`}
              />
              <Metric
                label="모드 적합"
                value={`${pct(evalReport.deterministic.modeOkRate)} · ${evalReport.deterministic.modeOk}/${evalReport.total}`}
              />
              <Metric
                label="출처 확보"
                value={`${pct(evalReport.deterministic.sourceRate)} · ${evalReport.deterministic.withSources}/${evalReport.total}`}
              />
              <Metric
                label={evalReport.judge.enabled ? "근거 충실 (심판)" : "심판 비활성"}
                value={evalReport.judge.enabled ? pct(evalReport.judge.faithfulRate) : "—"}
              />
              {evalReport.judge.enabled ? (
                <>
                  <Metric label="환각" value={pct(evalReport.judge.hallucinationRate)} />
                  <Metric label="질문 충족" value={pct(evalReport.judge.addressesRate)} />
                  <Metric
                    label="평균 점수"
                    value={
                      evalReport.judge.avgScore != null
                        ? `${evalReport.judge.avgScore.toFixed(2)}/5`
                        : "—"
                    }
                  />
                </>
              ) : null}
              <Metric label="케이스" value={`${evalReport.total}개`} />
              <Metric label="평가 시간" value={ms(evalReport.durationMs)} />
            </div>

            {evalReport.failures.length > 0 ? (
              <div className="mt-4 rounded-[14px] border border-[#B85C33]/20 bg-[#FBEAE2] p-3">
                <p className="text-sm font-semibold text-[#B85C33]">
                  회귀 확인 필요 {evalReport.failures.length}건
                </p>
                <ul className="mt-2 space-y-2">
                  {evalReport.failures.slice(0, 5).map((failure) => (
                    <li key={failure.id} className="text-[12px] leading-5 text-[#615D59]">
                      <span className="font-semibold text-[#111110]">{failure.question}</span>
                      <span> · {failure.flags.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 rounded-[14px] border border-[#084734]/15 bg-[#ECFDF5] px-3 py-2 text-sm font-semibold text-[#084734]">
                회귀 실패 없음
              </p>
            )}
          </>
        ) : null}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-black/[0.06] bg-[#FAFAF8] p-3">
      <p className="text-[11px] text-[#615D59]">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-[#111110]">{value}</p>
    </div>
  )
}
