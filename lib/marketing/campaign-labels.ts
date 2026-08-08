// lib/marketing/campaign-labels.ts
// 링크된 채널 실행(email/sms/event/meta)의 "사람이 읽는 라벨" — 단일 진실원.
// 순수 함수만 둔다(DB 접근·부수효과 없음). 서버 수집은 campaign-rollup-sources.ts.
//
// 왜 모으나: 라벨 소비처가 둘이다.
//   1) 링크 피커(app/api/admin/marketing-campaigns/link-candidates) — 붙일 실행 고르기
//   2) 캠페인 상세/목록의 links[].label — 붙은 실행 보여주기
// 규칙이 갈라지면 "고를 때 본 이름"과 "붙인 뒤 보이는 이름"이 달라진다.
//
// 정직 규칙: 라벨은 실제로 조회된 행에서만 만든다. 행이 없으면(실행 삭제됨 · Meta 조회
// 지평 밖) 호출자가 label 을 undefined 로 남겨 UI 가 raw id 로 폴백하게 한다 —
// "이메일 캠페인" 같은 그럴듯한 이름을 지어내지 않는다.

import type { CampaignLink, CampaignRefType } from "@/lib/types/marketing-campaign"

/** 공백 정규화 + 말줄임. 문자 본문처럼 긴 텍스트를 한 줄 라벨로 줄인다. */
export function labelSnippet(text: string, max = 40): string {
  const t = text.trim().replace(/\s+/g, " ")
  return t.length > max ? `${t.slice(0, max)}…` : t
}

export function emailCampaignLabel(row: { id: string | number; subject?: string | null }): string {
  return row.subject?.trim() || `(제목 없음) #${row.id}`
}

export function smsCampaignLabel(row: { id: string | number; message?: string | null }): string {
  const body = row.message ? labelSnippet(String(row.message)) : ""
  return body || `문자 #${row.id}`
}

export function eventLabel(row: { id: string; title?: string | null }): string {
  return row.title?.trim() || `행사 ${row.id}`
}

export function metaCampaignLabel(row: { id: string; name?: string | null }): string {
  return row.name?.trim() || row.id
}

/* ─────────────────────────────────────────────────────────────
   Meta objective — 원문 enum("OUTCOME_LEADS")을 사람이 읽는 라벨로.
   Meta 동기화가 objective 를 그대로 복사하므로 캠페인 관리 목록·상세와
   광고 탭 테이블이 같은 매핑을 봐야 한다. 미지의 값은 원문 그대로(지어내지 않음).
   ───────────────────────────────────────────────────────────── */

const META_OBJECTIVE_LABEL: Record<string, string> = {
  OUTCOME_LEADS: "리드 확보",
  OUTCOME_TRAFFIC: "트래픽",
  OUTCOME_AWARENESS: "인지도",
  OUTCOME_ENGAGEMENT: "참여",
  OUTCOME_SALES: "판매",
  OUTCOME_APP_PROMOTION: "앱 홍보",
  // 구세대 objective — 과거 캠페인이 여전히 이 값을 들고 있다.
  LEAD_GENERATION: "리드 확보",
  LINK_CLICKS: "링크 클릭",
  CONVERSIONS: "전환",
  BRAND_AWARENESS: "인지도",
  REACH: "도달",
  MESSAGES: "메시지",
  VIDEO_VIEWS: "영상 조회",
  POST_ENGAGEMENT: "게시물 참여",
}

/** Meta objective(또는 임의 목표 텍스트)를 표시용으로. 매핑에 없으면 원문 유지. */
export function metaObjectiveLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return META_OBJECTIVE_LABEL[trimmed.toUpperCase()] ?? trimmed
}

/* ─────────────────────────────────────────────────────────────
   링크 라벨 맵 — refType → refId → label
   ───────────────────────────────────────────────────────────── */

export type CampaignLinkLabels = Record<CampaignRefType, Record<string, string>>

export function emptyCampaignLinkLabels(): CampaignLinkLabels {
  return { email_campaign: {}, sms_campaign: {}, event: {}, meta_campaign: {} }
}

/**
 * 링크 배열에 label 을 입힌다(입력 배열/원소 불변 — 새 객체를 만든다).
 * 해석되지 않은 refId 는 label 키 자체를 붙이지 않아 JSON 에서 생략된다 → UI 가 raw id 폴백.
 */
export function withLinkLabels(
  links: CampaignLink[],
  labels: CampaignLinkLabels,
): CampaignLink[] {
  return links.map((link) => {
    const label = labels[link.refType]?.[link.refId]
    return label ? { ...link, label } : link
  })
}
