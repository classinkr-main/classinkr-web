"use client"

/**
 * ChannelStatusStrip — 메시지 발송 허브 상단 채널 상태 스트립
 *
 * GET /api/admin/messaging/status 기반. solapi 잔액·카카오 채널·템플릿 승인 수·
 * 이메일 프로바이더를 컴팩트 카드 행으로 보여준다. 60초 stale 허용.
 * 백엔드 트랙이 아직 배포 전이면 조용히 "확인 불가" 상태로 강등한다.
 *
 * DESIGN.md: 넓은 면은 뉴트럴, 그린은 액센트로만, 상태색은 뱃지/텍스트 톤.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
} from "lucide-react"
import { adminFetch } from "@/lib/admin-client"
import {
  unwrapMessagingData,
  type MessagingStatus,
} from "@/lib/messaging-client-types"

const KRW = new Intl.NumberFormat("ko-KR")
const STATUS_TTL_MS = 60_000

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; status: MessagingStatus }
  | { kind: "unavailable"; message: string }

function approvedCount(status: MessagingStatus): number {
  return status.templates.filter((t) => t.status?.toUpperCase() === "APPROVED").length
}

function emailProviderLabel(provider: MessagingStatus["emailProvider"]): {
  label: string
  ok: boolean
} {
  switch (provider) {
    case "resend":
      return { label: "Resend 연결됨", ok: true }
    case "webhook":
      return { label: "웹훅 연결됨", ok: true }
    default:
      return { label: "미설정 (시뮬레이션)", ok: false }
  }
}

export default function ChannelStatusStrip() {
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  const [refreshing, setRefreshing] = useState(false)
  const lastFetchedAt = useRef(0)

  const load = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetchedAt.current < STATUS_TTL_MS) return
    setRefreshing(true)
    try {
      const res = await adminFetch("/api/admin/messaging/status")
      if (!res.ok) {
        setState({
          kind: "unavailable",
          message:
            res.status === 404
              ? "발송 상태 API가 아직 준비되지 않았습니다."
              : `상태를 불러오지 못했습니다. (${res.status})`,
        })
        return
      }
      const json = await res.json().catch(() => null)
      const status = unwrapMessagingData<MessagingStatus>(json)
      if (!status || status.provider !== "solapi") {
        setState({ kind: "unavailable", message: "발송 상태 응답 형식을 확인해주세요." })
        return
      }
      lastFetchedAt.current = Date.now()
      setState({ kind: "ready", status })
    } catch {
      setState({ kind: "unavailable", message: "발송 상태를 불러오지 못했습니다." })
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(true)
  }, [load])

  if (state.kind === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3 text-[12px] text-[#1a1a1a]/45">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        채널 상태 확인 중...
      </div>
    )
  }

  if (state.kind === "unavailable") {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-[12px] text-[#1a1a1a]/50">
          <AlertTriangle className="h-3.5 w-3.5 text-[#A8741A]" />
          {state.message} 발송 자격증명(solapi)이 설정되면 여기에 잔액·채널 상태가 표시됩니다.
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/55 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] sm:self-auto"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          다시 확인
        </button>
      </div>
    )
  }

  const { status } = state
  const email = emailProviderLabel(status.emailProvider)
  const approved = approvedCount(status)
  const primaryKakao = status.kakaoChannels[0]
  const point = status.balance?.point ?? 0
  const lowBalance = point < 100

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white">
      {!status.configured && (
        <div className="flex items-start gap-2 border-b border-[#e8e8e4] bg-[#FBF1E0] px-4 py-2.5 text-[11px] text-[#7A520F]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A8741A]" />
          <span>
            발송 자격증명이 완전히 설정되지 않았습니다. Settings → 외부 연동에서 solapi 연결을 확인해주세요.
          </span>
        </div>
      )}
      <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-stretch md:gap-4">
        <StatusCell
          icon={<CreditCard className="h-3.5 w-3.5" />}
          label="solapi 잔액"
          value={`${KRW.format(point)}P`}
          hint={
            status.balance
              ? `충전금 ${KRW.format(status.balance.balance)}원`
              : "잔액 확인 불가"
          }
          tone={lowBalance ? "warning" : "neutral"}
        />
        <CellDivider />
        <StatusCell
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          label="카카오 채널"
          value={primaryKakao?.searchId ? `@${primaryKakao.searchId}` : "미등록"}
          hint={
            status.kakaoChannels.length > 0
              ? `승인 템플릿 ${approved} / ${status.templates.length}개`
              : "채널 등록 필요"
          }
          tone={
            status.kakaoChannels.length === 0
              ? "warning"
              : approved === 0
                ? "warning"
                : "success"
          }
        />
        <CellDivider />
        <StatusCell
          icon={<Phone className="h-3.5 w-3.5" />}
          label="SMS 발신번호"
          value={status.senderNumber ?? "미등록"}
          hint={status.senderNumber ? "등록 완료" : "등록 필요 — 발송 시 실패"}
          tone={status.senderNumber ? "success" : "warning"}
        />
        <CellDivider />
        <StatusCell
          icon={<Mail className="h-3.5 w-3.5" />}
          label="이메일"
          value={email.label}
          hint={email.ok ? "발송 가능" : "미설정 시 시뮬레이션"}
          tone={email.ok ? "success" : "neutral"}
        />
        <div className="flex items-center justify-end md:pl-1">
          <button
            type="button"
            onClick={() => load(true)}
            title="상태 새로고침"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/45 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">새로고침</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function CellDivider() {
  return <div className="hidden w-px shrink-0 self-stretch bg-[#f0f0ec] md:block" />
}

function StatusCell({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  tone: "neutral" | "success" | "warning"
}) {
  const valueTone =
    tone === "warning"
      ? "text-[#8F2C2C]"
      : tone === "success"
        ? "text-[#084734]"
        : "text-[#111110]"
  const iconTone =
    tone === "warning"
      ? "bg-[#FBF1E0] text-[#A8741A]"
      : tone === "success"
        ? "bg-[#ECFDF5] text-[#084734]"
        : "bg-[#f0f0ec] text-[#1a1a1a]/50"

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center gap-1.5">
        <span className={`inline-flex rounded-md p-1 ${iconTone}`}>{icon}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-[#1a1a1a]/40">
          {label}
        </span>
      </div>
      <p className={`truncate text-[14px] font-semibold leading-tight ${valueTone}`} title={value}>
        {tone === "success" && <CheckCircle2 className="mr-1 inline h-3 w-3 align-[-1px]" />}
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/40" title={hint}>
        {hint}
      </p>
    </div>
  )
}
