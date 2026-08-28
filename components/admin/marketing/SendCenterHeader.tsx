"use client"

/**
 * SendCenterHeader — 단체 발송 센터 상단 스탯 헤더
 *
 * 시안 2a의 다크 헤더를 저장소 팔레트로 재해석: 넓은 면은 밝은 뉴트럴(흰 배경 +
 * rgba 보더), 그린(#084734)은 액센트 숫자·CTA에만 쓴다. 기존 5 StatCard 그리드와
 * "운영 요약" 패널을 이 헤더 하나로 대체·압축한다.
 *
 * 정직 원칙:
 * - 예상 비용은 현재 열려 있는 대량 채널(이메일)만 합산 → 항상 0원. 알림톡·문자
 *   단가는 "대량 발송 오픈 시 적용" 각주로만 언급하고 합계에 얹지 않는다.
 * - solapi 잔액은 status API 실값. 미확인이면 "확인 불가"로 그대로 표기.
 * - 우측 CTA는 compose 컨텍스트에서만: 발송 자체는 우측 레일(확인 모달 포함)이
 *   소유하므로 여기서는 해당 위치로 스크롤만 시킨다(발송 로직 중복 금지).
 */

import { ArrowRight, Database, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { MessagingStatus } from "@/lib/messaging-client-types"
import { KRW_FORMAT } from "@/lib/marketing-send-costs"

interface SendCenterHeaderProps {
  /** compose 서브탭 여부 — true면 풀 스탯 + CTA, 아니면 슬림 모드 */
  composeActive: boolean
  totalSubscribers: number
  activeCount: number
  unsubscribedCount: number
  /** 활성 구독자 중 이메일 보유 수 */
  emailReach: number
  /** 활성 구독자 중 휴대폰 번호 보유 수 */
  phoneReach: number
  /** 현재 초안 기준 발송 대상 수 (태그 필터 반영) */
  selectedAudience: number
  messagingStatus: MessagingStatus | null
  messagingStatusLoaded: boolean
  lastSyncedAt: Date | null
  refreshing: boolean
  onRefresh: () => void
  onGoCompose: () => void
  onScrollToSend: () => void
  onScrollToTest: () => void
}

function formatSyncTime(value: Date | null) {
  if (!value) return "동기화 대기"
  return `동기화 ${new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(value)}`
}

function Stat({
  label,
  value,
  unit,
  hint,
  accent = false,
}: {
  label: string
  value: string
  unit?: string
  hint?: string
  accent?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#1a1a1a]/40">{label}</p>
      <p className={`mt-0.5 truncate text-[19px] font-bold tabular-nums tracking-[-0.02em] ${accent ? "text-[#084734]" : "text-[#111110]"}`}>
        {value}
        {unit && <span className="ml-0.5 text-[11px] font-semibold text-[#1a1a1a]/40">{unit}</span>}
      </p>
      {hint && <p className="mt-0.5 truncate text-[10.5px] text-[#1a1a1a]/40">{hint}</p>}
    </div>
  )
}

export default function SendCenterHeader({
  composeActive,
  totalSubscribers,
  activeCount,
  unsubscribedCount,
  emailReach,
  phoneReach,
  selectedAudience,
  messagingStatus,
  messagingStatusLoaded,
  lastSyncedAt,
  refreshing,
  onRefresh,
  onGoCompose,
  onScrollToSend,
  onScrollToTest,
}: SendCenterHeaderProps) {
  const point = messagingStatus?.balance?.point
  const balanceValue = !messagingStatusLoaded
    ? "확인 중"
    : point == null
      ? "확인 불가"
      : `${KRW_FORMAT.format(point)}P`

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white shadow-[0_1px_0_rgba(17,17,16,0.02)]">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-6">
        {/* 타이틀 */}
        <div className="shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">
            캠페인 · 메시지
          </p>
          <h2 className="mt-0.5 text-[17px] font-bold tracking-[-0.01em] text-[#111110]">단체 발송 센터</h2>
        </div>

        {/* 스탯 — lg에서는 좌측 보더로 구분, 미만은 그리드 스택 */}
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 border-[#e8e8e4] sm:grid-cols-4 lg:border-l lg:pl-6">
          <Stat label="대상" value={String(activeCount)} unit="명" hint={`전체 ${totalSubscribers} · 수신거부 ${unsubscribedCount} 제외`} />
          <Stat label="도달 채널" value={`${emailReach} · ${phoneReach}`} hint="이메일 · 휴대폰 보유" />
          {composeActive ? (
            <Stat
              label="예상 비용"
              value="0원"
              accent
              hint={`이메일 ${selectedAudience}명 기준 · 예상`}
            />
          ) : (
            <Stat label="발송 채널" value="이메일" hint="알림톡 테스트 · 문자 보류" />
          )}
          <Stat label="solapi 잔액" value={balanceValue} hint={messagingStatus?.balance ? `충전금 ${KRW_FORMAT.format(messagingStatus.balance.balance)}원` : "발송 상태 API 기준"} />
        </div>

        {/* CTA — compose에서만. 실제 발송·테스트는 우측 레일이 소유(스크롤 이동만). */}
        <div className="flex shrink-0 items-center gap-2">
          {composeActive ? (
            <>
              <Button variant="outline" size="sm" onClick={onScrollToTest} className="text-[12px]">
                테스트 발송
              </Button>
              <Button
                size="sm"
                onClick={onScrollToSend}
                className="bg-[#084734] text-[12px] text-white hover:bg-[#065c41]"
              >
                {selectedAudience}명에게 발송
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={onGoCompose} className="bg-[#084734] text-[12px] text-white hover:bg-[#065c41]">
              발송 작성
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* DB 스트립 — 시안 1a의 "구독자 DB 연동됨" 행. 실데이터(Supabase subscribers) 기준. */}
      <div className="flex flex-col gap-2 border-t border-[#e8e8e4] bg-[#fafaf8] px-4 py-2.5 sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 font-semibold text-[#111110]"
            title="Supabase subscribers 테이블 연동됨"
          >
            <Database className="h-3.5 w-3.5 text-[#084734]" />
            구독자 {totalSubscribers}명
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-[#084734]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#084734]" />
            {formatSyncTime(lastSyncedAt)}
          </span>
          {messagingStatusLoaded && messagingStatus && !messagingStatus.configured && (
            <span className="rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[10.5px] font-medium text-[#7A520F]">
              발송 자격증명(solapi) 미완성 — Settings → 외부 연동 확인
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/55 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] sm:self-auto"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          지금 동기화
        </button>
      </div>
    </section>
  )
}
