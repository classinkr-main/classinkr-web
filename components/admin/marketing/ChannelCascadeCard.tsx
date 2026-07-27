"use client"

/**
 * ChannelCascadeCard — 단체 발송 센터 "채널 · 발송 상태" 카드 (정직 게이팅)
 *
 * 시안 2a의 캐스케이드 레이아웃을 따르되, 백엔드 현실을 그대로 서술한다:
 * - 이메일: 대량 발송 작동 → "대량 발송 가능" (병행 발송 문구, 폴백 캐스케이드 아님)
 * - 카카오 알림톡: 승인 템플릿은 있으나 대량 발송 백엔드 미구현 → 행은 그리되
 *   "테스트 발송만 가능" 뱃지 + 대량 토글 비활성(이유 표기)
 * - 문자 SMS/LMS: 운영 보류 → dashed 행 + "보류" 뱃지
 * - "실패 시 다음 채널로" 식 캐스케이드 설명은 백엔드가 지원하지 않으므로 쓰지 않는다.
 * - 분할 발송/야간 제한/재시도 같은 가짜 토글은 만들지 않는다.
 */

import { Mail, MessageCircle, MessageSquare } from "lucide-react"
import type { ReactNode } from "react"
import type { MessagingStatus } from "@/lib/messaging-client-types"
import { SEND_UNIT_COST_KRW } from "@/lib/marketing-send-costs"

interface Props {
  /** 현재 대상 중 이메일로 닿는 수 (직접 입력 모드면 파싱된 주소 수) */
  emailReach: number
  /** 현재 대상 중 휴대폰 번호 보유 수 (직접 입력 모드면 0) */
  phoneReach: number
  messagingStatus: MessagingStatus | null
  messagingStatusLoaded: boolean
  onOpenKakaoTest: () => void
}

/** 비활성 상태만 존재하는 토글 — 대량 발송 백엔드가 없다는 사실을 시각적으로 고정한다. */
function DisabledToggle({ reason }: { reason: string }) {
  return (
    <span
      role="switch"
      aria-checked={false}
      aria-disabled
      title={reason}
      className="relative inline-block h-5 w-9 shrink-0 cursor-not-allowed rounded-full bg-[#e8e8e4]"
    >
      <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.12)]" />
    </span>
  )
}

function ChannelRow({
  order,
  icon,
  title,
  badge,
  detail,
  trailing,
  dashed = false,
  muted = false,
}: {
  order: string
  icon: ReactNode
  title: string
  badge?: ReactNode
  detail: string
  trailing?: ReactNode
  dashed?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${
        dashed ? "border-dashed border-[#d8d7d0] bg-[#fafaf8]" : "border-[#e8e8e4] bg-white"
      }`}
    >
      <span
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          muted ? "border border-[#d8d7d0] text-[#1a1a1a]/35" : "bg-[#111110] text-white"
        }`}
      >
        {order}
      </span>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          muted ? "bg-[#f0f0ec] text-[#1a1a1a]/35" : "bg-[#ECFDF5] text-[#084734]"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={`text-[13px] font-bold ${muted ? "text-[#1a1a1a]/50" : "text-[#111110]"}`}>{title}</p>
          {badge}
        </div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-[#1a1a1a]/45">{detail}</p>
      </div>
      {trailing}
    </div>
  )
}

export default function ChannelCascadeCard({
  emailReach,
  phoneReach,
  messagingStatus,
  messagingStatusLoaded,
  onOpenKakaoTest,
}: Props) {
  const approved = (messagingStatus?.templates ?? []).filter(
    (t) => t.status?.toUpperCase() === "APPROVED"
  ).length
  const kakaoRegistered = (messagingStatus?.kakaoChannels?.length ?? 0) > 0
  const emailProvider = messagingStatus?.emailProvider ?? null
  const emailSimulated = messagingStatusLoaded && emailProvider === "none"

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e8e8e4] px-4 py-3.5 sm:px-5">
        <h3 className="text-[14px] font-bold text-[#111110]">채널 · 발송 상태</h3>
        <span className="text-[11px] text-[#1a1a1a]/40">
          지금 대량 발송이 열린 채널은 이메일뿐입니다 — 알림톡은 테스트 발송, 문자는 보류
        </span>
      </div>

      <div className="space-y-2 px-4 py-4 sm:px-5">
        {/* 1. 이메일 — 유일한 대량 발송 경로 */}
        <ChannelRow
          order="1"
          icon={<Mail className="h-4 w-4" />}
          title="이메일"
          badge={
            emailSimulated ? (
              <span className="rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[10px] font-semibold text-[#A8741A]">
                미설정 — 시뮬레이션
              </span>
            ) : (
              <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold text-[#084734]">
                대량 발송 가능
              </span>
            )
          }
          detail={`${emailReach}명 도달 · 건당 ${SEND_UNIT_COST_KRW.email}원 · 이 초안이 그대로 발송되는 채널`}
          trailing={<span className="shrink-0 text-[12px] font-bold tabular-nums text-[#111110]">0원</span>}
        />

        {/* 2. 카카오 알림톡 — 테스트 발송만, 대량 토글은 이유와 함께 비활성 */}
        <ChannelRow
          order="2"
          icon={<MessageCircle className="h-4 w-4" />}
          title="카카오 알림톡"
          badge={
            <span className="rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[10px] font-semibold text-[#A8741A]">
              테스트 발송만 가능
            </span>
          }
          detail={
            !messagingStatusLoaded
              ? "채널 상태 확인 중 — 승인 템플릿 기준으로만 발송됩니다"
              : kakaoRegistered
                ? `휴대폰 ${phoneReach}명 · 승인 템플릿 ${approved}개 · 예상 단가 ${SEND_UNIT_COST_KRW.kakaoAlimtalk}원/건 (대량 발송 오픈 시 적용)`
                : "카카오 채널 미등록 — solapi 콘솔에서 연동 후 사용할 수 있습니다"
          }
          trailing={
            <div className="flex shrink-0 flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenKakaoTest}
                  className="rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#084734]/35 hover:text-[#084734]"
                >
                  테스트 발송
                </button>
                <DisabledToggle reason="대량 발송 백엔드 미구현 — 테스트 발송까지만 지원" />
              </div>
              <span className="text-[10px] text-[#1a1a1a]/35">대량 발송 백엔드 미구현</span>
            </div>
          }
        />

        {/* 3. 문자 SMS/LMS — 운영 보류 */}
        <ChannelRow
          order="3"
          dashed
          muted
          icon={<MessageSquare className="h-4 w-4" />}
          title="문자 SMS/LMS"
          badge={
            <span className="rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[10px] font-semibold text-[#A8741A]">
              보류
            </span>
          }
          detail={`운영 보류 중 · 발신번호 ${messagingStatus?.senderNumber ?? "확인 중"} 등록됨 · 예상 단가 ${SEND_UNIT_COST_KRW.lms}원/건(LMS, 오픈 시 적용)`}
        />
      </div>
    </section>
  )
}
