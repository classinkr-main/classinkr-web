// Compass 브리지 공용 순수 유틸 — 클라이언트/서버 양쪽에서 안전.
//
// normalizePhoneKey 는 Compass lib/format.ts normPhone(전화 저장 정본)과 같은 결과를 내야 한다
// (2026-09-14). SQL 쪽 등가 함수는 public.norm_phone_key
// (supabase/migrations/20260914_compass_integration_bridge.sql)이고, 진리표 픽스처를 공유한다
// (tests/compass/normalize.test.ts).
//
// 왜 compass_leads_v 의 phone_key 식(숫자만 → ^0082→82 → ^82→0, 이하 K식)을 그대로 쓰지 않나:
// K식은 Compass 가 저장한 값(이미 normPhone 을 거친 값)에서는 normPhone 과 결과가 같다. 그래서
// 뷰의 phone_key 는 바꾸지 않아도 된다. 하지만 어드민이 가진 **원문 전화**에 K식을 쓰면
// "+82 010-…"·"0082-010-…"(국가번호 뒤 국내 0 이 남은 형태)은 001012345678 이 되고,
// "10-1234-5678"(시트·엑셀이 앞 0 을 떨어뜨린 형태)은 1012345678 이 되어 조인에서 빠진다
// (Compass 감사 D-borrow-crm.md 전화 키 진리표 결론 2). normPhone 규칙은 이 셋만 01012345678 로
// 모으고, 나머지 입력에서는 K식과 결과가 같다 — 기존 매칭은 그대로, 누락만 준다.
//
// 이름이 같은 lib/crm/capture/matching.ts normalizePhoneKey 는 규칙이 다르다(숫자 9자리 이상만,
// 국가번호 처리 없음). 붙여넣기 인박스 내부 중복 판정용이라 이번에 바꾸지 않았다.

/**
 * 전화 조인 키(= Compass normPhone). 숫자만 남긴 뒤
 *  - 빈 값 → null
 *  - 0082·82 국가번호 → 벗기고, 국내 0 이 없으면 붙인다(8210… → 010…, 82010… → 010…)
 *  - 국가번호 없이 10 으로 시작하는 10자리 이상 → 앞 0 을 되살린다(1012345678 → 01012345678)
 *  - 그 밖(국내 표기·다른 나라 국가번호 008613…·8613…) → 그대로
 * 내선·두 번호가 한 칸에 붙은 입력은 숫자가 이어 붙는다 — 입력 정리의 몫이다(Compass 와 같게 틀림).
 */
export function normalizePhoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^0-9]/g, "")
  if (digits === "") return null
  const withDomesticZero = (rest: string) => (rest.startsWith("0") ? rest : `0${rest}`)
  if (digits.startsWith("0082")) return withDomesticZero(digits.slice(4))
  if (digits.startsWith("82")) return withDomesticZero(digits.slice(2))
  if (digits.startsWith("10") && digits.length >= 10) return `0${digits}`
  return digits
}

/** Compass 리드 상세 딥링크 — 어드민 카드의 "Compass에서 열기". */
export function compassLeadUrl(leadId: number): string {
  return `https://mkt.classin.co.kr/leads?open=${leadId}`
}

/**
 * Compass 퍼널 단계 한글 라벨 — 정본은 Compass lib/stages.ts STAGE_LABEL(2026-09-14 결정 K11).
 * 예전 값은 crm.stages.label 실측(2026-08-28: 신규유입·견적·이탈)이었는데, Compass 화면은 그 테이블을
 * 읽지 않고 lib/stages.ts 를 쓴다 — 같은 키가 브리지 너머에서 다른 뜻으로 읽혔다(Compass 감사 R3 T3:
 * quote 는 "견적"이 아니라 고객관리 미팅 진행, lost 는 "이탈"이 아니라 종료).
 * contact·consult 는 crm.stages 에만 남은 옛 키라(Compass STAGE_ORDER 에 없음) 옛 라벨을 둔다.
 * UI의 부재중/재통화는 파생 표시라 여기 없음. 사전 동기화 검사: tests/compass/normalize.test.ts.
 */
export const COMPASS_STAGE_LABEL: Record<string, string> = {
  new: "유입",
  contact: "컨택",
  consult: "상담",
  demo: "데모",
  quote: "미팅",
  bd: "BD인계",
  won: "결제",
  lost: "종료",
}

/**
 * Compass 인바운드 유입 경로(crm.leads.channel) — 고객이 먼저 온 것(채널톡·다이렉트·워크인·소개).
 * 정본은 Compass lib/taxonomy/defs.ts CHANNELS 중 group = 'inbound'. Compass 는 이 경로를 일반 트랙으로 보고
 * **마케팅 성과·마케팅 유입 집계에서 뺀다**(lib/channels.ts mktLeadCond:
 * `coalesce(channel,'') <> all (array['channeltalk','direct','walkin','referral'])`).
 */
export const COMPASS_INBOUND_CHANNELS = ["channeltalk", "direct", "walkin", "referral"] as const

/** Compass 마케팅 리드인가 — mktLeadCond 와 같은 규칙. 채널 없음(null·빈 값, 메타 리드 등)과 프로모션(sms·email)은 마케팅이다.
 *  SQL 과 같게 값을 다듬지 않고 그대로 비교한다. */
export function isCompassMarketingChannel(channel: string | null | undefined): boolean {
  return !(COMPASS_INBOUND_CHANNELS as readonly string[]).includes(channel ?? "")
}

/** 케어 사다리 한글 라벨 — crm.leads.care_stage 실측 어휘(member/leader/ceo/paid/closed). */
export const COMPASS_CARE_STAGE_LABEL: Record<string, string> = {
  member: "팀원 미팅",
  leader: "팀장 미팅",
  ceo: "대표 미팅",
  paid: "결제완료",
  closed: "종료",
}
