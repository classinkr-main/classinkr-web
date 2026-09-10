"use client"

import Link from "next/link"
import { useState } from "react"
import {
  CheckCircle2,
  Download,
  MousePointerClick,
  Settings2,
  Users,
  XCircle,
} from "lucide-react"

export type TrafficDetailTab = "conversions" | "diagnostics"

interface EventCountRow {
  event: string
  count: number
  lastSeen: string | null
}

interface ButtonCountRow {
  button: string
  event: string
  count: number
  lastSeen: string | null
}

interface MarketingConversionStatus {
  meta: {
    pixelId: string | null
    datasetId: string | null
    capiConfigured: boolean
    testEventCodeConfigured: boolean
  }
  google: {
    adsId: string
    demoConversionLabelConfigured: boolean
    ga4MeasurementId: string | null
    measurementProtocolConfigured: boolean
  }
  internal: {
    trackingEnabled: boolean
  }
}

interface TrafficConversionPanelProps {
  activeTab: TrafficDetailTab
  onTabChange: (tab: TrafficDetailTab) => void
  loading: boolean
  metrics: {
    cta: number
    demo: number
    newsletter: number
    download: number
  }
  /** 리드 조회 실패로 전환 수치가 0으로 보이는 상태. 0건과 "모름"을 구분해 말한다. */
  leadConversionsUnavailable?: boolean
  eventTotal: number
  eventRows: EventCountRow[]
  buttonRows: ButtonCountRow[]
  status: MarketingConversionStatus | null
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="min-w-0 rounded-xl border border-black/[0.08] bg-[#FAFAF8] p-4">
      <div className="flex items-center gap-2 text-[#084734]">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5]">
          {icon}
        </span>
        <p className="text-[13px] font-semibold text-[#31302E]">{label}</p>
      </div>
      <p className="mt-3 tabular-nums text-[26px] font-bold leading-none tracking-[-0.03em] text-[#111110]">
        {value}
      </p>
      <p className="mt-2 text-[12px] leading-5 text-[#615D59]">{detail}</p>
    </div>
  )
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[#31302E]">{label}</p>
        <p className="mt-0.5 break-words text-[12px] leading-5 text-[#615D59]">{detail}</p>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
          ok
            ? "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
            : "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]"
        }`}
      >
        {ok ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> : <XCircle aria-hidden="true" className="h-3.5 w-3.5" />}
        {ok ? "연결됨" : "점검 필요"}
      </span>
    </div>
  )
}

export function TrafficConversionPanel({
  activeTab,
  onTabChange,
  loading,
  metrics,
  leadConversionsUnavailable = false,
  eventTotal,
  eventRows,
  buttonRows,
  status,
}: TrafficConversionPanelProps) {
  const [showAllButtons, setShowAllButtons] = useState(false)
  const visibleButtons = showAllButtons ? buttonRows.slice(0, 10) : buttonRows.slice(0, 5)

  return (
    <section aria-labelledby="traffic-conversion-title" className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
      <div className="border-b border-black/[0.08] px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="traffic-conversion-title" className="text-[16px] font-bold tracking-[-0.01em] text-[#111110]">
              전환 성과 / 계측 진단
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-[#615D59]">
              성과 지표를 먼저 보고, 원시 이벤트와 픽셀 상태는 필요할 때 점검합니다.
            </p>
          </div>
          <p className="text-[12px] font-medium tabular-nums text-[#615D59]">수집 이벤트 {eventTotal.toLocaleString("ko-KR")}건</p>
        </div>

        <div className="mt-4 flex gap-1" role="tablist" aria-label="전환 상세 보기">
          <button
            id="traffic-conversions-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === "conversions"}
            aria-controls="traffic-conversions-panel"
            onClick={() => onTabChange("conversions")}
            className={`min-h-11 flex-1 border-b-2 px-4 py-2 text-[13px] font-semibold transition-colors sm:flex-none ${FOCUS_RING} ${
              activeTab === "conversions"
                ? "border-[#084734] text-[#084734]"
                : "border-transparent text-[#615D59] hover:text-[#111110]"
            }`}
          >
            전환 성과
          </button>
          <button
            id="traffic-diagnostics-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === "diagnostics"}
            aria-controls="traffic-diagnostics-panel"
            onClick={() => onTabChange("diagnostics")}
            className={`min-h-11 flex-1 border-b-2 px-4 py-2 text-[13px] font-semibold transition-colors sm:flex-none ${FOCUS_RING} ${
              activeTab === "diagnostics"
                ? "border-[#084734] text-[#084734]"
                : "border-transparent text-[#615D59] hover:text-[#111110]"
            }`}
          >
            계측 진단
          </button>
        </div>
      </div>

      {activeTab === "conversions" ? (
        <div
          id="traffic-conversions-panel"
          role="tabpanel"
          aria-labelledby="traffic-conversions-tab"
          className="p-4 sm:p-6"
        >
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-32 animate-pulse rounded-xl bg-[#F0F0EC]" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  icon={<MousePointerClick aria-hidden="true" className="h-4 w-4" />}
                  label="CTA 클릭"
                  value={`${metrics.cta.toLocaleString("ko-KR")}회`}
                  detail="click_cta 이벤트 · 분석 동의한 방문자만"
                />
                <Metric
                  icon={<Users aria-hidden="true" className="h-4 w-4" />}
                  label="홈페이지 상담 신청"
                  value={
                    leadConversionsUnavailable
                      ? "—"
                      : `${metrics.demo.toLocaleString("ko-KR")}건`
                  }
                  detail={
                    leadConversionsUnavailable
                      ? "리드 조회 실패 — 수치를 신뢰할 수 없음"
                      : `저장된 리드 기준 · 뉴스레터 ${metrics.newsletter.toLocaleString("ko-KR")}건`
                  }
                />
                <Metric
                  icon={<Download aria-hidden="true" className="h-4 w-4" />}
                  label="자료 다운로드"
                  value={`${metrics.download.toLocaleString("ko-KR")}회`}
                  detail="download_materials 이벤트 · 분석 동의한 방문자만"
                />
              </div>

              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111110]">상위 CTA</h3>
                    <p className="mt-0.5 text-[12px] text-[#615D59]">가장 많이 선택된 버튼을 클릭 수 순으로 봅니다.</p>
                  </div>
                  {buttonRows.length > 5 && (
                    <button
                      type="button"
                      aria-expanded={showAllButtons}
                      onClick={() => setShowAllButtons((current) => !current)}
                      className={`min-h-11 shrink-0 rounded-md px-3 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5] ${FOCUS_RING}`}
                    >
                      {showAllButtons ? "접기" : "전체 보기"}
                    </button>
                  )}
                </div>

                {visibleButtons.length > 0 ? (
                  <ol className="divide-y divide-black/[0.06] border-y border-black/[0.08]">
                    {visibleButtons.map((row, index) => (
                      <li key={`${row.event}:${row.button}`} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                        <span className="text-center text-[12px] font-semibold tabular-nums text-[#615D59]">{index + 1}</span>
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[12px] font-medium text-[#31302E]">{row.button}</p>
                          <p className="mt-0.5 text-[11px] text-[#615D59]">{row.event}</p>
                        </div>
                        <span className="text-[13px] font-bold tabular-nums text-[#111110]">
                          {row.count.toLocaleString("ko-KR")}회
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="rounded-xl bg-[#FAFAF8] px-4 py-8 text-center text-[13px] text-[#615D59]">
                    아직 CTA 버튼 데이터가 없습니다.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div
          id="traffic-diagnostics-panel"
          role="tabpanel"
          aria-labelledby="traffic-diagnostics-tab"
          className="grid gap-6 p-4 lg:grid-cols-2 sm:p-6"
        >
          <div>
            <div className="mb-3 flex items-center gap-2">
              <MousePointerClick aria-hidden="true" className="h-4 w-4 text-[#084734]" />
              <h3 className="text-[14px] font-semibold text-[#111110]">원시 이벤트</h3>
            </div>
            {eventRows.length > 0 ? (
              <div className="divide-y divide-black/[0.06] border-y border-black/[0.08]">
                {eventRows.map((row) => (
                  <div key={row.event} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate font-mono text-[12px] text-[#31302E]">{row.event}</span>
                    <span className="shrink-0 text-[12px] font-bold tabular-nums text-[#111110]">
                      {row.count.toLocaleString("ko-KR")}회
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-[#FAFAF8] px-4 py-8 text-center text-[13px] text-[#615D59]">
                수집된 이벤트가 없습니다.
              </p>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Settings2 aria-hidden="true" className="h-4 w-4 text-[#084734]" />
                <h3 className="text-[14px] font-semibold text-[#111110]">픽셀 연결 상태</h3>
              </div>
              <Link
                href="/admin/settings"
                className={`inline-flex min-h-11 items-center rounded-md px-3 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5] ${FOCUS_RING}`}
              >
                설정 열기
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-xl bg-[#F0F0EC]" />
                ))}
              </div>
            ) : status ? (
              <div className="border-y border-black/[0.08]">
                <StatusRow
                  label="내부 추적"
                  ok={status.internal.trackingEnabled}
                  detail="공개 사이트 page_view·전환 이벤트 적재"
                />
                <StatusRow
                  label="Google Analytics 4"
                  ok={Boolean(status.google.ga4MeasurementId)}
                  detail={status.google.ga4MeasurementId ?? "측정 ID 미설정"}
                />
                <StatusRow
                  label="Google Ads 전환"
                  ok={Boolean(status.google.adsId) && status.google.demoConversionLabelConfigured}
                  detail={status.google.adsId || "광고 ID 미설정"}
                />
                <StatusRow
                  label="Meta Pixel"
                  ok={Boolean(status.meta.pixelId)}
                  detail={status.meta.pixelId ?? "픽셀 ID 미설정"}
                />
                <StatusRow
                  label="Meta 전환 API"
                  ok={status.meta.capiConfigured}
                  detail={status.meta.capiConfigured ? "서버 전환 전송 구성됨" : "액세스 토큰·데이터셋 미설정"}
                />
              </div>
            ) : (
              <p className="rounded-xl bg-[#FAFAF8] px-4 py-8 text-center text-[13px] text-[#615D59]">
                계측 상태를 불러오지 못했습니다.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
