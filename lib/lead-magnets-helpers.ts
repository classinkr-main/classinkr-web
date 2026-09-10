// 리드마그넷 순수 헬퍼 — data/lead-magnets.json을 참조하지 않는다.
// lib/lead-magnets.ts는 모듈 최상단에서 leadMagnetOptions = leadMagnets.map(...)을 즉시 평가해
// 콘텐츠 전체(213KB raw)를 끌고 온다. 라벨/카운트만 필요한 임포터는 반드시 이 모듈에서 가져와야
// 그 편승을 피한다 — lib/lead-magnets.ts가 이 파일을 재-export하면 분리가 무효화되니 금지.
import type {
  LeadMagnet,
  LeadMagnetCategory,
  LeadMagnetGate,
  LeadMagnetStatus,
  LeadMagnetTier,
} from "@/lib/lead-magnets"

export function getLeadMagnetItemCount(magnet: LeadMagnet) {
  return magnet.sections.reduce((total, section) => total + section.items.length, 0)
}

export function getLeadMagnetStatusLabel(status: LeadMagnetStatus) {
  if (status === "review") return "리뷰"
  if (status === "unlisted") return "링크 공개"
  return "초안"
}

export function getLeadMagnetGateLabel(gate: LeadMagnetGate) {
  if (gate === "login") return "로그인 게이트"
  if (gate === "email") return "이메일 게이트"
  return "공개"
}

export function getLeadMagnetPublicGateLabel(gate: LeadMagnetGate) {
  if (gate === "login") return "로그인 후 받기"
  if (gate === "email") return "이메일로 받기"
  return "바로 보기"
}

export function getLeadMagnetTierLabel(tier: LeadMagnetTier) {
  if (tier === "advanced") return "심화"
  return "기본"
}

export function getLeadMagnetCategoryLabel(category: LeadMagnetCategory) {
  const labels: Record<LeadMagnetCategory, string> = {
    operations: "운영",
    hardware: "하드웨어",
    software: "소프트웨어",
    "case-study": "사례",
    security: "보안",
  }
  return labels[category]
}
