/**
 * 운영 도구(lib/ops-tools)를 부르는 행위자와 권한 범위(scope).
 *
 * 순수 모듈이다(I/O·server-only 없음) — MCP 토큰 해석(lib/mcp/server.ts)과 도구 레지스트리가 같이 쓴다.
 * 범위 뜻(운영 문서: docs/active/home-mcp-operations.md):
 * - read        조회 도구 전부
 * - write:quote 견적 초안 만들기
 * - write:hw    HW 배송 예정 등록
 * - internal    chatbot_ask 의 내부 CS 문서 근거(internal=true)
 * - pii         조회 결과의 사람 연락처(전화·이메일) 원문 — 없으면 가린다
 */

export const OPS_SCOPES = ["read", "write:quote", "write:hw", "internal", "pii"] as const
export type OpsScope = (typeof OPS_SCOPES)[number]

/**
 * 옛 형식(`이름:토큰`) 토큰이 받는 범위 — 넓힌 형식이 생기기 전과 같은 권한(읽기·쓰기 둘·내부 문서·연락처 원문).
 * pii 를 넣어 연락처를 가리지 않는다: 조회한 연락처를 그대로 다음 쓰기 인자로 넘기던 흐름이 전처럼 돈다(호환 조정).
 * 가림은 넓힌 형식 토큰에 pii 범위가 없을 때만 적용된다.
 */
export const LEGACY_SCOPES: readonly OpsScope[] = ["read", "write:quote", "write:hw", "internal", "pii"]

export type OpsActor = {
  /** 토큰 줄의 이름 — 감사·로그에 `mcp:<이름>` 으로 남는다 */
  name: string
  scopes: readonly OpsScope[]
  /** 넓힌 형식 토큰에 적힌 어드민 계정 이메일(감사 payload 에만 싣는다) */
  adminEmail?: string
  /** 옛 형식 토큰으로 왔는가 — 로그 줄에 legacy=1 */
  legacy: boolean
}

export const isOpsScope = (v: string): v is OpsScope => (OPS_SCOPES as readonly string[]).includes(v)

export const hasScope = (actor: Pick<OpsActor, "scopes">, scope: OpsScope) => actor.scopes.includes(scope)

/** 감사 기록·생성 행의 created_by 에 쓰는 이름 */
export const actorDisplayName = (actor: Pick<OpsActor, "name">) => `mcp:${actor.name}`
