// Compass 브리지 공용 순수 유틸 — 클라이언트/서버 양쪽에서 안전.
// normalizePhoneKey는 compass_leads_v 뷰의 phone_key SQL 표현식과 규칙이 일치해야 한다
// (supabase/migrations/20260828_compass_bridge_views.sql).

/** 전화 정규화 키: 숫자만 → 0082/82 국가코드를 0으로. 빈 결과는 null. */
export function normalizePhoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^0-9]/g, "").replace(/^0082/, "82").replace(/^82/, "0")
  return digits.length > 0 ? digits : null
}

/** Compass 리드 상세 딥링크 — 어드민 카드의 "Compass에서 열기". */
export function compassLeadUrl(leadId: number): string {
  return `https://mkt.classin.co.kr/leads?open=${leadId}`
}

/** Compass 콜 단계 한글 라벨 — crm.stages 실측(2026-08-28). UI의 부재중/재통화는 파생 표시라 여기 없음. */
export const COMPASS_STAGE_LABEL: Record<string, string> = {
  new: "신규유입",
  contact: "컨택",
  consult: "상담",
  demo: "데모",
  quote: "견적",
  bd: "BD인계",
  won: "결제",
  lost: "이탈",
}

/** 케어 사다리 한글 라벨 — crm.leads.care_stage 실측 어휘(member/leader/ceo/paid/closed). */
export const COMPASS_CARE_STAGE_LABEL: Record<string, string> = {
  member: "팀원 미팅",
  leader: "팀장 미팅",
  ceo: "대표 미팅",
  paid: "결제완료",
  closed: "종료",
}
