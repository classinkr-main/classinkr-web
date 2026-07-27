"use client"

/**
 * HistoryTab — 마케팅 허브 "발송 이력" 탭 패널 (코드 분할용 추출).
 *
 * MarketingHub.tsx의 history 블록 JSX를 그대로 옮겼다 — 상태(캠페인 목록·필터·
 * 파생 요약)와 핸들러(fetchCampaigns·복제/복사·탭 이동)는 전부 허브가 계속
 * 소유하고 props로만 받는다(로직 변경 없음). 허브에서 next/dynamic으로
 * 활성 탭일 때만 이 청크를 로드한다.
 */

import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import CampaignHistory from "@/components/admin/marketing/CampaignHistory"
import MessageLogTable from "@/components/admin/marketing/MessageLogTable"
import {
  EmptyInline,
  EmptyState,
  MiniBadge,
  Panel,
  formatDateTime,
} from "@/components/admin/marketing/tabs/tab-ui"
import type { EmailCampaign } from "@/lib/marketing-types"

type CampaignStatusFilter = "all" | EmailCampaign["status"]

interface HistoryTabProps {
  campaigns: EmailCampaign[]
  filteredCampaigns: EmailCampaign[]
  campaignStatusFilter: CampaignStatusFilter
  onCampaignStatusFilterChange: (value: CampaignStatusFilter) => void
  campaignsLoading: boolean
  campaignsError: string | null
  /** 허브의 fetchCampaigns 재시도 — 로직은 허브 소유, 여기서는 호출만 */
  onRetryCampaigns: () => void
  recentCampaigns: EmailCampaign[]
  recentDraftCampaigns: EmailCampaign[]
  recentFailedCampaigns: EmailCampaign[]
  recentSuccessRate: number | null
  latestCampaign: EmailCampaign | undefined
  onDuplicateCampaign: (campaign: EmailCampaign) => void
  onCopyCampaign: (campaign: EmailCampaign) => void
  onGoCompose: () => void
  onGoSubscribers: () => void
}

export default function HistoryTab({
  campaigns,
  filteredCampaigns,
  campaignStatusFilter,
  onCampaignStatusFilterChange,
  campaignsLoading,
  campaignsError,
  onRetryCampaigns,
  recentCampaigns,
  recentDraftCampaigns,
  recentFailedCampaigns,
  recentSuccessRate,
  latestCampaign,
  onDuplicateCampaign,
  onCopyCampaign,
  onGoCompose,
  onGoSubscribers,
}: HistoryTabProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="space-y-6">
        <Panel
          title="발송 이력"
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onCampaignStatusFilterChange("all")}>
                전체
              </Button>
              <Button variant="outline" size="sm" onClick={onGoCompose}>
                <Send className="mr-1.5 h-4 w-4" />
                이메일 작성
              </Button>
            </div>
          }
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {(["all", "sent", "draft", "failed"] as const).map((value) => (
              <button
                key={value}
                onClick={() => onCampaignStatusFilterChange(value)}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  campaignStatusFilter === value
                    ? "border-[#111110] bg-[#111110] text-white"
                    : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55 hover:border-[#c8c8c4] hover:text-[#111110]"
                }`}
              >
                {value === "all" ? "전체" : value === "sent" ? "발송됨" : value === "draft" ? "초안" : "실패"}
              </button>
            ))}
          </div>

          {campaignsError && campaigns.length === 0 ? (
            <EmptyState
              title="캠페인 이력을 불러오지 못했습니다."
              description="일시적인 문제일 수 있습니다. 잠시 후 다시 시도해 주세요."
              action={
                <Button variant="outline" size="sm" onClick={onRetryCampaigns}>
                  다시 시도
                </Button>
              }
            />
          ) : campaignsLoading && campaigns.length === 0 ? (
            <EmptyState
              title="캠페인 이력을 불러오는 중…"
              description="발송 이력과 요약을 정리하고 있습니다."
            />
          ) : campaigns.length === 0 ? (
            <EmptyState
              title="아직 발송된 캠페인이 없습니다."
              description="첫 발송을 만들면 이력과 요약이 동시에 쌓입니다."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button size="sm" onClick={onGoCompose} className="bg-[#084734] hover:bg-[#084734]/90">
                    발송 만들기
                  </Button>
                  <Button variant="outline" size="sm" onClick={onGoSubscribers}>
                    구독자 확인
                  </Button>
                </div>
              }
            />
          ) : filteredCampaigns.length === 0 ? (
            <EmptyState
              title="필터에 맞는 캠페인이 없습니다."
              description="상태 필터를 조금 넓혀보세요. 초안, 발송됨, 실패를 각각 따로 볼 수 있습니다."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => onCampaignStatusFilterChange("all")}>
                    필터 초기화
                  </Button>
                  <Button size="sm" onClick={onGoCompose} className="bg-[#084734] hover:bg-[#084734]/90">
                    <Send className="mr-1.5 h-4 w-4" />
                    발송 만들기
                  </Button>
                  <Button variant="outline" size="sm" onClick={onGoSubscribers}>
                    구독자 보기
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#e8e8e4]">
              <CampaignHistory
                campaigns={filteredCampaigns}
                onDuplicate={onDuplicateCampaign}
                onCopy={onCopyCampaign}
                onCreateCampaign={onGoCompose}
                onViewSubscribers={onGoSubscribers}
              />
            </div>
          )}
        </Panel>

        <Panel title="문자·카카오 발송 로그">
          <MessageLogTable />
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel title="상태 요약">
          {recentCampaigns.length === 0 ? (
            <EmptyInline message="최근 캠페인 정보가 없습니다." />
          ) : (
            <div className="space-y-3">
              {recentCampaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[#111110]">{campaign.subject}</p>
                      <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
                        {formatDateTime(campaign.sentAt ?? campaign.createdAt)} · 대상 {campaign.recipientCount}명
                      </p>
                    </div>
                    <MiniBadge
                      tone={
                        campaign.status === "sent"
                          ? "success"
                          : campaign.status === "failed"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {campaign.status === "sent" ? "발송됨" : campaign.status === "failed" ? "실패" : "초안"}
                    </MiniBadge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                      {campaign.targetTags.length > 0 ? (
                        campaign.targetTags.map((tag) => (
                          <MiniBadge key={tag}>#{tag}</MiniBadge>
                        ))
                      ) : (
                        <MiniBadge>전체 발송</MiniBadge>
                      )}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => onDuplicateCampaign(campaign)}>
                      복제해서 작성
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="추천 다음 액션">
          <div className="space-y-2">
            {recentDraftCampaigns.length > 0 && (
              <button
                onClick={onGoCompose}
                className="w-full rounded-xl border border-amber-100 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100/60"
              >
                <p className="text-[12px] font-semibold text-amber-700">
                  미완성 초안 {recentDraftCampaigns.length}개
                </p>
              </button>
            )}
            {recentFailedCampaigns.length > 0 && (
              <button
                onClick={() => onCampaignStatusFilterChange("failed")}
                className="w-full rounded-xl border border-red-100 bg-red-50 p-3 text-left transition-colors hover:bg-red-100/60"
              >
                <p className="text-[12px] font-semibold text-red-700">
                  실패 캠페인 {recentFailedCampaigns.length}개 점검 필요
                </p>
              </button>
            )}
            {recentSuccessRate !== null && recentSuccessRate > 0 && recentSuccessRate < 80 && (
              <button
                onClick={onGoSubscribers}
                className="w-full rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3 text-left transition-colors hover:bg-[#f0f0ec]"
              >
                <p className="text-[12px] font-semibold text-[#111110]">
                  최근 성공률 {recentSuccessRate}% — 구독자 점검
                </p>
              </button>
            )}
            {latestCampaign && (
              <button
                onClick={() => onDuplicateCampaign(latestCampaign)}
                className="w-full rounded-xl border border-[#084734]/15 bg-[#ECFDF5] p-3 text-left transition-colors hover:bg-[#D1FAE5]"
              >
                <p className="truncate text-[12px] font-semibold text-[#084734]">
                  최근 캠페인 복제 · &ldquo;{latestCampaign.subject}&rdquo;
                </p>
              </button>
            )}
            {recentDraftCampaigns.length === 0 && recentFailedCampaigns.length === 0 && !latestCampaign && (
              <EmptyInline message="발송 이력이 쌓이면 제안이 나타납니다." />
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
