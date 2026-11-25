import "server-only"

// 쓰기 확인 표(티켓) — DB 표 없이 가는 일회용 서명 표.
//
// 미리보기 때 {표 id, 도구, 인자, 인자 지문, 미리보기 요약 해시, 만료, 행위자}를 서버 비밀(ADMIN_AI_TICKET_SECRET)로
// HMAC-SHA256 서명해 카드에 싣는다. 확인 때 서명·만료(15분)·행위자 일치를 본다(역할 재검사·미리보기 대조·실행은 confirm.ts).
// 표는 한 번만 쓴다 — 확인 때 표 id 를 여러 서버가 함께 보는 저장소에 원자적으로 한 번만 적고(ticket-claims.ts), 이미 있으면
// 실행하지 않는다(confirm.ts, 409). 비밀이 없거나, 로컬 개발·시험이 아닌 곳에서 그 저장소가 없으면 표를 만들지 않는다(미리보기까지만, 카드는
// "화면에서 직접 등록" — readConfirmSetup 한 곳에서 판정).
// 표 안의 인자는 서명만 하고 암호화하지 않는다 — 그 사람이 방금 미리본 자기 인자다. 비밀·연락처 원문을 싣지 않는다.
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto"

import { fingerprintArgs } from "@/lib/ops-tools/guard"
import type { ToolArgs } from "@/lib/ops-tools/types"

export const TICKET_TTL_MS = 15 * 60 * 1000
export const TICKET_SECRET_ENV = "ADMIN_AI_TICKET_SECRET"
const MIN_SECRET_LENGTH = 32
const MAX_TICKET_LENGTH = 8000

export interface TicketPayload {
  v: 1
  /** 표 id — 확인 때 idempotency_key 로 쓴다. */
  jti: string
  /** 쓰기 도구 mcpName. */
  tool: string
  args: ToolArgs
  /** 인자 지문(lib/ops-tools/guard fingerprintArgs). */
  fp: string
  /** 미리보기 요약 해시 — 확인 때 다시 계산한 미리보기와 다르면 거절(금액·대상이 그사이 바뀜). */
  sh: string
  /** 만료 시각(ms). */
  exp: number
  /** 행위자 키(actor.ts staffKey). */
  sub: string
}

export type TicketError = "no_secret" | "malformed" | "bad_signature" | "expired" | "actor_mismatch"

/** 서명 비밀. 없거나 너무 짧으면 null — 쓰기는 미리보기까지만. */
export function readTicketSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env[TICKET_SECRET_ENV]?.trim()
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null
}

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url")
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body, "utf8").digest("base64url")

/** 미리보기 요약(summary)의 해시 — 키 순서와 상관없이 같은 값이면 같다. */
export function summaryHash(summary: unknown): string {
  return fingerprintArgs({ summary } as ToolArgs).slice(0, 32)
}

export function issueTicket(
  input: { tool: string; args: ToolArgs; summary: unknown; sub: string },
  secret: string,
  now: number = Date.now()
): { ticket: string; payload: TicketPayload } {
  const payload: TicketPayload = {
    v: 1,
    jti: randomUUID(),
    tool: input.tool,
    args: input.args,
    fp: fingerprintArgs(input.args),
    sh: summaryHash(input.summary),
    exp: now + TICKET_TTL_MS,
    sub: input.sub,
  }
  const body = b64url(JSON.stringify(payload))
  return { ticket: `${body}.${sign(body, secret)}`, payload }
}

function isPayload(value: unknown): value is TicketPayload {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    v.v === 1 &&
    typeof v.jti === "string" &&
    typeof v.tool === "string" &&
    Boolean(v.args) &&
    typeof v.args === "object" &&
    !Array.isArray(v.args) &&
    typeof v.fp === "string" &&
    typeof v.sh === "string" &&
    typeof v.exp === "number" &&
    typeof v.sub === "string"
  )
}

export function verifyTicket(
  ticket: unknown,
  secret: string | null,
  expectedSub: string,
  now: number = Date.now()
): { ok: true; payload: TicketPayload } | { ok: false; error: TicketError } {
  if (!secret) return { ok: false, error: "no_secret" }
  if (typeof ticket !== "string" || ticket.length > MAX_TICKET_LENGTH) return { ok: false, error: "malformed" }
  const [body, signature, extra] = ticket.split(".")
  if (!body || !signature || extra !== undefined) return { ok: false, error: "malformed" }
  const expected = Buffer.from(sign(body, secret))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, error: "bad_signature" }
  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return { ok: false, error: "malformed" }
  }
  if (!isPayload(payload)) return { ok: false, error: "malformed" }
  // 서명된 인자 지문과 인자가 맞는지(서명이 있으니 다를 수 없지만, 지문 계산이 바뀌면 거절한다).
  if (fingerprintArgs(payload.args) !== payload.fp) return { ok: false, error: "malformed" }
  if (now >= payload.exp) return { ok: false, error: "expired" }
  const a = createHash("sha256").update(payload.sub).digest()
  const b = createHash("sha256").update(expectedSub).digest()
  if (!timingSafeEqual(a, b)) return { ok: false, error: "actor_mismatch" }
  return { ok: true, payload }
}

export const TICKET_ERROR_TEXT: Record<TicketError, string> = {
  no_secret: "확인 서명 설정이 없어 여기서 실행할 수 없습니다. 화면에서 직접 등록해 주세요.",
  malformed: "확인 표가 올바르지 않습니다. 다시 요청해 주세요.",
  bad_signature: "확인 표의 서명이 맞지 않습니다. 다시 요청해 주세요.",
  expired: "확인 시간(15분)이 지났습니다. 다시 요청해 주세요.",
  actor_mismatch: "다른 계정이 만든 오더입니다. 본인이 다시 요청해 주세요.",
}
