// 담당자·링크 블록 — resolveContact(B2, lib/internal-cs-chat/contact.ts)와 링크 목록 찾기(links.ts)를 갈매봇 카드로 바꾼다.
// 화면과 무관한 순수 변환이다. 자료 조회는 deps(resolve)로 받는다.
import type { ContactCard as InternalContactCard, CustomerRef } from "@/lib/internal-cs-chat/contact"

import { findLinks, type LinkAudience, type LinkEntry } from "../links"
import type { AdminAiPageContext, AiBlock, ContactCard, LinksCard } from "../types"

const KIND_META: Record<InternalContactCard["kind"], string> = {
  customer_owner: "고객사 담당",
  kr: "한국 지사 업무",
  hq: "본사 기술 영역",
  unknown: "담당표에 없음",
}

export function toContactCard(source: InternalContactCard): ContactCard {
  const checkedAt = source.verifiedAt && /^\d{4}-\d{2}-\d{2}/.test(source.verifiedAt) ? source.verifiedAt.slice(0, 10) : undefined
  const notes = [source.reason, ...source.gaps.slice(0, 1)].filter(Boolean)
  return {
    title: "담당자",
    target: { label: KIND_META[source.kind], meta: source.alternatives.length ? `다른 후보: ${source.alternatives.slice(0, 2).join(", ")}` : "결정형 매칭" },
    ...(source.kind === "unknown" ? {} : { primary: { role: source.who, ...(source.channel.label ? { channel: source.channel.label } : {}) } }),
    ...(source.backup ? { backup: { role: source.backup } } : {}),
    ...(source.prepare.length ? { prepare: source.prepare.slice(0, 5) } : {}),
    ...(checkedAt ? { checkedAt } : {}),
    note: source.kind === "unknown" ? `${source.channel.label}. ${notes.join(" · ")}` : notes.join(" · "),
  }
}

/** 열려 있는 화면의 고객(리드·고객)을 담당자 찾기의 "열린 고객"으로. 다른 대상(견적·딜·HW)은 고객이 아니다. */
export function openCustomerOf(context: AdminAiPageContext | null | undefined): CustomerRef | null {
  const entity = context?.entity
  if (!entity || (entity.type !== "customer" && entity.type !== "lead")) return null
  if (!context?.path.startsWith("/admin/")) return null
  return { key: `${entity.type}:${entity.id}`, name: entity.label, href: context.path }
}

export async function contactBlock(
  question: string,
  resolve: (question: string, openCustomer: CustomerRef | null) => Promise<InternalContactCard>,
  context?: AdminAiPageContext | null
): Promise<AiBlock> {
  const card = await resolve(question, openCustomerOf(context))
  return { kind: "contact", card: toContactCard(card) }
}

const LINK_FILLER =
  /^(?:링크|주소|url|바로가기|바로|가기|화면|페이지|메뉴|탭|어디서|어디에|어디|어딨어|알려|알려줘|알려줄래|줘|주세요|좀|있어|있나|해|봐|열어|찾아|찾아줘|그|거|것|도|공개|고객용|어드민|관리자)$/i
const PARTICLE_TAIL = /(?:하는|하려면|하는데|할|에서|으로|로|은|는|이|가|을|를|의|도|랑)$/
/** 고객에게 보낼 공개 주소를 청하는 말. */
const CUSTOMER_HINT = /공개|고객용|고객한테|고객에게|홈페이지|보낼/
/** 어드민 화면을 청하는 말 — "HW 재고 화면 링크"는 공개 제품 페이지가 아니라 어드민 HW 화면이다. */
const INTERNAL_HINT = /화면|메뉴|탭|어드민|관리|페이지/

/** 링크 질문의 찾기 낱말 — 청하는 말과 조사를 덜어 낸다("결제 확정하는 화면 어디서 해?" → ["결제", "확정"]). */
export function linkTokensOf(text: string): string[] {
  return text
    .replace(/[?？!.,~]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !LINK_FILLER.test(token))
    .map((token) => (token.length > 2 ? token.replace(PARTICLE_TAIL, "") : token))
    .filter((token) => token && !LINK_FILLER.test(token))
}

/** 낱말 하나씩 찾을 때 — 질문 낱말의 절반 이상이 같은 줄에 맞아야 낸다(낱말 하나에 끌려 엉뚱한 링크를 내지 않게). */
function findByTokens(tokens: string[], audience: LinkAudience | undefined, limit: number): LinkEntry[] {
  const hits = new Map<string, { entry: LinkEntry; hits: number; order: number }>()
  tokens.forEach((token) => {
    const variants = token.length >= 3 ? [token, token.slice(0, -1)] : [token]
    const seen = new Set<string>()
    for (const variant of variants) {
      for (const entry of findLinks(variant, { audience, limit: 50 })) {
        if (seen.has(entry.id)) continue
        seen.add(entry.id)
        const current = hits.get(entry.id)
        hits.set(entry.id, { entry, hits: (current?.hits ?? 0) + 1, order: current?.order ?? hits.size })
      }
    }
  })
  const best = Math.max(0, ...Array.from(hits.values()).map((item) => item.hits))
  if (best === 0 || best * 2 < tokens.length) return []
  return Array.from(hits.values())
    .filter((item) => item.hits === best)
    .sort((a, b) => a.order - b.order)
    .slice(0, limit)
    .map((item) => item.entry)
}

/**
 * 링크 찾기 — 목록에 있는 id 만 싣는다. 청한 쪽(공개 주소·어드민 화면)을 먼저 찾고, 없으면 다른 쪽을 찾는다.
 * 낱말을 모두 가진 줄을 먼저 찾고, 없으면 낱말 하나씩 찾는다(질문 낱말의 절반 이상이 맞아야 한다).
 * 못 찾으면 null(호출자가 근거 답으로 넘긴다).
 */
export function linksBlock(text: string, options: { audience?: LinkAudience; limit?: number; title?: string } = {}): AiBlock | null {
  const tokens = linkTokensOf(text)
  const limit = options.limit ?? 4
  const preferred: LinkAudience | undefined =
    options.audience ?? (CUSTOMER_HINT.test(text) ? "customer" : INTERNAL_HINT.test(text) ? "internal" : undefined)
  const audiences: Array<LinkAudience | undefined> = options.audience ? [options.audience] : preferred ? [preferred, undefined] : [undefined]
  let found: LinkEntry[] = []
  if (tokens.length) {
    for (const audience of audiences) {
      found = findLinks(tokens.join(" "), { audience, limit })
      if (found.length === 0) found = findByTokens(tokens, audience, limit)
      if (found.length > 0) break
    }
  }
  if (found.length === 0) return null
  const label = tokens.join(" ") || text
  const card: LinksCard = {
    title: options.title ?? "링크",
    target: { label: label.length > 30 ? `${label.slice(0, 29)}…` : label, meta: `${found.length}개` },
    items: found.map((entry) => ({ linkId: entry.id })),
    note: "링크 목록에 있는 주소만 보여 줍니다.",
  }
  return { kind: "links", card }
}
