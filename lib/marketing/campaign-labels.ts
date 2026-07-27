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
