import "server-only"

// 담당자 표의 업무 영역 목록 — 코드의 정본(한국: KR_TOPICS, 본사: HQ_DOMAINS)에서 만든다. 화면은 API 로 받는다
// (영역 이름을 화면에 다시 적지 않는다).

import { KR_TOPICS } from "@/lib/internal-cs-chat/contact"
import { HQ_DOMAINS } from "@/lib/internal-cs-chat/escalation-routing"

import type { TeamContactAreaOptions, TeamContactOrg } from "./model"

/** 한국 담당표에서 안내가 쓰지 않는 영역 — 본사 에스컬레이션은 본사 카드(HQ_DOMAINS)로 답한다(contact.ts ②). */
const KR_AREAS_NOT_USED = new Set<string>(["hq_escalation"])

export function teamContactAreaOptions(): TeamContactAreaOptions {
  return {
    KR: KR_TOPICS.map((topic) => ({ key: topic.key, label: topic.area, usedInAnswers: !KR_AREAS_NOT_USED.has(topic.key) })),
    // HQ 행은 저장만 한다 — 안내는 HQ_DOMAINS 그대로(보충 방식은 docs/active/internal-team-contacts-2026-11-26.md §5).
    HQ: Object.entries(HQ_DOMAINS).map(([key, domain]) => ({ key, label: domain.domainLabel, usedInAnswers: false })),
  }
}

export function allowedTeamContactAreas(): Record<TeamContactOrg, ReadonlySet<string>> {
  const options = teamContactAreaOptions()
  return {
    KR: new Set(options.KR.map((option) => option.key)),
    HQ: new Set(options.HQ.map((option) => option.key)),
  }
}
