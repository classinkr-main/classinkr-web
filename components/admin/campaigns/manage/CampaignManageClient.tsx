"use client"

// components/admin/campaigns/manage/CampaignManageClient.tsx
// 캠페인 관리(D1-5) — 리스트 + 생성/편집 드로어. 상세/롤업/링크 피커는 D1-6.
// 마운트 시 adminFetchJson 으로 목록 조회. 마이그레이션 미적용이면 API 가 500 →
// 크래시/화이트스크린 없이 에러 카드 + 재시도로 그레이스풀 강등(필수).
// DESIGN.md 팔레트만 사용.

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowLeft, Plus, RefreshCw } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { useToast } from "@/components/ui/toast"
import type { CampaignWithLinks } from "@/lib/types/marketing-campaign"

import { CampaignManageEmpty, CampaignRow } from "./CampaignRow"
import { CampaignFormDrawer } from "./CampaignFormDrawer"

type DrawerState =
  | { mode: "create" }
  | { mode: "edit"; campaign: CampaignWithLinks }
  | null

export default function CampaignManageClient() {
  const toast = useToast()
  const [campaigns, setCampaigns] = useState<CampaignWithLinks[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<DrawerState>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminFetchJson<{ campaigns: CampaignWithLinks[] }>(
        "/api/admin/marketing-campaigns",
      )
      setCampaigns(data.campaigns ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "캠페인 목록을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSuccess = useCallback(
    async (message: string) => {
      setDrawer(null)
      await load()
      toast.success(message)
    },
    [load, toast],
  )

  return (
    <div className="pb-24">
      {/* 헤더 — 캠페인 허브와 동일한 TopBar 패턴 */}
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 pb-5 pt-6 sm:px-6 lg:px-9 lg:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#615D59]">
              <span>ADMIN</span>
              <span className="opacity-50">›</span>
              <span>그로스</span>
              <span className="opacity-50">›</span>
              <span>캠페인</span>
              <span className="opacity-50">›</span>
              <span className="text-[#111110]">관리</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#111110] sm:text-[30px]">
              캠페인 관리
            </h1>
            <p className="mt-1.5 text-[13px] text-[#615D59]">
              채널별 실행(이메일·문자·행사·Meta)을 묶는 크로스채널 캠페인을 만들고 관리합니다.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </button>
            <button
              type="button"
              onClick={() => setDrawer({ mode: "create" })}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
            >
              <Plus className="h-3.5 w-3.5" />
              새 캠페인
            </button>
          </div>
        </div>

        <div className="mt-4">
          <Link
            href="/admin/campaigns"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#615D59] transition-colors hover:text-[#111110]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            캠페인 허브로
          </Link>
        </div>
      </header>

      {/* 본문 */}
      <div className="px-4 pt-6 sm:px-6 lg:px-9">
        {loading ? (
          <div className="space-y-2.5" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[104px] animate-pulse rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#f0f0ec]" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[#F2B8B8] bg-[#FCE9E9] px-5 py-6">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B43E3E]" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#8F2C2C]">캠페인 목록을 불러오지 못했습니다</p>
                <p className="mt-1 break-words text-[12px] text-[#B43E3E]">{error}</p>
                <p className="mt-1.5 text-[11px] text-[#B43E3E]/80">
                  마이그레이션(marketing_campaigns)이 아직 적용되지 않았을 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#F2B8B8] bg-white px-3 py-1.5 text-[12px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  다시 시도
                </button>
              </div>
            </div>
          </div>
        ) : campaigns.length === 0 ? (
          <CampaignManageEmpty onCreate={() => setDrawer({ mode: "create" })} />
        ) : (
          <div className="space-y-2.5">
            <p className="text-[12px] text-[#615D59]">
              캠페인 <span className="font-semibold tabular-nums text-[#111110]">{campaigns.length}</span>개
            </p>
            {campaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                onOpen={() => setDrawer({ mode: "edit", campaign })}
              />
            ))}
          </div>
        )}
      </div>

      {/* 드로어 */}
      {drawer && (
        <CampaignFormDrawer
          initial={drawer.mode === "edit" ? drawer.campaign : null}
          onClose={() => setDrawer(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}
