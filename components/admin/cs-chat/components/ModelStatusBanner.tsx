import { AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"

/** generate 결과의 failureKinds 와 같은 값(lib/internal-cs-chat/model-transport.ts ModelFailureKind). 서버 전용 모듈을 끌어오지 않으려고 문자열로 둔다. */
export type ModelFailureKindLabel = "auth" | "quota" | "rate" | "timeout" | "shape" | "server"

export interface ModelStatusBannerProps {
  /** 결과의 origin. 'deterministic' 이면 AI 답이 아니라 근거 요약(대체 글)이라는 뜻이다. */
  origin?: "model" | "deterministic" | null
  failureKinds?: readonly string[] | null
  className?: string
}

const KIND_MESSAGE: Record<ModelFailureKindLabel, string> = {
  auth: "AI 연결 키·권한 문제로 응답을 받지 못했습니다. 운영 담당자에게 연결 설정 확인을 요청하세요.",
  quota: "AI 사용 한도(결제·쿼터)를 넘어 응답을 받지 못했습니다. 운영 담당자에게 알려 주세요.",
  rate: "AI 호출이 몰려 잠시 거절됐습니다. 잠시 후 다시 시도하세요.",
  timeout: "AI 응답이 제한 시간 안에 오지 않았습니다. 잠시 후 다시 시도하거나 빠른 모드로 질문하세요.",
  shape: "AI 응답 형식을 읽지 못했습니다. 잠시 후 다시 시도하세요.",
  server: "AI 서버 또는 네트워크 오류로 응답을 받지 못했습니다. 잠시 후 다시 시도하세요.",
}

// 같은 요청에서 여러 종류가 섞이면 운영 담당자가 먼저 손봐야 하는 순서로 보인다.
const KIND_PRIORITY: readonly ModelFailureKindLabel[] = ["quota", "auth", "timeout", "rate", "server", "shape"]

export function describeModelFailure(failureKinds: readonly string[] | null | undefined): string | null {
  const kinds = new Set(failureKinds ?? [])
  const first = KIND_PRIORITY.find((kind) => kinds.has(kind))
  return first ? KIND_MESSAGE[first] : null
}

/**
 * 모델 호출이 실패했을 때 성공 알림 대신 보이는 띠(IC-03). 성공이면 아무것도 그리지 않는다.
 * 실패 종류별로 다른 문구를 role=alert 로 읽어 준다. B4 가 워크스페이스에 장착한다.
 */
export default function ModelStatusBanner({ origin, failureKinds, className }: ModelStatusBannerProps) {
  const detail = describeModelFailure(failureKinds)
  if (!detail && origin !== "deterministic") return null
  return (
    <div
      role="alert"
      data-testid="model-status-banner"
      className={cn(
        "flex items-start gap-2 rounded-md border border-[#E7C0C0] bg-[#FCE9E9] px-3 py-2 text-[12px] text-[#8F2C2C]",
        className
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">AI 연결 실패 — 근거 요약만 표시합니다. 이 글은 AI 답이 아닙니다.</p>
        {detail ? <p className="mt-0.5">{detail}</p> : null}
      </div>
    </div>
  )
}
