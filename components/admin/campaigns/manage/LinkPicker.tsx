"use client"

// components/admin/campaigns/manage/LinkPicker.tsx
// 링크 피커(D1-6) — 열릴 때 /link-candidates 를 조회해 채널별(email/sms/event/meta) 실행 후보를 보여준다.
// 후보 라우트는 "아직 안 붙은 것"만 거르지 않고 전체를 반환하므로(실행-캠페인 다대다 허용),
// 이 캠페인에 이미 링크된 (refType, refId) 는 existingLinks 로 판정해 비활성 + "연결됨" 표기한다.
// 후보 클릭 → POST /[id]/links → 토스트 + onLinked()(상세 리페치). Meta 미구성이면 그룹만 빈 안내.
// best-effort: 후보 라우트는 소스별로 [] 강등되므로 한 채널이 비어도 나머지는 정상 노출.
// DESIGN.md 팔레트만 사용.

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, Loader2, Plus, RefreshCw } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { useToast } from "@/components/ui/toast"
import {
  CAMPAIGN_REF_TYPES,
  CAMPAIGN_REF_TYPE_LABEL,
  type CampaignLink,
  type CampaignRefType,
} from "@/lib/types/marketing-campaign"

type Candidate = { id: string; label: string }

interface CandidatesResponse {
  emailCampaigns: Candidate[]
  smsCampaigns: Candidate[]
  events: Candidate[]
  metaCampaigns: Candidate[]
}

// refType → /link-candidates 응답의 채널 키(SSOT 매핑).
const GROUP_KEY: Record<CampaignRefType, keyof CandidatesResponse> = {
  email_campaign: "emailCampaigns",
  sms_campaign: "smsCampaigns",
  event: "events",
  meta_campaign: "metaCampaigns",
}

interface LinkPickerProps {
  campaignId: string
  existingLinks: CampaignLink[] // 이미 링크된 것 비활성 판정용
  onLinked: () => void | Promise<void> // 추가 성공 → 상세 리페치(+부모 리스트)
  onClose: () => void
}

export function LinkPicker({ campaignId, existingLinks, onLinked, onClose }: LinkPickerProps) {
  const toast = useToast()
  const [candidates, setCandidates] = useState<CandidatesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null) // `${refType}:${refId}`

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminFetchJson<CandidatesResponse>(
        "/api/admin/marketing-campaigns/link-candidates",
      )
      setCandidates(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "링크 후보를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 이 캠페인에 이미 링크된 (refType, refId) 집합.
  const linkedSet = new Set(existingLinks.map((l) => `${l.refType}:${l.refId}`))

  async function handleAdd(refType: CampaignRefType, refId: string) {
    const key = `${refType}:${refId}`
    setPending(key)
    try {
      await adminFetchJson(`/api/admin/marketing-campaigns/${campaignId}/links`, {
        method: "POST",
        body: JSON.stringify({ refType, refId }),
      })
      toast.success("링크를 추가했습니다.")
      await onLinked() // 상세 리페치 → existingLinks 갱신 → 이 후보가 '연결됨'으로 전환
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "링크 추가에 실패했습니다.")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[12px] font-bold text-[#111110]">링크 추가</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 py-1 text-[11px] font-medium text-[#615D59] transition hover:bg-[#F6F5F4] disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-[#615D59] transition hover:text-[#111110]"
          >
            닫기
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-1.5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-[#f0f0ec]" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B43E3E]" />
            <div className="min-w-0">
              <p className="break-words text-[12px] text-[#B43E3E]">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 inline-flex items-center gap-1 rounded-md border border-[#F2B8B8] bg-white px-2 py-1 text-[11px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9]"
              >
                <RefreshCw className="h-3 w-3" />
                다시 시도
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {CAMPAIGN_REF_TYPES.map((refType) => {
            const list = candidates ? candidates[GROUP_KEY[refType]] : []
            const label = CAMPAIGN_REF_TYPE_LABEL[refType]
            return (
              <div key={refType}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#615D59]">
                  {label}
                </p>
                {list.length === 0 ? (
                  <p className="text-[11px] text-[#A39E98]">연결 가능한 {label} 없음</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {list.map((cand) => {
                      const key = `${refType}:${cand.id}`
                      const already = linkedSet.has(key)
                      const isPending = pending === key
                      return (
                        <button
                          key={cand.id}
                          type="button"
                          onClick={() => void handleAdd(refType, cand.id)}
                          disabled={already || pending !== null}
                          title={cand.label}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition disabled:cursor-not-allowed ${
                            already
                              ? "border-[rgba(0,0,0,0.08)] bg-[#fafaf8] text-[#A39E98]"
                              : "border-[rgba(0,0,0,0.08)] bg-white text-[#111110] hover:border-[#BDEFD8] hover:bg-[#ECFDF5] disabled:opacity-60"
                          }`}
                        >
                          <span className="truncate">{cand.label}</span>
                          {already ? (
                            <span className="shrink-0 rounded-full bg-[#F6F5F4] px-1.5 py-0.5 text-[10px] font-medium text-[#A39E98]">
                              연결됨
                            </span>
                          ) : isPending ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#615D59]" />
                          ) : (
                            <Plus className="h-3.5 w-3.5 shrink-0 text-[#084734]" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
