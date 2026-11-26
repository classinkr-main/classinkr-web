// 갈매봇 블록 → 위컴 글(markdown). 순수 함수.
//
// 규칙: 두괄식(결론 먼저), 한 단계 한 줄, 글자 수 상한(MAX_CHARS, 줄 단위로 자르고 "이어지는 내용은 어드민에서").
// 위컴 쪽 상한은 markdown·스트림 content 모두 20480바이트(UTF-8) — 공식 101031·101138. 그보다 훨씬 짧게 둔다.
// 링크는 링크 목록(lib/admin-ai/links.ts)의 id·등록 주소만 절대 주소로 바꿔 싣는다. 사내 문서·상담 근거가 섞인 답에는
// "내부용 — 그대로 보내지 마세요" 줄을 맨 앞에 단다.
// 쓰기 오더는 미리보기 요지와 "어드민에서 확인" 주소만 — 위컴에서는 실행하지 않는다(확인 경로는 로그인한 어드민 화면뿐).
import { getLinkById, isAllowedAdminHref, isRegisteredInternalHref } from "@/lib/admin-ai/links"
import type { AiBlock, AnswerCard, ConsultationSource, ConsultationsCard, OrderTicket } from "@/lib/admin-ai/types"

export const MAX_CHARS = 1800
export const MAX_BYTES = 20480
export const INTERNAL_ONLY_LINE = "> 내부용 — 그대로 보내지 마세요"
export const TRUNCATED_LINE = "… 이어지는 내용은 어드민 갈매봇에서 확인해 주세요."
export const WRITE_NOT_HERE = "위컴에서는 실행하지 않습니다 — 어드민에서 확인해 주세요."

const SOURCE_LABEL: Record<ConsultationSource, string> = { channel_talk: "채널톡", internal_cs: "내부 CS" }

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim()
/** markdown 의 링크·강조 문법을 깨는 글자만 누그러뜨린다(본문에 [ ] 가 있어도 링크로 읽히지 않게). */
const plain = (value: string) => oneLine(value).replace(/[[\]]/g, (c) => (c === "[" ? "［" : "］"))

/** 어드민 경로(등록된 것만) → 절대 주소. 등록되지 않았으면 null. */
export function absoluteAdminUrl(href: string | undefined, siteUrl: string): string | null {
  if (!href || !isRegisteredInternalHref(href)) return null
  return new URL(href, siteUrl).toString()
}

function linkLine(label: string, href: string | undefined, siteUrl: string): string | null {
  const url = absoluteAdminUrl(href, siteUrl)
  return url ? `[${plain(label)}](${url})` : null
}

export function isInternalOnlyAnswer(card: AnswerCard): boolean {
  return card.sources.some((source) => !source.externalUse || source.kind !== "public")
}

function answerLines(card: AnswerCard, siteUrl: string): string[] {
  const lines = [`**${plain(card.answer)}**`]
  if (card.confidence === "needs-check") lines.push("(확인 필요)")
  card.steps?.forEach((step, index) => lines.push(`${index + 1}. ${plain(step)}`))
  card.cautions?.forEach((caution) => lines.push(`- 주의: ${plain(caution)}`))
  if (card.customerDraft) {
    lines.push(`고객용 문안${card.customerDraft.status === "needs-check" ? "(확인 필요)" : ""}: ${plain(card.customerDraft.text)}`)
  }
  if (card.note) lines.push(plain(card.note))
  const sources = card.sources.slice(0, 3).map((source) => `${plain(source.title)}(${source.kind === "public" ? "공개" : "사내"})`)
  if (sources.length) lines.push(`근거: ${sources.join(", ")}`)
  for (const source of card.sources) {
    const entry = source.linkId ? getLinkById(source.linkId) : undefined
    if (entry?.audience === "internal") {
      const line = linkLine(entry.label, entry.href, siteUrl)
      if (line) lines.push(line)
      break
    }
  }
  return lines
}

function blockLines(block: AiBlock, siteUrl: string): string[] {
  switch (block.kind) {
    case "text":
      return [plain(block.text)]
    case "answer":
      return answerLines(block.card, siteUrl)
    case "read": {
      const card = block.card
      const lines = [`**${plain(card.title)}** · ${plain(card.target.label)}${card.target.meta ? ` · ${plain(card.target.meta)}` : ""}`]
      if (card.table) {
        for (const row of card.table.rows.slice(0, 5)) lines.push(`- ${row.map(plain).join(" · ")}`)
        if (card.table.rows.length > 5) lines.push(`- 외 ${card.table.rows.length - 5}건`)
      }
      if (card.note) lines.push(plain(card.note))
      const link = card.openHref ? linkLine(card.openLabel ?? "화면 열기", card.openHref, siteUrl) : null
      if (link) lines.push(link)
      return lines
    }
    case "deny": {
      const lines = [`**${plain(block.card.title)}**`, plain(block.card.text)]
      const link = block.card.openHref ? linkLine(block.card.openLabel ?? "화면 열기", block.card.openHref, siteUrl) : null
      if (link) lines.push(link)
      return lines
    }
    case "choice":
      return [
        `**${plain(block.card.title)}** — ${plain(block.card.target.label)}`,
        ...block.card.options.map((option) => `- ${plain(option.label)}: ${plain(option.meta)}`),
        ...(block.card.note ? [plain(block.card.note)] : []),
      ]
    case "contact": {
      const c = block.card
      const person = (label: string, p: typeof c.primary) =>
        p ? [`${label}: ${plain(p.role)}${p.name ? ` ${plain(p.name)}` : ""}${p.channel ? ` (${plain(p.channel)})` : ""}`] : []
      return [
        `**${plain(c.title)}**`,
        ...person("담당", c.primary),
        ...person("대신", c.backup),
        ...(c.prepare?.length ? [`준비: ${c.prepare.map(plain).join(", ")}`] : []),
        ...(c.note ? [plain(c.note)] : []),
      ]
    }
    case "links": {
      const lines = [`**${plain(block.card.title)}**`]
      for (const item of block.card.items) {
        const entry = getLinkById(item.linkId)
        if (!entry) continue
        const url = entry.audience === "customer" ? entry.url : absoluteAdminUrl(entry.href, siteUrl)
        if (url) lines.push(`- [${plain(entry.label)}](${url})${item.note ? ` — ${plain(item.note)}` : ""}`)
      }
      if (block.card.note) lines.push(plain(block.card.note))
      return lines
    }
    case "consultations":
      return consultationLines(block.card, siteUrl)
    case "steps":
    case "order":
      return []
  }
}

/** 상담 내역 카드 — 결론 한 줄, 상담마다 한 줄(날짜·출처·상태·고객·요지), 조건·안내, 상담 화면 링크. 1:1 에서만 온다(단체방은 브리지가 막는다). */
function consultationLines(card: ConsultationsCard, siteUrl: string): string[] {
  const lines = [`**${plain(card.headline)}**`]
  for (const item of card.items) {
    const parts = [item.date ?? "날짜 없음", SOURCE_LABEL[item.source], item.status, item.who, item.summary].filter((part): part is string => Boolean(part))
    // 상담 하나를 여는 딥링크는 링크 관문(isAllowedAdminHref — 등록 화면 + 꼴 검사한 id)을 지난 것만.
    const link = item.href && isAllowedAdminHref(item.href) ? new URL(item.href, siteUrl).toString() : null
    lines.push(`- ${parts.map(plain).join(" · ")}${link ? ` [열기](${link})` : ""}`)
  }
  if (card.basis) lines.push(`조건: ${plain(card.basis)}`)
  if (card.note) lines.push(plain(card.note))
  const entry = card.openLinkId ? getLinkById(card.openLinkId) : undefined
  const open = entry?.audience === "internal" ? linkLine(entry.label, entry.href, siteUrl) : null
  if (open) lines.push(open)
  return lines
}

function orderLines(order: OrderTicket, siteUrl: string): string[] {
  const lines = [`**${plain(order.title)} 미리보기** — ${plain(order.target.label)}`]
  for (const field of order.fields.slice(0, 6)) lines.push(`- ${plain(field.label)}: ${plain(field.value)}`)
  if (order.amount) lines.push(`- ${plain(order.amount.label)}: ${order.amount.value.toLocaleString("ko-KR")}원`)
  lines.push(WRITE_NOT_HERE)
  const link = linkLine(order.server?.directLabel ?? "어드민에서 확인", order.server?.directHref, siteUrl)
  if (link) lines.push(link)
  return lines
}

function byteLength(value: string) {
  return Buffer.byteLength(value, "utf8")
}

/** 줄 목록을 상한 안으로 — 줄 단위로 자르고 마지막에 안내 줄. */
export function clampLines(lines: string[], maxChars = MAX_CHARS): string {
  const full = lines.join("\n")
  if (full.length <= maxChars && byteLength(full) <= MAX_BYTES) return full
  const kept: string[] = []
  let size = TRUNCATED_LINE.length + 1
  for (const line of lines) {
    const clipped = line.length > maxChars - size ? `${line.slice(0, Math.max(0, maxChars - size - 1))}…` : line
    if (size + clipped.length + 1 > maxChars) break
    kept.push(clipped)
    size += clipped.length + 1
    if (clipped !== line) break
  }
  kept.push(TRUNCATED_LINE)
  return kept.join("\n")
}

export function formatTurnMarkdown(input: { blocks: AiBlock[]; orders: OrderTicket[]; siteUrl: string; maxChars?: number }): string {
  // 상담 내역 카드는 늘 사내 자료다(상담 근거) — 내부용 줄을 단다. 사내 자료라고 표시한 조회 카드(고객 이력)도 같다.
  const internalOnly = input.blocks.some(
    (block) =>
      (block.kind === "answer" && isInternalOnlyAnswer(block.card)) ||
      block.kind === "consultations" ||
      (block.kind === "read" && block.card.internalOnly === true)
  )
  const lines: string[] = []
  if (internalOnly) lines.push(INTERNAL_ONLY_LINE)
  for (const block of input.blocks) {
    const part = blockLines(block, input.siteUrl).filter(Boolean)
    if (!part.length) continue
    if (lines.length && !(internalOnly && lines.length === 1)) lines.push("")
    lines.push(...part)
  }
  for (const order of input.orders) {
    if (lines.length) lines.push("")
    lines.push(...orderLines(order, input.siteUrl))
  }
  if (!lines.length) lines.push("답을 만들지 못했습니다. 잠시 뒤 다시 물어봐 주세요.")
  return clampLines(lines, input.maxChars ?? MAX_CHARS)
}
