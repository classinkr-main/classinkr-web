/**
 * contact/topics — 공개 문의 폼의 "문의 유형" 정본(SSOT).
 *
 * 이 값은 화면의 <select> 옵션이자 `leads.source_detail` 에 그대로 실리는 집계 키다.
 * 예전에는 같은 목록이 `app/contact/page.tsx` 안에 두 벌(검증용 Set + 옵션 JSX)로
 * 복제돼 있었고 서버에는 검증이 아예 없었다 — 공개 무인증 `/api/lead` 로 직접 POST 하면
 * 임의 문자열이 상담 유형 통계에 섞였다(컬럼에도 CHECK 제약이 없다).
 *
 * 유형을 추가·변경할 때는 이 파일만 고친다. 화면과 서버 검증이 함께 따라온다.
 * 값 자체가 집계 키라 **기존 값의 문자열을 바꾸면 과거 리드와 끊긴다** — 라벨만 바꾸고
 * 싶으면 `label` 을 쓰고 `value` 는 보존한다.
 */

/** 유형이 어느 팀으로 흘러야 하는지. 현재는 분류 용도이며 라우팅 자동화는 아직 없다. */
export type ContactTopicGroup = "sales" | "support" | "event"

export interface ContactTopic {
  /** 집계 키이자 폼 제출 값. 변경 금지(과거 리드와 끊긴다). */
  value: string
  /** 화면 표기. value 와 달라도 된다. */
  label: string
  group: ContactTopicGroup
}

export const CONTACT_TOPICS: readonly ContactTopic[] = [
  { value: "도입 상담", label: "도입 상담", group: "sales" },
  { value: "수업 운영 상담", label: "수업 운영 상담", group: "support" },
  { value: "결제/영수증/계약", label: "결제/영수증/계약", group: "support" },
  { value: "계정/접속/기술 지원", label: "계정/접속/기술 지원", group: "support" },
  { value: "하드웨어/설치/AS", label: "하드웨어/설치/AS", group: "support" },
  { value: "행사 신청", label: "행사 신청", group: "event" },
  { value: "세미나 신청", label: "세미나 신청", group: "event" },
] as const

/** 행사/세미나 선택기를 띄우는 유형. */
export const EVENT_CONTACT_TOPICS: ReadonlySet<string> = new Set(
  CONTACT_TOPICS.filter((topic) => topic.group === "event").map((topic) => topic.value)
)

const CONTACT_TOPIC_VALUE_SET: ReadonlySet<string> = new Set(
  CONTACT_TOPICS.map((topic) => topic.value)
)

/** 등록된 문의 유형인지. `?topic=` 프리필과 서버 검증이 함께 쓴다. */
export function isContactTopic(value: unknown): value is string {
  return typeof value === "string" && CONTACT_TOPIC_VALUE_SET.has(value)
}
