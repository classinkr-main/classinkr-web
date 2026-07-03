"use client"

import type { ReactNode } from "react"
import {
  Activity,
  AlertTriangle,
  ExternalLink,
  KeyRound,
  Loader2,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  Webhook,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  type AdminIntegrationCategory,
  type AdminIntegrationHealth,
  type AdminIntegrationSection,
  type AdminIntegrationSource,
  type AdminIntegrationStatusItem,
  type AdminIntegrationStatusResponse,
} from "@/lib/admin-integrations/types"
import { cn } from "@/lib/utils"

const INTEGRATION_SECTIONS: Array<{
  key: AdminIntegrationSection
  label: string
  desc: string
  icon: ReactNode
}> = [
  {
    key: "status",
    label: "연동 상태",
    desc: "configured/source/health",
    icon: <Activity className="h-4 w-4" />,
  },
  {
    key: "apiKeys",
    label: "API 키",
    desc: "원문 없는 설정 여부",
    icon: <KeyRound className="h-4 w-4" />,
  },
  {
    key: "connectors",
    label: "커넥터 기능",
    desc: "기능 단위 바로가기",
    icon: <Puzzle className="h-4 w-4" />,
  },
  {
    key: "webhooks",
    label: "웹훅 링크",
    desc: "복사와 테스트",
    icon: <Webhook className="h-4 w-4" />,
  },
]

const API_KEY_STATUS_ROWS: Array<{
  label: string
  description: string
  statusKeys: string[]
  envKeys: string[]
}> = [
  {
    label: "Gemini / Google AI",
    description: "블로그 AI, 마케팅 AI, 챗봇/문서 보강, 지점 인사이트에 사용됩니다.",
    statusKeys: ["gemini"],
    envKeys: ["GEMINI_API_KEY"],
  },
  {
    label: "Channel Talk Open API",
    description: "상담 대화 동기화와 CRM 리드 매칭에 사용됩니다.",
    statusKeys: ["channel_talk"],
    envKeys: ["CHANNEL_TALK_ACCESS", "CHANNEL_TALK_ACCESS_SECRET"],
  },
  {
    label: "Meta Marketing",
    description: "Instagram/캠페인 조회와 Meta webhook 검증에 사용됩니다.",
    statusKeys: ["meta_marketing"],
    envKeys: ["META_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN", "META_APP_SECRET"],
  },
  {
    label: "Google Service Account",
    description: "Sheets, Calendar, Gmail, branch sync 계열 서버 연동에 사용됩니다.",
    statusKeys: ["google_service_account", "branch_sheets"],
    envKeys: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"],
  },
  {
    label: "Email / Resend",
    description: "마케팅 이메일과 알림 폴백 발송에 사용됩니다.",
    statusKeys: ["email_provider"],
    envKeys: ["RESEND_API_KEY"],
  },
  {
    label: "Toss Payments",
    description: "소프트웨어 checkout 결제 승인에 사용됩니다.",
    statusKeys: ["toss_payments"],
    envKeys: ["NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY", "TOSS_SECRET_KEY"],
  },
  {
    label: "Webhook / Cron Secrets",
    description: "public webhook 인증과 cron 수동 호출 보호에 사용됩니다.",
    statusKeys: ["page_form_webhook", "ops_schedule"],
    envKeys: ["PAGE_WEBHOOK_SECRET", "CRON_SECRET"],
  },
]

const CONNECTOR_FEATURE_ROWS: Array<{
  key: string
  title: string
  description: string
  statusKeys: string[]
  href: string
  features: string[]
}> = [
  {
    key: "channel_talk",
    title: "Channel Talk",
    description: "상담 동기화, 인바운드 알림, FAQ 후보 추출을 운영합니다.",
    statusKeys: ["channel_talk"],
    href: "/admin/channel-talk",
    features: ["상담 동기화", "CRM 리드 매칭", "FAQ 후보"],
  },
  {
    key: "meta_marketing",
    title: "Meta / Instagram",
    description: "캠페인과 인스타그램 성과 조회, Lead Ads webhook 수신 상태를 봅니다.",
    statusKeys: ["meta_marketing"],
    href: "/admin/campaigns",
    features: ["캠페인 조회", "Instagram insights", "Lead Ads webhook"],
  },
  {
    key: "gemini",
    title: "Gemini AI",
    description: "문서 보강, 마케팅 초안, 지점 인사이트 생성 기능을 묶어 봅니다.",
    statusKeys: ["gemini"],
    href: "/admin/docs",
    features: ["문서 보강", "마케팅 AI", "지점 인사이트"],
  },
  {
    key: "neo_crm",
    title: "Neo CRM",
    description: "외부 CRM sync와 writeback queue 준비 상태를 확인합니다.",
    statusKeys: ["xiaoshouyi_crm", "crm_writeback"],
    href: "/admin/crm",
    features: ["외부 CRM sync", "writeback queue", "소스 매칭"],
  },
  {
    key: "billing",
    title: "Billing",
    description: "Toss checkout과 환율 fallback 상태를 운영합니다.",
    statusKeys: ["toss_payments", "fx_rate"],
    href: "/admin/quotes?tab=software",
    features: ["결제 승인", "견적 코드", "환율"],
  },
  {
    key: "portal",
    title: "Partner Portal",
    description: "파트너/공유 링크 API 상태와 문서 공유 흐름을 확인합니다.",
    statusKeys: ["partner_portal"],
    href: "/admin/crm/deals/kpi",
    features: ["포털 API", "견적 공유", "계약 공유"],
  },
]

const INTEGRATION_CATEGORY_ORDER: AdminIntegrationCategory[] = [
  "core",
  "lead",
  "notification",
  "marketing",
  "crm",
  "billing",
  "portal",
  "ops",
]

const INTEGRATION_CATEGORY_META: Record<
  AdminIntegrationCategory,
  {
    label: string
    description: string
  }
> = {
  core: {
    label: "핵심 기반",
    description: "관리자, 공개 사이트, 포털이 공통으로 기대는 기본 연결입니다.",
  },
  lead: {
    label: "리드·상담",
    description: "문의, 데모 신청, 상담 수집과 전달 흐름입니다.",
  },
  notification: {
    label: "알림",
    description: "운영 알림, digest 수신자, 외부 알림 채널입니다.",
  },
  marketing: {
    label: "마케팅",
    description: "캠페인, 픽셀, 광고 성과 조회 계열 연결입니다.",
  },
  crm: {
    label: "CRM",
    description: "외부 CRM 동기화와 writeback queue 준비 상태입니다.",
  },
  billing: {
    label: "결제·정산",
    description: "결제 승인, 견적 코드, 환율 fallback 운영 연결입니다.",
  },
  portal: {
    label: "파트너 포털",
    description: "파트너 API, 공유 링크, 계약·견적 문서 흐름입니다.",
  },
  ops: {
    label: "운영 자동화",
    description: "스케줄러, Google 계정, 지점 운영 데이터 연결입니다.",
  },
}

function PanelCard({
  title,
  description,
  children,
  badge,
}: {
  title: string
  description?: string
  children: ReactNode
  badge?: string
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-5">
        <div>
          <h3 className="text-[15px] font-semibold text-[#111110]">{title}</h3>
          {description ? (
            <p className="mt-1 text-[12px] text-[#1a1a1a]/40">{description}</p>
          ) : null}
        </div>
        {badge ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#f0f0ec] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/50">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
    </section>
  )
}

function EmptyHint({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-5 py-4">
      <p className="text-[13px] font-medium text-[#111110]">{title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/40">{description}</p>
      <p className="mt-2 text-[12px] font-medium text-[#111110]">{action}</p>
    </div>
  )
}

function getHealthLabel(health: AdminIntegrationHealth) {
  if (health === "ok") return "정상"
  if (health === "warning") return "확인 필요"
  if (health === "error") return "오류"
  return "미검증"
}

function getSourceLabel(source: AdminIntegrationSource) {
  if (source === "env") return "env"
  if (source === "db") return "DB"
  if (source === "mixed") return "env+DB"
  return "미설정"
}

function getHealthTone(health: AdminIntegrationHealth) {
  if (health === "ok") return "border-[#D1FAE5] bg-[#ECFDF5] text-[#084734]"
  if (health === "warning") return "border-amber-200 bg-amber-50 text-amber-800"
  if (health === "error") return "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
  return "border-[#e8e8e4] bg-white text-[#1a1a1a]/45"
}

function formatStatusTime(value?: string) {
  if (!value) return "기록 없음"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "기록 없음"

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function HealthBadge({ health }: { health: AdminIntegrationHealth }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold", getHealthTone(health))}>
      {getHealthLabel(health)}
    </span>
  )
}

function findStatusItems(items: AdminIntegrationStatusItem[], keys: string[]) {
  return items.filter((item) => keys.includes(item.key))
}

function summarizeConnectorHealth(items: AdminIntegrationStatusItem[]): AdminIntegrationHealth {
  if (items.some((item) => item.health === "error")) return "error"
  if (items.some((item) => item.health === "warning")) return "warning"
  if (items.length > 0 && items.every((item) => item.health === "ok")) return "ok"
  if (items.some((item) => item.configured)) return "warning"
  return "unknown"
}

function buildIntegrationGroups(items: AdminIntegrationStatusItem[]) {
  return INTEGRATION_CATEGORY_ORDER.map((category) => {
    const categoryItems = items.filter((item) => item.category === category)
    const configuredCount = categoryItems.filter((item) => item.configured).length
    const issueCount = categoryItems.filter((item) => item.health === "warning" || item.health === "error").length
    const unknownCount = categoryItems.filter((item) => item.health === "unknown").length

    return {
      category,
      meta: INTEGRATION_CATEGORY_META[category],
      items: categoryItems,
      totalCount: categoryItems.length,
      configuredCount,
      issueCount,
      unknownCount,
      missingCount: categoryItems.length - configuredCount,
      health: summarizeConnectorHealth(categoryItems),
    }
  }).filter((group) => group.totalCount > 0)
}

function IntegrationStatusCard({ item }: { item: AdminIntegrationStatusItem }) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[#111110]">{item.label}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
            {item.description ?? "서버 설정 기준으로 연결 상태를 판정합니다."}
          </p>
        </div>
        <HealthBadge health={item.health} />
      </div>

      <div className="mt-4 grid gap-2 text-[11px] text-[#1a1a1a]/45 sm:grid-cols-2">
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <span className="block font-semibold text-[#111110]">설정 출처</span>
          {getSourceLabel(item.source)}
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <span className="block font-semibold text-[#111110]">최근 확인</span>
          {formatStatusTime(item.lastCheckedAt)}
        </div>
      </div>

      {item.requiredKeys.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.requiredKeys.slice(0, 4).map((key) => (
            <span key={key} className="rounded-full bg-[#f0f0ec] px-2 py-1 text-[10px] font-medium text-[#1a1a1a]/45">
              {key}
            </span>
          ))}
          {item.requiredKeys.length > 4 ? (
            <span className="rounded-full bg-[#f0f0ec] px-2 py-1 text-[10px] font-medium text-[#1a1a1a]/45">
              +{item.requiredKeys.length - 4}
            </span>
          ) : null}
        </div>
      ) : null}

      {item.lastErrorSummary ? (
        <p className="mt-3 rounded-xl bg-[#FEF3EE] px-3 py-2 text-[11px] leading-relaxed text-[#B85C33]">
          {item.lastErrorSummary}
        </p>
      ) : null}

      {item.adminHref ? (
        <a
          href={item.adminHref}
          className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#084734] hover:underline"
        >
          관련 화면 열기 <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  )
}

function IntegrationConnectionSummary({
  items,
  loading,
}: {
  items: AdminIntegrationStatusItem[]
  loading: boolean
}) {
  const groups = buildIntegrationGroups(items)
  const configuredCount = items.filter((item) => item.configured).length
  const totalCount = items.length

  return (
    <PanelCard
      title="연결 현황 요약"
      description="어드민 세팅 탭에서 연결된 서비스와 점검할 연결을 운영 영역별로 정리합니다."
      badge={totalCount > 0 ? `${configuredCount}/${totalCount} 연결` : "연결 지도"}
    >
      {loading && groups.length === 0 ? (
        <p className="text-[13px] text-[#1a1a1a]/35">연결 항목을 정리하는 중...</p>
      ) : groups.length === 0 ? (
        <EmptyHint
          title="아직 정리할 연결 항목이 없습니다."
          description="연동 상태 API가 응답하면 연결된 서비스와 미설정 항목이 영역별로 표시됩니다."
          action="먼저 연동 상태를 새로고침해 주세요."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((group) => (
            <div key={group.category} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#111110]">{group.meta.label}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                    {group.meta.description}
                  </p>
                </div>
                <HealthBadge health={group.health} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-[#fafaf8] px-2 py-2">
                  <p className="text-[13px] font-bold text-[#111110]">
                    {group.configuredCount}/{group.totalCount} 연결
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium text-[#1a1a1a]/35">설정됨</p>
                </div>
                <div className="rounded-xl bg-[#fafaf8] px-2 py-2">
                  <p className="text-[13px] font-bold text-amber-700">확인 {group.issueCount}</p>
                  <p className="mt-0.5 text-[10px] font-medium text-[#1a1a1a]/35">주의</p>
                </div>
                <div className="rounded-xl bg-[#fafaf8] px-2 py-2">
                  <p className="text-[13px] font-bold text-[#1a1a1a]/45">미설정 {group.missingCount}</p>
                  <p className="mt-0.5 text-[10px] font-medium text-[#1a1a1a]/35">연결 전</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {group.items.map((item) => (
                  <span
                    key={item.key}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
                      item.configured
                        ? "bg-[#ECFDF5] text-[#084734]"
                        : "bg-[#f0f0ec] text-[#1a1a1a]/45"
                    )}
                  >
                    {item.label}
                    <span className="font-medium opacity-70">{getHealthLabel(item.health)}</span>
                  </span>
                ))}
              </div>

              {group.unknownCount > 0 ? (
                <p className="mt-3 text-[11px] leading-relaxed text-[#1a1a1a]/40">
                  미검증 항목 {group.unknownCount}개는 키가 없거나 아직 헬스체크 기록이 없습니다.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  )
}

function IntegrationSectionNav({
  active,
  onChange,
}: {
  active: AdminIntegrationSection
  onChange: (value: AdminIntegrationSection) => void
}) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      {INTEGRATION_SECTIONS.map((section) => {
        const selected = active === section.key

        return (
          <button
            key={section.key}
            type="button"
            onClick={() => onChange(section.key)}
            className={cn(
              "flex min-h-[76px] items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
              selected
                ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                : "border-[#e8e8e4] bg-white text-[#1a1a1a]/65 hover:border-[#c8c8c4] hover:text-[#111110]"
            )}
          >
            <span className={cn("mt-0.5 shrink-0", selected ? "text-[#084734]" : "text-[#1a1a1a]/35")}>
              {section.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{section.label}</span>
              <span className={cn("mt-1 block text-[11px]", selected ? "text-[#084734]/70" : "text-[#1a1a1a]/35")}>
                {section.desc}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function IntegrationStatusSummary({
  items,
  generatedAt,
  loading,
  error,
  onRefresh,
}: {
  items: AdminIntegrationStatusItem[]
  generatedAt?: string
  loading: boolean
  error: string | null
  onRefresh: () => void
}) {
  const ok = items.filter((item) => item.health === "ok").length
  const warning = items.filter((item) => item.health === "warning").length
  const failed = items.filter((item) => item.health === "error").length
  const unknown = items.filter((item) => item.health === "unknown").length

  return (
    <PanelCard
      title="연동 상태"
      description="서버가 env와 저장 설정을 기준으로 판정한 secret-free 상태입니다."
      badge={generatedAt ? `확인 ${formatStatusTime(generatedAt)}` : "상태 조회"}
    >
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-4 gap-3 text-center sm:min-w-[360px]">
          {[
            ["정상", ok, "text-[#084734]"],
            ["확인", warning, "text-amber-700"],
            ["오류", failed, "text-[#B85C33]"],
            ["미검증", unknown, "text-[#1a1a1a]/40"],
          ].map(([label, value, color]) => (
            <div key={label} className="rounded-xl bg-white px-3 py-2">
              <p className={cn("text-lg font-bold", color)}>{value}</p>
              <p className="text-[10px] font-medium text-[#1a1a1a]/35">{label}</p>
            </div>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          className="bg-white"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          새로고침
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[12px] text-[#B85C33]">
          {error}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <p className="text-[13px] text-[#1a1a1a]/35">연동 상태를 불러오는 중...</p>
      ) : items.length === 0 ? (
        <EmptyHint
          title="아직 표시할 연동 상태가 없습니다."
          description="상태 API가 준비되면 env와 저장 설정 기준의 연결 카드가 이 영역에 표시됩니다."
          action="연동 상태 API와 관리자 권한을 확인하세요."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <IntegrationStatusCard key={item.key} item={item} />
          ))}
        </div>
      )}
    </PanelCard>
  )
}

function ApiKeyStatusPanel({ items }: { items: AdminIntegrationStatusItem[] }) {
  return (
    <PanelCard
      title="API 키 상태"
      description="원문을 보거나 저장하지 않고 설정 여부만 확인합니다. env 기반 secret은 배포 환경에서 관리합니다."
      badge="secret-free"
    >
      <div className="space-y-3">
        {API_KEY_STATUS_ROWS.map((row) => {
          const related = findStatusItems(items, row.statusKeys)
          const health = summarizeConnectorHealth(related)
          const source: AdminIntegrationSource = related.length > 1
            ? related.some((item) => item.source === "mixed") || new Set(related.map((item) => item.source)).size > 1
              ? "mixed"
              : related[0]?.source ?? "not_configured"
            : related[0]?.source ?? "not_configured"

          return (
            <div key={row.label} className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#111110]">{row.label}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">{row.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2.5 py-1 text-[11px] font-semibold text-[#1a1a1a]/50">
                    {getSourceLabel(source)}
                  </span>
                  <HealthBadge health={health} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {row.envKeys.map((key) => (
                  <span key={key} className="rounded-full bg-[#f0f0ec] px-2 py-1 text-[10px] font-medium text-[#1a1a1a]/45">
                    {key}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" />
          <p className="text-[12px] leading-relaxed text-[#1a1a1a]/55">
            API 키 교체는 암호화 저장소와 감사 로그가 붙은 write-only endpoint가 준비된 뒤 연결합니다.
            지금 화면은 키 원문을 저장하거나 표시하지 않고, 서버가 판정한 설정 상태만 보여줍니다.
          </p>
        </div>
      </div>
    </PanelCard>
  )
}

function ConnectorFeaturePanel({ items }: { items: AdminIntegrationStatusItem[] }) {
  return (
    <PanelCard
      title="커넥터 기능"
      description="연동을 API 키 단위가 아니라 운영 기능 단위로 확인하고 관련 화면으로 이동합니다."
      badge="기능 지도"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {CONNECTOR_FEATURE_ROWS.map((row) => {
          const related = findStatusItems(items, row.statusKeys)
          const health = summarizeConnectorHealth(related)

          return (
            <div key={row.key} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-[#111110]">{row.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">{row.description}</p>
                </div>
                <HealthBadge health={health} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {row.features.map((feature) => (
                  <span key={feature} className="rounded-full bg-[#ECFDF5] px-2 py-1 text-[10px] font-semibold text-[#084734]">
                    {feature}
                  </span>
                ))}
              </div>
              <a
                href={row.href}
                className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#084734] hover:underline"
              >
                관련 화면 열기 <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )
        })}
      </div>
    </PanelCard>
  )
}

function IntegrationOpsNotice() {
  return (
    <PanelCard
      title="운영 스케줄 경고"
      description="Settings에서는 cron을 직접 수정하지 않고, 배포 설정 리스크만 노출합니다."
      badge="Hobby 기준 확인"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-[13px] font-semibold text-amber-900">/api/cron/sync-branch</p>
              <p className="mt-1 text-[12px] leading-relaxed text-amber-800">
                현재 vercel.json 기준 하루 3회 등록되어 있어 Hobby 기준 확인이 필요합니다.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-[13px] font-semibold text-amber-900">/api/cron/sync-external-crm</p>
              <p className="mt-1 text-[12px] leading-relaxed text-amber-800">
                현재 vercel.json 기준 하루 4회 등록되어 있어 외부 스케줄러 또는 Pro 전환 판단이 필요합니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PanelCard>
  )
}

export function IntegrationControlPanel({
  active,
  onChange,
  status,
  loading,
  error,
  onRefresh,
  children,
}: {
  active: AdminIntegrationSection
  onChange: (value: AdminIntegrationSection) => void
  status: AdminIntegrationStatusResponse | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  children: ReactNode
}) {
  const items = status?.items ?? []

  return (
    <>
      <PanelCard
        title="연동 제어판"
        description="연결 상태, API 키 설정 여부, 커넥터 기능, 웹훅 링크를 분리해 확인합니다."
        badge="secret-free"
      >
        <IntegrationSectionNav active={active} onChange={onChange} />
      </PanelCard>

      <IntegrationConnectionSummary items={items} loading={loading} />

      {active === "status" ? (
        <>
          <IntegrationStatusSummary
            items={items}
            generatedAt={status?.generatedAt}
            loading={loading}
            error={error}
            onRefresh={onRefresh}
          />
          <IntegrationOpsNotice />
        </>
      ) : null}

      {active === "apiKeys" ? <ApiKeyStatusPanel items={items} /> : null}
      {active === "connectors" ? <ConnectorFeaturePanel items={items} /> : null}
      {active === "webhooks" ? <>{children}</> : null}
    </>
  )
}
