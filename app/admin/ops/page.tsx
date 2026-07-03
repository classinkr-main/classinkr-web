"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  Settings,
  ShieldAlert,
  Zap,
} from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import { StatTile } from "@/components/admin/viz"
import type {
  AdminIntegrationHealth,
  AdminIntegrationSource,
  AdminIntegrationStatusItem,
  AdminIntegrationStatusResponse,
} from "@/lib/admin-integrations/types"
import type { AutomationLog, AutomationRule } from "@/lib/automation-types"

interface AutomationRulesResponse {
  rules: AutomationRule[]
}

interface AutomationLogsResponse {
  logs: AutomationLog[]
}

const HEALTH_LABEL: Record<AdminIntegrationHealth, string> = {
  ok: "정상",
  warning: "주의",
  error: "오류",
  unknown: "미확인",
}

const SOURCE_LABEL: Record<AdminIntegrationSource, string> = {
  env: "환경변수",
  db: "DB 설정",
  mixed: "혼합",
  not_configured: "미설정",
}

const HEALTH_ORDER: Record<AdminIntegrationHealth, number> = {
  error: 0,
  warning: 1,
  unknown: 2,
  ok: 3,
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("ko-KR").format(value ?? 0)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function healthTone(health: AdminIntegrationHealth) {
  if (health === "ok") return "bg-[#ECFDF5] text-[#084734]"
  if (health === "error") return "bg-[#FEF3EE] text-[#B85C33]"
  return "bg-[#F6F5F4] text-[#615D59]"
}

function triggerSummary(rule: AutomationRule) {
  if (rule.triggerType === "on_submit") return "폼 제출 즉시"
  if (rule.triggerType === "delay") {
    const config = rule.triggerConfig as { hours?: number }
    return `${config.hours ?? "-"}시간 후`
  }
  const config = rule.triggerConfig as { cronLabel?: string; cron?: string }
  return config.cronLabel ?? config.cron ?? "예약 발송"
}

// KPI 카드는 공용 StatTile(components/admin/viz)로 통합 — 기존 그린 칩은 tone="brand"로 재현.
function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
}) {
  return <StatTile icon={icon} label={label} value={value} hint={hint} tone="brand" />
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/[0.08] bg-[#FAFAF8] px-4 py-8 text-center text-[13px] text-[#615D59]">
      {label}
    </div>
  )
}

export default function AdminOpsPage() {
  const [status, setStatus] = useState<AdminIntegrationStatusResponse | null>(null)
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [logs, setLogs] = useState<AutomationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (force) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const [statusData, rulesData, logsData] = await Promise.all([
        adminFetchJsonCached<AdminIntegrationStatusResponse>(
          "/api/admin/settings/integrations/status",
          undefined,
          { ttlMs: 60_000, force, staleIfError: !force }
        ),
        adminFetchJsonCached<AutomationRulesResponse>("/api/admin/automation/rules", undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
        adminFetchJsonCached<AutomationLogsResponse>("/api/admin/automation/logs", undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
      ])

      setStatus(statusData)
      setRules(rulesData.rules ?? [])
      setLogs(logsData.logs ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "운영 상태를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const model = useMemo(() => {
    const items = status?.items ?? []
    const healthCounts: Record<AdminIntegrationHealth, number> = {
      ok: 0,
      warning: 0,
      error: 0,
      unknown: 0,
    }
    const sourceCounts: Record<AdminIntegrationSource, number> = {
      env: 0,
      db: 0,
      mixed: 0,
      not_configured: 0,
    }

    for (const item of items) {
      healthCounts[item.health] += 1
      sourceCounts[item.source] += 1
    }

    const attention = [...items]
      .filter((item) => item.health !== "ok")
      .sort((left, right) => HEALTH_ORDER[left.health] - HEALTH_ORDER[right.health])
    const failedLogs = logs.filter((log) => log.status === "failed")
    const pendingLogs = logs.filter((log) => log.status === "pending")
    const activeRules = rules.filter((rule) => rule.status === "active")
    const scheduledRules = rules.filter((rule) => rule.triggerType === "scheduled")
    const opsSchedule = items.find((item) => item.key === "ops_schedule")
    const categories = Array.from(new Set(items.map((item) => item.category))).map((category) => ({
      category,
      items: items.filter((item) => item.category === category),
    }))

    return {
      items,
      healthCounts,
      sourceCounts,
      attention,
      failedLogs,
      pendingLogs,
      activeRules,
      scheduledRules,
      opsSchedule,
      categories,
    }
  }, [logs, rules, status])

  return (
    <div className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#615D59]">Admin</p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">Ops Health</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[#615D59]">
            통합 설정, 자동화 실행, 크론 운영 리스크를 한 화면에서 점검합니다. 장애가 날 가능성이 높은 항목부터 위에 올립니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load({ force: true })}
          disabled={refreshing}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </header>

      {error ? (
        <div className="mb-6 flex items-start gap-2 rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[13px] text-[#B85C33]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {model.opsSchedule?.lastErrorSummary ? (
        <div className="mb-6 rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#B85C33]" />
            <div>
              <p className="text-[14px] font-bold text-[#111110]">Cron 플랜 확인 필요</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#B85C33]">{model.opsSchedule.lastErrorSummary}</p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="정상 통합"
          value={loading ? "..." : formatNumber(model.healthCounts.ok)}
          hint={`전체 ${formatNumber(model.items.length)}개 커넥터`}
        />
        <MetricCard
          icon={<AlertCircle className="h-5 w-5" />}
          label="주의/오류"
          value={loading ? "..." : formatNumber(model.healthCounts.warning + model.healthCounts.error)}
          hint={`오류 ${formatNumber(model.healthCounts.error)}개 · 주의 ${formatNumber(model.healthCounts.warning)}개`}
        />
        <MetricCard
          icon={<Zap className="h-5 w-5" />}
          label="활성 자동화"
          value={loading ? "..." : formatNumber(model.activeRules.length)}
          hint={`예약 규칙 ${formatNumber(model.scheduledRules.length)}개`}
        />
        <MetricCard
          icon={<ShieldAlert className="h-5 w-5" />}
          label="실패 로그"
          value={loading ? "..." : formatNumber(model.failedLogs.length)}
          hint={`대기 ${formatNumber(model.pendingLogs.length)}건`}
        />
        <MetricCard
          icon={<Clock3 className="h-5 w-5" />}
          label="최근 점검"
          value={loading ? "..." : formatDateTime(status?.generatedAt)}
          hint="통합 상태 응답 생성 시각"
        />
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="rounded-2xl border border-black/[0.08] bg-white">
          <div className="flex flex-col gap-3 border-b border-black/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-[#111110]">오늘 먼저 볼 리스크</h2>
              <p className="mt-1 text-[12px] text-[#615D59]">오류, 주의, 미설정 항목을 운영 영향 순으로 정리합니다.</p>
            </div>
            <Link
              href="/admin/settings?tab=integrations"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#111110] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#2a2a28]"
            >
              설정 열기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-black/[0.08]">
            {model.attention.length === 0 ? (
              <div className="p-5">
                <EmptyState label="주의가 필요한 통합 항목이 없습니다." />
              </div>
            ) : (
              model.attention.slice(0, 9).map((item) => (
                <div key={item.key} className="px-5 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-[#111110]">{item.label}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">
                        {item.description ?? item.lastErrorSummary ?? `${SOURCE_LABEL[item.source]} 기준으로 점검하세요.`}
                      </p>
                      <p className="mt-2 text-[11px] text-[#615D59]">
                        {item.requiredKeys.slice(0, 3).join(", ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${healthTone(item.health)}`}>
                        {HEALTH_LABEL[item.health]}
                      </span>
                      {item.adminHref ? (
                        <Link
                          href={item.adminHref}
                          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-black/[0.08] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
                        >
                          이동
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white">
          <div className="flex flex-col gap-3 border-b border-black/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-[#111110]">자동화 실행</h2>
              <p className="mt-1 text-[12px] text-[#615D59]">마케팅 자동 발송 규칙과 최근 실패를 확인합니다.</p>
            </div>
            <Link
              href="/admin/campaigns?tab=email"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
            >
              이메일 운영
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-[#FAFAF8] px-4 py-4">
                <p className="text-[11px] text-[#615D59]">규칙</p>
                <p className="mt-1 text-2xl font-bold text-[#111110]">{formatNumber(rules.length)}</p>
              </div>
              <div className="rounded-2xl bg-[#FAFAF8] px-4 py-4">
                <p className="text-[11px] text-[#615D59]">성공 로그</p>
                <p className="mt-1 text-2xl font-bold text-[#111110]">
                  {formatNumber(logs.filter((log) => log.status === "sent").length)}
                </p>
              </div>
              <div className="rounded-2xl bg-[#FAFAF8] px-4 py-4">
                <p className="text-[11px] text-[#615D59]">실패 로그</p>
                <p className="mt-1 text-2xl font-bold text-[#111110]">{formatNumber(model.failedLogs.length)}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {model.failedLogs.slice(0, 4).map((log) => (
                <div key={log.id} className="rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3">
                  <p className="text-[13px] font-bold text-[#111110]">{log.ruleName ?? log.ruleId}</p>
                  <p className="mt-1 text-[12px] text-[#B85C33]">{log.errorMessage ?? "실패 사유가 기록되지 않았습니다."}</p>
                  <p className="mt-2 text-[11px] text-[#615D59]">{formatDateTime(log.triggeredAt)}</p>
                </div>
              ))}
              {model.failedLogs.length === 0 ? (
                model.activeRules.slice(0, 4).map((rule) => (
                  <div key={rule.id} className="rounded-2xl border border-black/[0.08] bg-[#FAFAF8] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-bold text-[#111110]">{rule.name}</p>
                        <p className="mt-1 text-[12px] text-[#615D59]">{triggerSummary(rule)}</p>
                      </div>
                      <span className="rounded-full bg-[#ECFDF5] px-2 py-1 text-[11px] font-semibold text-[#084734]">
                        active
                      </span>
                    </div>
                  </div>
                ))
              ) : null}
              {model.failedLogs.length === 0 && model.activeRules.length === 0 ? (
                <EmptyState label="실패 로그와 활성 자동화가 없습니다." />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-2xl border border-black/[0.08] bg-white">
          <div className="border-b border-black/[0.08] px-5 py-4">
            <h2 className="text-[15px] font-bold text-[#111110]">설정 저장 위치</h2>
            <p className="mt-1 text-[12px] text-[#615D59]">환경변수와 DB 설정이 어디에 있는지 확인합니다.</p>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {(Object.keys(SOURCE_LABEL) as AdminIntegrationSource[]).map((source) => (
              <div key={source} className="rounded-2xl border border-black/[0.08] bg-[#FAFAF8] px-4 py-4">
                <div className="flex items-center gap-2 text-[#084734]">
                  {source === "env" ? <Settings className="h-4 w-4" /> : <Database className="h-4 w-4" />}
                  <p className="text-[12px] font-semibold">{SOURCE_LABEL[source]}</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-[#111110]">{formatNumber(model.sourceCounts[source])}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-[#ECFDF5] p-5">
          <h2 className="text-[15px] font-bold text-[#111110]">운영 루틴</h2>
          <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-[#084734]">
            <p>1. error 항목은 배포 전까지 해결하고, warning 항목은 실제 운영 영향이 있는지 확인합니다.</p>
            <p>2. Cron 관련 warning은 Vercel 플랜과 실행 빈도를 함께 확인합니다.</p>
            <p>3. 자동화 실패가 생기면 템플릿, 세그먼트, 발송 공급자 순서로 점검합니다.</p>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <Link
              href="/admin/settings?tab=integrations"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#084734] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41]"
            >
              통합 설정
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/admin/docs?tab=gaps"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
            >
              챗봇 운영
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/admin/dev"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
            >
              Dev Mode
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-black/[0.08] bg-white">
        <div className="border-b border-black/[0.08] px-5 py-4">
          <h2 className="text-[15px] font-bold text-[#111110]">카테고리별 통합 상태</h2>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          {model.categories.map((group) => {
            const problemCount = group.items.filter((item: AdminIntegrationStatusItem) => item.health !== "ok").length
            return (
              <div key={group.category} className="rounded-2xl border border-black/[0.08] bg-[#FAFAF8] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-[#084734]" />
                    <p className="text-[13px] font-bold text-[#111110]">{group.category}</p>
                  </div>
                  <span className={problemCount > 0 ? "text-[12px] font-semibold text-[#B85C33]" : "text-[12px] font-semibold text-[#084734]"}>
                    {problemCount > 0 ? `${problemCount}개 점검` : "정상"}
                  </span>
                </div>
                <p className="mt-2 text-[12px] text-[#615D59]">총 {formatNumber(group.items.length)}개 항목</p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
