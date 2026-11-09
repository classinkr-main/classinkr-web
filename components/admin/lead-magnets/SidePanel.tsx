"use client"

/**
 * 자료 퍼널 오른쪽 패널 — 편집(공개 화면 그대로 글자를 눌러 고침) · 성과 · 추천.
 * 본문 문항·PDF·세일즈·추적은 「전체 편집」(FullEditor)에서 고친다.
 */
import { ExternalLink, Loader2, Maximize2 } from "lucide-react"

import type { LeadMagnet } from "@/lib/lead-magnets"
import type { LeadMagnetQualityIssue } from "@/lib/lead-magnet-quality"
import {
  getLeadMagnetCategoryLabel,
  getLeadMagnetGateLabel,
  getLeadMagnetItemCount,
  getLeadMagnetTierLabel,
} from "@/lib/lead-magnets-helpers"
import { formatPercent, rate, type LeadMagnetMetricRow, type LeadMagnetMetricsResponse } from "./model"
import { RECOMMENDATION_KIND_LABEL, type Recommendation } from "./recommendations"
import { BlogGateSurface, ResourcePageSurface, fieldInfo, valueAtPath, type UpdateDraft } from "./Surfaces"

export type PanelTab = "edit" | "perf" | "rec"
export type PanelSurface = "blog" | "page"

const EVENT_LABEL: Record<string, string> = {
  view_resource_card: "노출",
  view_resource: "조회",
  submit_newsletter: "신청",
  download_materials: "열람",
  click_cta: "CTA",
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
}

export default function SidePanel({
  draft,
  baseline,
  update,
  tab,
  onTabChange,
  surface,
  onSurfaceChange,
  focus,
  onFocusField,
  changedCount,
  saving,
  writable,
  notice,
  error,
  metricRow,
  metrics,
  linkedPosts,
  recommendations,
  quality,
  relatedMagnets,
  onSelectRelated,
  onSave,
  onRevert,
  onOpenFull,
  onRecommendation,
  onCopyTracked,
}: {
  draft: LeadMagnet
  baseline: LeadMagnet
  update: UpdateDraft
  tab: PanelTab
  onTabChange: (tab: PanelTab) => void
  surface: PanelSurface
  onSurfaceChange: (surface: PanelSurface) => void
  focus: string | null
  onFocusField: (path: string) => void
  changedCount: number
  saving: boolean
  writable: boolean
  notice: string
  error: string
  metricRow: LeadMagnetMetricRow | null
  metrics: LeadMagnetMetricsResponse | null
  linkedPosts: Array<{ title: string; href: string; views: number | null }>
  recommendations: Recommendation[]
  quality: readonly LeadMagnetQualityIssue[]
  relatedMagnets: Array<{ slug: string; title: string }>
  onSelectRelated: (slug: string) => void
  onSave: () => void
  onRevert: () => void
  onOpenFull: () => void
  onRecommendation: (rec: Recommendation) => void
  onCopyTracked: () => void
}) {
  const info = fieldInfo(focus)
  const focusValue = focus ? valueAtPath(draft, focus) : null
  const recCount = recommendations.length + quality.filter((issue) => issue.severity === "fix").length
  const row = metricRow
  const steps: Array<[string, number]> = row
    ? [
        ["조회", row.views],
        ["신청", row.submissions],
        ["열람", row.downloads],
        ["리드", row.leads],
        ["전환", row.convertedLeads],
      ]
    : []
  const events = (metrics?.recentEvents ?? []).filter((event) => event.leadMagnet === draft.slug).slice(0, 5)

  return (
    <aside aria-label="고른 자료" className="flex min-w-0 flex-col rounded-xl border border-[#E8E8E4] bg-white">
      <div className="space-y-1 px-5 pt-[18px]">
        <p className="text-[12px] text-[#615D59]">
          {getLeadMagnetCategoryLabel(draft.category)} · {getLeadMagnetTierLabel(draft.tier)} · {getLeadMagnetGateLabel(draft.gate)} · {getLeadMagnetItemCount(draft)}문항 · {draft.estimatedMinutes}분 · {draft.published ? "공개" : "비공개"}
        </p>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[18px] font-bold leading-snug tracking-[-0.2px] text-[#111110]">{draft.title || "새 자료"}</h2>
          <button type="button" onClick={onOpenFull} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-black/[0.05] px-3 text-[13px] font-semibold text-[#111110] hover:bg-black/[0.08]">
            <Maximize2 className="h-3.5 w-3.5" />
            전체 편집
          </button>
        </div>
      </div>

      <nav aria-label="자료 보기" className="mt-3 flex gap-5 border-b border-[#E8E8E4] px-5">
        {(
          [
            ["edit", "편집", changedCount > 0 ? String(changedCount) : ""],
            ["perf", "성과", ""],
            ["rec", "추천", recCount > 0 ? String(recCount) : ""],
          ] as Array<[PanelTab, string, string]>
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => onTabChange(key)}
            className={`-mb-px inline-flex items-center gap-1 border-b-2 px-0.5 pb-[11px] pt-2.5 text-[14px] font-semibold ${tab === key ? "border-[#084734] text-[#111110]" : "border-transparent text-[#615D59] hover:text-[#111110]"}`}
          >
            {label}
            {count ? <span className="text-[12px] font-medium tabular-nums text-[#615D59]">{count}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "edit" ? (
        <>
          <fieldset disabled={!writable} className="space-y-2.5 px-5 pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <div role="group" aria-label="미리보기 화면" className="inline-flex gap-0.5 rounded-lg bg-[#F0EFEC] p-[3px]">
                {(
                  [
                    ["blog", "블로그 신청 상자"],
                    ["page", "자료 페이지"],
                  ] as Array<[PanelSurface, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={surface === key}
                    onClick={() => onSurfaceChange(key)}
                    className={`h-[30px] rounded-md px-2.5 text-[12px] font-semibold ${surface === key ? "bg-white text-[#111110] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-[#615D59]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <a href={`/resources/${encodeURIComponent(draft.slug)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734]">
                실제 페이지
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className={`min-h-[18px] text-[12px] ${info ? "text-[#084734]" : "text-[#615D59]"}`}>
              {info ? `${info.label} · ${(focusValue ?? "").length}자 · 같이 바뀌는 곳: ${info.where.join(" · ")}` : "글자를 눌러 바로 고칩니다. 고친 칸은 연두색으로 남습니다."}
            </p>
            <div className="rounded-[10px] bg-[#F6F5F4] p-3">
              {surface === "blog" ? (
                <BlogGateSurface draft={draft} baseline={baseline} update={update} onFocusField={onFocusField} compact />
              ) : (
                <ResourcePageSurface draft={draft} baseline={baseline} update={update} onFocusField={onFocusField} compact />
              )}
            </div>
            <p className="text-[12px] text-[#615D59]">
              문항·점수 해석·PDF 내용·세일즈 응대는{" "}
              <button type="button" onClick={onOpenFull} className="font-semibold text-[#084734] hover:underline">
                전체 편집
              </button>
              에서 고칩니다.
            </p>
          </fieldset>
          {notice || error ? (
            <p role={error ? "alert" : "status"} className={`px-5 pt-3 text-[13px] ${error ? "text-[#B43E3E]" : "text-[#084734]"}`}>
              {error || notice}
            </p>
          ) : null}
          <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-[#E8E8E4] px-5 py-3">
            <span className={`inline-flex items-center gap-2 text-[13px] font-semibold ${changedCount > 0 ? "text-[#A8741A]" : "text-[#615D59]"}`}>
              <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${changedCount > 0 ? "bg-[#A8741A]" : "bg-[#D5D2CB]"}`} />
              {changedCount > 0 ? `변경 ${changedCount}곳 · 저장 전` : "바뀐 곳 없음"}
            </span>
            <span className="flex gap-1.5">
              <button type="button" onClick={onRevert} disabled={changedCount === 0} className="h-[38px] rounded-md bg-black/[0.05] px-3 text-[13px] font-semibold text-[#111110] disabled:opacity-50">
                되돌리기
              </button>
              <button type="button" onClick={onSave} disabled={saving || !writable} className="inline-flex h-[38px] items-center gap-1.5 rounded-md bg-[#084734] px-[18px] text-[13px] font-semibold text-white hover:bg-[#065c41] disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                저장
              </button>
            </span>
          </div>
        </>
      ) : null}

      {tab === "perf" ? (
        <div className="space-y-5 px-5 pb-5 pt-4">
          {row ? (
            <>
              <p className="text-[13px] text-[#31302E]">
                최근 {metrics?.days ?? 30}일 카드 노출 <strong className="tabular-nums">{row.impressions.toLocaleString("ko-KR")}</strong>회 · 조회{" "}
                <strong className="tabular-nums">{row.views.toLocaleString("ko-KR")}</strong>회
              </p>
              <div className="space-y-2.5">
                {steps.map(([label, value], index) => {
                  const base = row.views || 1
                  const stepRate = index === 0 ? null : rate(value, steps[index - 1][1])
                  return (
                    <div key={label} className="grid grid-cols-[44px_minmax(0,1fr)_52px_56px] items-center gap-2.5">
                      <span className="text-[13px] text-[#615D59]">{label}</span>
                      <span aria-hidden="true" className="flex h-2 rounded bg-[#F0F0EC]">
                        <span className="h-2 rounded bg-[#084734]" style={{ width: `${Math.round((value / base) * 100)}%`, minWidth: value > 0 ? 2 : 0 }} />
                      </span>
                      <span className="text-right text-[13px] font-semibold tabular-nums">{value.toLocaleString("ko-KR")}</span>
                      <span className="text-right text-[12px] tabular-nums text-[#615D59]">{stepRate === null ? "" : formatPercent(stepRate)}</span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-[#615D59]">성과를 불러오는 중이거나 아직 기록이 없습니다.</p>
          )}
          <div className="space-y-1.5">
            <h3 className="text-[13px] font-bold text-[#111110]">이 자료를 붙인 블로그 글</h3>
            {linkedPosts.length === 0 ? (
              <p className="text-[13px] text-[#615D59]">아직 붙인 글이 없습니다.</p>
            ) : (
              linkedPosts.map((post) => (
                <a key={post.href} href={post.href} className="flex justify-between gap-3 text-[13px] text-[#111110] hover:text-[#084734]">
                  <span className="truncate">{post.title}</span>
                  <span className="shrink-0 tabular-nums text-[#615D59]">{post.views === null ? "" : `조회 ${post.views.toLocaleString("ko-KR")}`}</span>
                </a>
              ))
            )}
          </div>
          <div className="space-y-1.5">
            <h3 className="text-[13px] font-bold text-[#111110]">최근 기록</h3>
            {events.length === 0 ? (
              <p className="text-[13px] text-[#615D59]">기간 안 기록이 없습니다.</p>
            ) : (
              events.map((event, index) => (
                <p key={`${event.createdAt}-${index}`} className="flex justify-between gap-3 text-[13px] text-[#31302E]">
                  <span className="truncate">
                    {EVENT_LABEL[event.eventName] ?? event.eventName} · {event.page ?? "-"}
                  </span>
                  <span className="shrink-0 tabular-nums text-[#615D59]">{formatDateTime(event.createdAt)}</span>
                </p>
              ))
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-bold text-[#111110]">추천 배치</h3>
              <button type="button" onClick={onCopyTracked} className="text-[12px] font-semibold text-[#084734] hover:underline">
                UTM 링크 복사
              </button>
            </div>
            {draft.suggestedPlacements.length === 0 ? (
              <p className="text-[13px] text-[#615D59]">적어 둔 배치가 없습니다.</p>
            ) : (
              draft.suggestedPlacements.map((placement) => (
                <p key={placement} className="text-[13px] text-[#31302E]">
                  · {placement}
                </p>
              ))
            )}
          </div>
        </div>
      ) : null}

      {tab === "rec" ? (
        <div className="px-5 pb-5 pt-2">
          {quality.map((issue) => (
            <div key={`${issue.id}-${issue.field ?? ""}`} className="space-y-1 border-b border-[#E8E8E4] py-3">
              <p className={`text-[12px] font-bold ${issue.severity === "fix" ? "text-[#B43E3E]" : "text-[#A8741A]"}`}>
                품질 점검 · {issue.severity === "fix" ? "고쳐야 함" : "다듬으면 좋음"}
              </p>
              <p className="text-[14px] text-[#111110]">{issue.message}</p>
              {issue.where ? <p className="text-[12px] text-[#615D59]">{issue.where}</p> : null}
            </div>
          ))}
          {recommendations.map((rec) => (
            <div key={rec.id} className="space-y-1 border-b border-[#E8E8E4] py-3">
              <p className={`text-[12px] font-bold ${rec.kind === "link" ? "text-[#084734]" : "text-[#A8741A]"}`}>{RECOMMENDATION_KIND_LABEL[rec.kind]}</p>
              <p className="text-[14px] text-[#111110]">{rec.text}</p>
              <p className="text-[12px] tabular-nums text-[#615D59]">{rec.why}</p>
              <button type="button" onClick={() => onRecommendation(rec)} className="mt-1 h-8 whitespace-nowrap rounded-md border border-[#084734] bg-white px-3 text-[13px] font-semibold text-[#084734]">
                {rec.actionLabel}
              </button>
            </div>
          ))}
          {quality.length === 0 && recommendations.length === 0 ? <p className="py-3 text-[13px] text-[#615D59]">지금은 손볼 곳이 없습니다.</p> : null}
          <h3 className="mb-1 mt-4 text-[13px] font-bold text-[#111110]">같이 권할 자료</h3>
          {relatedMagnets.length === 0 ? (
            <p className="text-[13px] text-[#615D59]">PDF 「다음에 권할 자료」가 비어 있습니다.</p>
          ) : (
            relatedMagnets.map((magnet) => (
              <button key={magnet.slug} type="button" onClick={() => onSelectRelated(magnet.slug)} className="block py-1.5 text-left text-[13px] font-semibold text-[#084734] hover:underline">
                {magnet.title}
              </button>
            ))
          )}
        </div>
      ) : null}
    </aside>
  )
}
