"use client"

// components/admin/campaigns/manage/SyncResultBanners.tsx
// 캠페인 탭의 동기화 결과 배너 두 가지 — Meta 동기화 · Google·네이버 링크.
// 무엇이 생기고 바뀌었는지(또는 왜 안 붙었는지)를 이름 단위로 남긴다(닫기 전까지 유지).
// 캠페인·프로젝트 통합(2026-10) 때 CampaignManageClient 에서 내용 변경 없이 분리했다.
// DESIGN.md 팔레트만 사용.

import { useMemo } from "react"
import { X } from "lucide-react"

// POST /api/admin/marketing-campaigns/meta-sync 응답 — 결과 배너가 그대로 보여준다.
export interface MetaSyncResult {
  created: Array<{ campaignId: string; metaId: string; name: string }>
  updated: Array<{ campaignId: string; name: string; changes: string[] }>
  failed: Array<{ name: string; error: string }>
  unchangedMirrorCount: number
  crossChannelLinkedCount: number
  unresolvedMirrorCount: number
  skipped: Array<{ metaId: string; name: string; reason: string }>
}

// POST /api/admin/marketing-campaigns/ad-sync 응답 — Google·네이버 캠페인을 동명 우산에 붙인다.
// meta-sync 와 달리 우산을 만들지 않는다(붙일 데가 없으면 skipped 로 보고). 그래서 배너에서
// 정작 읽을 값은 linked 가 아니라 **skipped 의 이유**다 — 사람이 뭘 해야 하는지가 거기 있다.
export interface AdSyncResult {
  linked: Array<{ channel: string; label: string; umbrellaName: string }>
  failed: Array<{ label: string; umbrellaName: string; error: string }>
  alreadyLinked: Array<{ label: string }>
  skipped: Array<{ label: string; reason: string; detail: string }>
  candidateCount: number
  sources: Array<{ channel: string; ok: boolean; rowCount: number; error: string | null }>
  lookbackDays: number
}

// 스냅샷을 못 읽은 채널을 배너에 이름으로 적는다 — "0건"과 "못 읽었다"는 다른 사실이다.
export const AD_SYNC_CHANNEL_LABEL: Record<string, string> = {
  google: "Google",
  naver: "네이버",
}

// 변경 필드 → 사람이 읽는 라벨(결과 배너의 갱신 행).
const SYNC_CHANGE_LABEL: Record<string, string> = {
  name: "이름",
  status: "상태",
  startsAt: "시작일",
  endsAt: "종료일",
}

export function MetaSyncBanner({ result, onClose }: { result: MetaSyncResult; onClose: () => void }) {
  return (
    <div
      className={`mb-4 rounded-2xl border px-4 py-3.5 ${
        result.failed.length > 0 ? "border-[#ECD29C] bg-[#FBF1E0]" : "border-[#BDEFD8] bg-[#ECFDF5]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-[12px] leading-relaxed">
          <p className={`font-bold ${result.failed.length > 0 ? "text-[#A8741A]" : "text-[#084734]"}`}>
            Meta 동기화 — 가져옴 {result.created.length} · 갱신 {result.updated.length}
            {result.unchangedMirrorCount > 0 ? ` · 변화 없음 ${result.unchangedMirrorCount}` : ""}
            {result.failed.length > 0 ? ` · 실패 ${result.failed.length}` : ""}
          </p>
          {result.created.length > 0 && (
            <p className="mt-1 text-[#084734]/80">
              새 캠페인: {result.created.slice(0, 5).map((c) => c.name).join(", ")}
              {result.created.length > 5 ? ` 외 ${result.created.length - 5}건` : ""}
            </p>
          )}
          {result.updated.length > 0 && (
            <p className="mt-0.5 text-[#084734]/80">
              갱신:{" "}
              {result.updated
                .slice(0, 5)
                .map((u) => `${u.name} (${u.changes.map((ch) => SYNC_CHANGE_LABEL[ch] ?? ch).join("·")})`)
                .join(", ")}
              {result.updated.length > 5 ? ` 외 ${result.updated.length - 5}건` : ""}
            </p>
          )}
          {result.failed.length > 0 && (
            <p className="mt-0.5 text-[#A8741A]">
              실패: {result.failed.map((f) => f.name).join(", ")} — {result.failed[0].error}
            </p>
          )}
          {(result.crossChannelLinkedCount > 0 ||
            result.skipped.length > 0 ||
            result.unresolvedMirrorCount > 0) && (
            <p className="mt-0.5 text-[11px] text-[#615D59]">
              {[
                result.crossChannelLinkedCount > 0
                  ? `크로스채널 연결 ${result.crossChannelLinkedCount}건은 손대지 않음`
                  : null,
                result.skipped.length > 0 ? `보관된 Meta 캠페인 ${result.skipped.length}건 제외` : null,
                result.unresolvedMirrorCount > 0
                  ? `조회 범위 밖 미러 ${result.unresolvedMirrorCount}건 유지`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="동기화 결과 닫기"
          className="shrink-0 rounded-md p-1 text-[#615D59] transition hover:text-[#111110]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/** Google·네이버 링크 결과 — 붙은 것보다 **안 붙은 이유**가 이 배너의 본문이다. */
export function AdSyncBanner({ result, onClose }: { result: AdSyncResult; onClose: () => void }) {
  // 건너뛴 후보를 **이유 문장으로** 묶는다. 같은 이유(예: "이름이 같은 우산이 없다")는 문장이
  // 글자 그대로 같아서 한 줄로 접히고, 우산 이름이 박힌 문장은 따로 남는다 — 이유 코드를
  // 다시 라벨로 번역하지 않고도 목록이 짧아진다(번역표를 두면 서버 문장과 둘로 갈린다).
  const skipGroups = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const item of result.skipped) {
      const labels = groups.get(item.detail)
      if (labels) labels.push(item.label)
      else groups.set(item.detail, [item.label])
    }
    return [...groups].sort((a, b) => b[1].length - a[1].length)
  }, [result])

  const unreadable = result.sources.filter((source) => !source.ok)
  const warn = result.failed.length > 0 || unreadable.length > 0

  return (
    <div
      className={`mb-4 rounded-2xl border px-4 py-3.5 ${
        warn ? "border-[#ECD29C] bg-[#FBF1E0]" : "border-[#BDEFD8] bg-[#ECFDF5]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-[12px] leading-relaxed">
          <p className={`font-bold ${warn ? "text-[#A8741A]" : "text-[#084734]"}`}>
            Google·네이버 링크 — 연결 {result.linked.length}
            {result.alreadyLinked.length > 0 ? ` · 이미 연결됨 ${result.alreadyLinked.length}` : ""}
            {result.skipped.length > 0 ? ` · 건너뜀 ${result.skipped.length}` : ""}
            {result.failed.length > 0 ? ` · 실패 ${result.failed.length}` : ""}
          </p>
          {result.linked.length > 0 && (
            <p className="mt-1 text-[#084734]/80">
              {result.linked
                .slice(0, 5)
                .map((item) => `${item.label} → ${item.umbrellaName}`)
                .join(", ")}
              {result.linked.length > 5 ? ` 외 ${result.linked.length - 5}건` : ""}
            </p>
          )}
          {/* 못 읽은 채널은 0 건이 아니라 미측정이다 — 이름을 적어 둔다. */}
          {unreadable.map((source) => (
            <p key={source.channel} className="mt-0.5 break-words text-[#A8741A]">
              {AD_SYNC_CHANNEL_LABEL[source.channel] ?? source.channel} 스냅샷을 읽지 못했습니다 —{" "}
              {source.error ?? "원인 불명"}
            </p>
          ))}
          {result.failed.length > 0 && (
            <p className="mt-0.5 break-words text-[#A8741A]">
              실패: {result.failed.map((f) => f.label).join(", ")} — {result.failed[0].error}
            </p>
          )}
          {skipGroups.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[11px] text-[#615D59]">
              {skipGroups.slice(0, 4).map(([detail, labels]) => (
                <li key={detail}>
                  <span className="font-medium text-[#111110]">
                    {labels.slice(0, 3).join(", ")}
                    {labels.length > 3 ? ` 외 ${labels.length - 3}건` : ""}
                  </span>{" "}
                  — {detail}
                </li>
              ))}
              {skipGroups.length > 4 && (
                <li className="text-[#A39E98]">다른 이유 {skipGroups.length - 4}가지 더 있습니다.</li>
              )}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-[#A39E98]">
            최근 {result.lookbackDays}일 스냅샷에서 후보 {result.candidateCount}건을 검토했습니다. 캠페인을
            새로 만들지는 않습니다 — 붙일 우산이 없으면 건너뜁니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="광고 링크 결과 닫기"
          className="shrink-0 rounded-md p-1 text-[#615D59] transition hover:text-[#111110]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
