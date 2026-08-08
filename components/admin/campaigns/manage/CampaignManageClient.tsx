"use client"

// components/admin/campaigns/manage/CampaignManageClient.tsx
// 캠페인 관리 — 리스트 + 생성 드로어(D1-5). 행 클릭 → 상세 패널(D1-6, 롤업 + 링크 피커).
// 편집은 상세 패널이 CampaignFormDrawer 를 재사용하므로 여기선 "새 캠페인"(생성)만 드로어로 연다.
// 마운트 시 adminFetchJson 으로 목록 조회. 마이그레이션 미적용이면 API 가 500 →
// 크래시/화이트스크린 없이 에러 카드 + 재시도로 그레이스풀 강등(필수).
// DESIGN.md 팔레트만 사용.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Activity, AlertCircle, ArrowLeft, Plus, RefreshCw, X } from "lucide-react"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { useToast } from "@/components/ui/toast"
import {
  CAMPAIGN_STATUS_LABEL,
  type CampaignStatus,
  type CampaignWithLinks,
} from "@/lib/types/marketing-campaign"

import { CampaignManageEmpty, CampaignRow } from "./CampaignRow"
import { CampaignFormDrawer } from "./CampaignFormDrawer"
import CampaignDetailPanel from "./CampaignDetailPanel"

// 목록 상단 상태 요약의 표시 순서 — 라이브 먼저(진행 → 계획 → 일시중지 → 완료).
const STATUS_SUMMARY_ORDER: CampaignStatus[] = ["active", "planned", "paused", "done"]

// POST /api/admin/marketing-campaigns/meta-sync 응답 — 결과 배너가 그대로 보여준다.
interface MetaSyncResult {
  created: Array<{ campaignId: string; metaId: string; name: string }>
  updated: Array<{ campaignId: string; name: string; changes: string[] }>
  failed: Array<{ name: string; error: string }>
  unchangedMirrorCount: number
  crossChannelLinkedCount: number
  unresolvedMirrorCount: number
  skipped: Array<{ metaId: string; name: string; reason: string }>
}

// 변경 필드 → 사람이 읽는 라벨(결과 배너의 갱신 행).
const SYNC_CHANGE_LABEL: Record<string, string> = {
  name: "이름",
  status: "상태",
  startsAt: "시작일",
  endsAt: "종료일",
}

export default function CampaignManageClient() {
  const toast = useToast()
  const [campaigns, setCampaigns] = useState<CampaignWithLinks[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // "새 캠페인"(생성) 드로어만 여기서 연다 — 편집은 상세 패널이 CampaignFormDrawer 를 재사용한다.
  const [creating, setCreating] = useState(false)
  // 상태 필터 — 18건+ 목록에서 "진행만" 추리는 용도. 요약 카운트 칩이 토글이다.
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all")
  // 상세 패널이 여는 캠페인(리스트 요약). null = 닫힘. onClose 는 memoized(상세의 load deps 안정).
  const [detail, setDetail] = useState<CampaignWithLinks | null>(null)
  const closeDetail = useCallback(() => setDetail(null), [])
  // Meta 동기화 — 실행 중 여부 + 마지막 결과 배너(닫기 전까지 유지).
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<MetaSyncResult | null>(null)
  // setState 는 비동기라 연타를 못 막는다 — 동기 ref 로 실행 중 잠금(중복 가져오기 방지).
  const syncingRef = useRef(false)

  // 목록 라우트는 롤업 포함이라 서버가 Meta Graph 를 부른다 — 30초 캐시로 마운트·재방문
  // 재조회를 흡수하고, 생성·수정·동기화 직후에만 force 로 우회한다.
  const load = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminFetchJsonCached<{ campaigns: CampaignWithLinks[] }>(
        "/api/admin/marketing-campaigns",
        undefined,
        { ttlMs: 30_000, force, staleIfError: !force },
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

  // 상태 분포 — "지금 진행 중인 게 몇 개인지"를 목록 위에서 먼저 읽게 한다(행의 상태 레일과 같은 축).
  // 표시 순서는 생명주기(CAMPAIGN_STATUSES)가 아니라 "라이브 먼저" — 이 줄의 용도가 그것이다.
  const statusCounts = useMemo(() => {
    const acc: Record<CampaignStatus, number> = { planned: 0, active: 0, paused: 0, done: 0 }
    for (const c of campaigns) acc[c.status] += 1
    return acc
  }, [campaigns])

  const visibleCampaigns = useMemo(
    () => (statusFilter === "all" ? campaigns : campaigns.filter((c) => c.status === statusFilter)),
    [campaigns, statusFilter],
  )

  const handleSuccess = useCallback(
    async (message: string) => {
      setCreating(false)
      await load({ force: true })
      toast.success(message)
    },
    [load, toast],
  )

  // 상세 패널(링크 추가·해제 등)이 부르는 목록 갱신 — 변경 직후이므로 캐시 우회.
  const reloadAfterChange = useCallback(() => load({ force: true }), [load])

  // Meta 동기화 — 미링크 Meta 캠페인을 미러로 가져오고, 미러의 이름·상태·기간을 Meta 에 맞춘다.
  // 서버가 플랜·적용을 모두 담당하므로 여기서는 1콜 + 결과 배너 + 목록 리로드만 한다.
  const handleMetaSync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const result = await adminFetchJson<MetaSyncResult>(
        "/api/admin/marketing-campaigns/meta-sync",
        { method: "POST" },
      )
      setSyncResult(result)
      const changedCount = result.created.length + result.updated.length
      if (result.failed.length > 0) {
        toast.error(`Meta 동기화 부분 실패 — 성공 ${changedCount}건 · 실패 ${result.failed.length}건`)
      } else if (changedCount > 0) {
        toast.success(`Meta 동기화 완료 — 가져옴 ${result.created.length} · 갱신 ${result.updated.length}`)
      } else {
        toast.success("Meta 동기화 완료 — 변경 사항 없음")
      }
      await load({ force: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Meta 동기화에 실패했습니다.")
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [load, toast])

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
              onClick={() => void handleMetaSync()}
              disabled={syncing || loading}
              title="미링크 Meta 캠페인을 가져오고, Meta와 1:1로 연결된 캠페인의 이름·상태·기간을 Meta 기준으로 맞춥니다."
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <Activity className={`h-3.5 w-3.5 ${syncing ? "animate-pulse" : ""}`} />
              {syncing ? "동기화 중…" : "Meta 동기화"}
            </button>
            <button
              type="button"
              onClick={() => void load({ force: true })}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
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
        {/* Meta 동기화 결과 배너 — 무엇이 생기고 바뀌었는지 이름 단위로 남긴다(닫기 전까지 유지). */}
        {syncResult && (
          <div
            className={`mb-4 rounded-2xl border px-4 py-3.5 ${
              syncResult.failed.length > 0
                ? "border-[#ECD29C] bg-[#FBF1E0]"
                : "border-[#BDEFD8] bg-[#ECFDF5]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-[12px] leading-relaxed">
                <p
                  className={`font-bold ${
                    syncResult.failed.length > 0 ? "text-[#A8741A]" : "text-[#084734]"
                  }`}
                >
                  Meta 동기화 — 가져옴 {syncResult.created.length} · 갱신 {syncResult.updated.length}
                  {syncResult.unchangedMirrorCount > 0 ? ` · 변화 없음 ${syncResult.unchangedMirrorCount}` : ""}
                  {syncResult.failed.length > 0 ? ` · 실패 ${syncResult.failed.length}` : ""}
                </p>
                {syncResult.created.length > 0 && (
                  <p className="mt-1 text-[#084734]/80">
                    새 캠페인: {syncResult.created.slice(0, 5).map((c) => c.name).join(", ")}
                    {syncResult.created.length > 5 ? ` 외 ${syncResult.created.length - 5}건` : ""}
                  </p>
                )}
                {syncResult.updated.length > 0 && (
                  <p className="mt-0.5 text-[#084734]/80">
                    갱신:{" "}
                    {syncResult.updated
                      .slice(0, 5)
                      .map(
                        (u) =>
                          `${u.name} (${u.changes.map((ch) => SYNC_CHANGE_LABEL[ch] ?? ch).join("·")})`,
                      )
                      .join(", ")}
                    {syncResult.updated.length > 5 ? ` 외 ${syncResult.updated.length - 5}건` : ""}
                  </p>
                )}
                {syncResult.failed.length > 0 && (
                  <p className="mt-0.5 text-[#A8741A]">
                    실패: {syncResult.failed.map((f) => f.name).join(", ")} — {syncResult.failed[0].error}
                  </p>
                )}
                {(syncResult.crossChannelLinkedCount > 0 ||
                  syncResult.skipped.length > 0 ||
                  syncResult.unresolvedMirrorCount > 0) && (
                  <p className="mt-0.5 text-[11px] text-[#615D59]">
                    {[
                      syncResult.crossChannelLinkedCount > 0
                        ? `크로스채널 연결 ${syncResult.crossChannelLinkedCount}건은 손대지 않음`
                        : null,
                      syncResult.skipped.length > 0
                        ? `보관된 Meta 캠페인 ${syncResult.skipped.length}건 제외`
                        : null,
                      syncResult.unresolvedMirrorCount > 0
                        ? `조회 범위 밖 미러 ${syncResult.unresolvedMirrorCount}건 유지`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSyncResult(null)}
                aria-label="동기화 결과 닫기"
                className="shrink-0 rounded-md p-1 text-[#615D59] transition hover:text-[#111110]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-1.5" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[78px] animate-pulse rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#f0f0ec]" />
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
          <CampaignManageEmpty onCreate={() => setCreating(true)} />
        ) : (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-0.5">
              <p className="text-[12px] text-[#615D59]">
                캠페인 <span className="font-semibold tabular-nums text-[#111110]">{campaigns.length}</span>개
                {statusFilter !== "all" && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => setStatusFilter("all")}
                      className="font-medium text-[#084734] hover:underline"
                    >
                      필터 해제
                    </button>
                  </>
                )}
              </p>
              {/* 상태 카운트 = 필터 칩 — 숫자를 읽는 자리에서 바로 그 집합으로 좁힌다. */}
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="상태 필터">
                {STATUS_SUMMARY_ORDER.filter((s) => statusCounts[s] > 0).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter((prev) => (prev === s ? "all" : s))}
                    aria-pressed={statusFilter === s}
                    className={`inline-flex items-baseline gap-1 rounded-full border px-2 py-0.5 text-[11px] transition ${
                      statusFilter === s
                        ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                        : "border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:border-[#c8c8c4]"
                    }`}
                  >
                    {CAMPAIGN_STATUS_LABEL[s]}
                    <b
                      className={`font-semibold tabular-nums ${
                        s === "active" || statusFilter === s ? "text-[#084734]" : "text-[#111110]"
                      }`}
                    >
                      {statusCounts[s]}
                    </b>
                  </button>
                ))}
              </div>
            </div>
            {visibleCampaigns.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] py-8 text-center text-[12.5px] text-[#A39E98]">
                이 상태의 캠페인이 없습니다.
              </p>
            ) : (
              visibleCampaigns.map((campaign) => (
                <CampaignRow
                  key={campaign.id}
                  campaign={campaign}
                  onOpen={() => setDetail(campaign)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* 생성 드로어 — "새 캠페인" 전용(편집은 상세 패널이 담당). */}
      {creating && (
        <CampaignFormDrawer
          initial={null}
          onClose={() => setCreating(false)}
          onSuccess={handleSuccess}
        />
      )}

      {/* 상세 패널 — 행 클릭 시. 롤업 + 연결된 실행 + 링크 피커 + 편집(폼 드로어 재사용). */}
      {detail && (
        <CampaignDetailPanel campaign={detail} onClose={closeDetail} onListChanged={reloadAfterChange} />
      )}
    </div>
  )
}
