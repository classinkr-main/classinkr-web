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
 * 마케팅 성과·마케팅 유입 집계에서 뺀다(lib/channels.ts mktLeadCond).
 */
export const COMPASS_INBOUND_CHANNELS = ["channeltalk", "direct", "walkin", "referral"] as const

/** Compass 가져오기(import) 채널 — 유입이 아니라 다른 시스템(NEO 한국팀)에서 **들여온** 스텁의 표식(Compass ADR-0015,
 *  lib/taxonomy/defs.ts CHANNELS group='import'). Compass 는 이 채널도 mktLeadCond 에서 뺀다(lib/channels.ts
 *  `INBOUND_CHANNELS ∪ IMPORT_CHANNELS`). 2026-10-12 전까지 이 사본에 빠져 있어 NEO 계정 동기화가 만든 스텁(created_at=오늘)이
 *  어드민 「오늘 유입」 마케팅 신규로 잡혔다. */
export const COMPASS_IMPORT_CHANNELS = ["neo"] as const

/** 마케팅 집계에서 빼는 채널 전부 = Compass mktLeadCond 의 배열과 같은 목록(순서까지). */
export const COMPASS_NON_MARKETING_CHANNELS = [...COMPASS_INBOUND_CHANNELS, ...COMPASS_IMPORT_CHANNELS] as const

/** Compass 마케팅 리드인가 — mktLeadCond 와 같은 규칙. 채널 없음(null·빈 값, 메타 리드 등)과 프로모션(sms·email·expo)은 마케팅이다.
 *  SQL 과 같게 값을 다듬지 않고 그대로 비교한다. */
export function isCompassMarketingChannel(channel: string | null | undefined): boolean {
  return !(COMPASS_NON_MARKETING_CHANNELS as readonly string[]).includes(channel ?? "")
}

/* ── 전화 키를 다른 시스템 기록과 붙여도 되는가 — Compass scripts/phoneJoinKey.mjs 의 TS 사본 ───────────────
 *  Compass 는 "0"·"010-0000-0000"·"010-1234-5678" 같은 자리표시·더미 번호를 동일인 키로 쓰지 않는다(ADR-0018, 동일인 키).
 *  어드민 쪽은 길이 9 이상만 봤다 — 폼에 더미를 친 사람이 같은 더미를 가진 **남의** Compass 리드의 종료·활동에 붙어
 *  자동 종료·연락함이 됐다(2026-10-12 브리지 감사 4번). 규칙·진리표는 Compass tests/phoneJoinKey.test.ts 와 같다
 *  (tests/compass/normalize.test.ts 가 같은 표를 든다). 규칙을 바꾸면 Compass 쪽과 같이 바꾼다. */

/** 조인에 쓰는 전화 키의 최소 자릿수 — 지역번호 포함 가장 짧은 국내 번호(02-123-4567)가 9자리. */
export const MIN_COMPASS_JOIN_PHONE_DIGITS = 9

/** 네 자리 블록이 "아무렇게나 친" 모양인가 — 전부 같은 숫자(1111) 또는 1씩 오르내리는 연속(1234·0123·9876·3210). */
function isTrivialPhoneBlock(block: string): boolean {
  if (/^(\d)\1{3}$/.test(block)) return true
  const digits = [...block].map(Number)
  const step = digits[1] - digits[0]
  return (step === 1 || step === -1) && digits.every((value, index) => index === 0 || value - digits[index - 1] === step)
}

/**
 * 자리표시·더미 번호인가 — 길이는 보지 않는다(호출부 몫). 숫자열이 아니면 true(붙이지 않는다).
 *  - 전부 같은 숫자(000000000, 1111111111)
 *  - 앞 3자리 뒤가 전부 0(010-0000-0000)
 *  - 휴대폰 11자리 가운데·끝 네 자리가 **둘 다** 같은 숫자·연속(010-1234-5678, 010-1111-2222)
 *  - 휴대폰 11자리 가입자 번호(뒤 8자리)에 0 아닌 숫자가 하나 이하(010-0000-0001)
 * 대표번호·유선은 블록 규칙을 두지 않는다 — 실제로 쓰는 번호일 수 있다.
 */
export function isPlaceholderPhoneDigits(key: unknown): boolean {
  if (typeof key !== "string" || !/^\d+$/.test(key)) return true
  if (/^(\d)\1*$/.test(key)) return true
  if (/^\d{3}0+$/.test(key)) return true
  const mobile = /^01[016789](\d{4})(\d{4})$/.exec(key)
  if (mobile) {
    const [, mid, last] = mobile
    if (isTrivialPhoneBlock(mid) && isTrivialPhoneBlock(last)) return true
    if (/^0*[1-9]?0*$/.test(mid + last)) return true
  }
  return false
}

/** 다른 시스템 기록과 붙여도 되는 키인가 — 숫자열 · 9자리 이상 · 자리표시 아님. */
export function isJoinableCompassPhoneKey(key: unknown): key is string {
  if (typeof key !== "string" || !/^\d+$/.test(key)) return false
  if (key.length < MIN_COMPASS_JOIN_PHONE_DIGITS) return false
  return !isPlaceholderPhoneDigits(key)
}

/** 붙여도 되는 키면 그대로, 아니면 null. */
export const joinableCompassPhoneKey = (key: string | null | undefined): string | null =>
  isJoinableCompassPhoneKey(key) ? key : null

/** 케어 사다리 한글 라벨 — crm.leads.care_stage 실측 어휘(member/leader/ceo/paid/closed). */
export const COMPASS_CARE_STAGE_LABEL: Record<string, string> = {
  member: "팀원 미팅",
  leader: "팀장 미팅",
  ceo: "대표 미팅",
  paid: "결제완료",
  closed: "종료",
}
