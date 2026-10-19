"use client"

import { useState, useMemo } from "react"
import {
  CheckCircle2,
  LockKeyhole,
  Sparkles,
  ArrowRight,
  Copy,
  Building,
  BookOpen,
  RefreshCw,
  Check,
  ChevronDown,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { InternalCsMessage } from "../types"

interface SmartActionCardProps {
  message: InternalCsMessage
  isLatest: boolean
  onQuickApprove: (messageId: string) => void
  onCopyCustomerHolding: () => void
  onRequestHq: () => void
  onPromoteKnowledge?: () => void
  onSelectAlternativeIssue: (issuePrompt: string) => void
  canPromote?: boolean
}

// 질문 및 답변에서 유추할 수 있는 대표적인 CS 상황/이슈 패턴
function detectIssueSummary(text: string): {
  detectedTitle: string
  alternatives: Array<{ label: string; prompt: string }>
} {
  const lower = text.toLowerCase()

  if (lower.includes("ops") || lower.includes("부팅") || lower.includes("윈도우") || lower.includes("전원")) {
    return {
      detectedTitle: "전자칠판 OPS 부팅 불가 / 윈도우 OS 진입 오류",
      alternatives: [
        { label: "OPS 슬롯 접촉 불량 및 하드웨어 점검", prompt: "전자칠판 OPS 물리 슬롯 재장착 및 전원 인가 절차 알려줘" },
        { label: "화면 터치 센서 USB 케이블 연결", prompt: "OPS 화면 터치 미인식 시 USB 케이블 및 드라이버 점검 절차" },
        { label: "고객 임시 대기 안내 문안", prompt: "OPS 점검 중 고객 대기 안내 초안 작성해줘" },
      ],
    }
  }

  if (lower.includes("터치") || lower.includes("좌표") || lower.includes("펜") || lower.includes("필기")) {
    return {
      detectedTitle: "전자칠판 터치 좌표 틀어짐 / 스마트펜 미인식",
      alternatives: [
        { label: "윈도우 터치 캘리브레이션 초기화", prompt: "전자칠판 터치 좌표 보정 및 캘리브레이션 초기화 방법" },
        { label: "스마트펜 블루투스 페어링 재연결", prompt: "ClassIn 스마트펜 블루투스 페어링 및 배터리 충전 확인법" },
        { label: "본사 하드웨어 기술팀 확인", prompt: "터치 패널 센서 이상으로 본사 기술팀에 전달할 인계 초안" },
      ],
    }
  }

  if (lower.includes("라이선스") || lower.includes("계정") || lower.includes("결제") || lower.includes("요금")) {
    return {
      detectedTitle: "ClassIn 계정 라이선스 활성화 및 권한 설정",
      alternatives: [
        { label: "기관 라이선스 배정 오류 확인", prompt: "학원 기관 관리자 계정에서 교사/학생 라이선스 배정 경로" },
        { label: "구독 갱신 및 결제 내역 대조", prompt: "ClassIn 라이선스 갱신 주기 및 결제 영수증 확인 절차" },
        { label: "고객 대기 문자 템플릿", prompt: "라이선스 확인 중 고객 대기 안내 문자 초안 작성해줘" },
      ],
    }
  }

  if (lower.includes("카메라") || lower.includes("마이크") || lower.includes("스피커") || lower.includes("오디오")) {
    return {
      detectedTitle: "수업 음향/영상 장비 연결 및 권한 허용 오류",
      alternatives: [
        { label: "브라우저 및 앱 마이크 권한 재설정", prompt: "ClassIn 앱에서 카메라/마이크 접근 권한 허용 가이드" },
        { label: "USB 웹캠/스피커폰 인식 불량", prompt: "외부 오디오/영상 장비 드라이버 점검 및 기본 장치 설정" },
        { label: "수업 진행 중 긴급 대응 문안", prompt: "수업 시작 전 음향 문제 발생 시 고객 안내 초안" },
      ],
    }
  }

  // 기본 fallback 상황
  return {
    detectedTitle: "ClassIn 기술 지원 및 운영 절차 안내",
    alternatives: [
      { label: "OPS/하드웨어 이상 점검", prompt: "전자칠판 OPS 부팅 및 하드웨어 점검 절차 확인해줘" },
      { label: "소프트웨어/앱 충돌 점검", prompt: "ClassIn 앱 최신 버전 업데이트 및 캐시 삭제 절차" },
      { label: "본사 확인 요청 인계 작성", prompt: "본사 기술팀에 확인할 수 있도록 이슈 정리 초안 작성해줘" },
    ],
  }
}

export default function SmartActionCard({
  message,
  onQuickApprove,
  onCopyCustomerHolding,
  onRequestHq,
  onPromoteKnowledge,
  onSelectAlternativeIssue,
  canPromote = false,
}: SmartActionCardProps) {
  const isApproved = message.review_state === "approved"
  const isPending = message.review_state === "pending"

  // 상황 확인(이런 거 맞냐) 상태
  const [confirmedState, setConfirmedState] = useState<"unconfirmed" | "confirmed" | "selecting_alt">("unconfirmed")
  const [showAltMenu, setShowAltMenu] = useState(false)
  const [approvedSuccessToast, setApprovedSuccessToast] = useState(false)

  const { detectedTitle, alternatives } = useMemo(
    () => detectIssueSummary(message.content),
    [message.content]
  )

  const handleConfirm = () => {
    setConfirmedState("confirmed")
    setShowAltMenu(false)
  }

  const handleApproveClick = () => {
    onQuickApprove(message.id)
    setApprovedSuccessToast(true)
    setTimeout(() => setApprovedSuccessToast(false), 3000)
  }

  return (
    <div className="mt-3.5 rounded-lg border border-[#084734]/20 bg-[linear-gradient(180deg,#F8FDFB_0%,#F0FBF6_100%)] p-3.5 shadow-xs">
      {/* 1. 상단: 상황 확인 UI (이런 문제 맞으신가요?) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#084734]/10 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#084734] text-white">
            <Sparkles className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[#084734]">
              {confirmedState === "confirmed" ? "💡 확인된 핵심 이슈" : "💡 파악된 증상 — 이런 상황 맞으신가요?"}
            </p>
            <p className="truncate text-[12px] font-semibold text-[#31302E]">
              {detectedTitle}
            </p>
          </div>
        </div>

        {/* 확인 / 변경 버튼군 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {confirmedState !== "confirmed" ? (
            <>
              <button
                type="button"
                onClick={handleConfirm}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-[#084734] px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#065C41]"
              >
                <Check className="h-3.5 w-3.5" />
                네, 맞습니다
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAltMenu((v) => !v)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-black/[0.1] bg-white px-2 text-[11px] font-medium text-[#615D59] hover:bg-[#F6F5F4]"
                >
                  <RefreshCw className="h-3 w-3" />
                  다른 상황
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showAltMenu ? (
                  <div className="absolute right-0 top-8 z-20 w-64 rounded-lg border border-black/[0.1] bg-white p-2 shadow-lg">
                    <p className="px-2 py-1 text-[10px] font-semibold text-[#A39E98]">대안 상황 선택 시 질문창에 반영</p>
                    <div className="mt-1 space-y-1">
                      {alternatives.map((alt, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            onSelectAlternativeIssue(alt.prompt)
                            setShowAltMenu(false)
                          }}
                          className="flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] text-[#31302E] hover:bg-[#ECFDF5] hover:text-[#084734]"
                        >
                          <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-[#084734]" />
                          <span className="leading-snug">{alt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[10px] font-semibold text-[#084734]">
              <CheckCircle2 className="h-3 w-3" />
              조치 확정됨
            </span>
          )}
        </div>
      </div>

      {/* 2. 중단 및 하단: 허용(승인) 및 진행 액션 UI */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-0.5">
        {/* 허용(승인) 섹션 */}
        <div className="flex items-center gap-2">
          {isPending ? (
            <button
              type="button"
              onClick={handleApproveClick}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#084734] px-3 text-[11px] font-bold text-white shadow-xs transition-all hover:bg-[#065C41] hover:shadow-sm"
              title="검토 체크를 통과시키고 외부 전달 및 후속 작업을 즉시 승인(허가)합니다"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              ⚡ 이 초안으로 즉시 검토·승인 (허가)
            </button>
          ) : isApproved ? (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#084734]">
              <CheckCircle2 className="h-4 w-4" />
              <span>담당자 승인 완료 — 외부 전달 및 후속 작업 <strong>허용됨</strong></span>
            </div>
          ) : (
            <span className="text-[11px] text-[#A39E98]">수정 요청 상태</span>
          )}

          {approvedSuccessToast ? (
            <span className="text-[11px] font-bold text-[#084734] animate-fade-in">
              ✨ 승인(허가) 완료!
            </span>
          ) : null}
        </div>

        {/* 후속 진행(Proceed Actions) 버튼군 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 고객 안내문 복사 진행 */}
          <button
            type="button"
            onClick={onCopyCustomerHolding}
            disabled={!isApproved}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors",
              isApproved
                ? "border-[#084734]/25 bg-white text-[#084734] hover:bg-[#ECFDF5]"
                : "cursor-not-allowed border-black/[0.06] bg-[#F6F5F4] text-[#A39E98] opacity-60"
            )}
            title={isApproved ? "고객 임시 안내문 클립보드 복사" : "담당자 승인 후 복사 가능"}
          >
            {isApproved ? <Copy className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
            고객 안내 복사 진행
          </button>

          {/* 본사 확인 요청 진행 */}
          <button
            type="button"
            onClick={onRequestHq}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.1] bg-white px-2.5 text-[11px] font-medium text-[#31302E] transition-colors hover:bg-[#F6F5F4]"
            title="본사 확인(HQ Desk) 인계 요청 진행"
          >
            <Building className="h-3.5 w-3.5 text-[#615D59]" />
            본사 확인 등록
          </button>

          {/* 사내 지식 승격 진행 (승인된 경우) */}
          {canPromote && onPromoteKnowledge ? (
            <button
              type="button"
              onClick={onPromoteKnowledge}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#084734]/25 bg-[#ECFDF5] px-2.5 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#D1FAE5]"
              title="검증된 답변을 사내 공식 지식 문서로 승격"
            >
              <BookOpen className="h-3.5 w-3.5" />
              지식 승격
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
