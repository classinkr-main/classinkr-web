/**
 * 공용 운영 도구 정의의 꼴 — 홈 MCP(lib/mcp/tools.ts)와 이후 갈매봇이 같은 정의를 쓴다.
 *
 * 등급:
 * - R0 조회 — run 하나. 데이터를 바꾸지 않는다.
 * - R1 등록 — 되돌릴 수 있는 새 행만 만든다. run 이 없고 preview(쓰기 없음)와 execute 로 나뉜다.
 *   MCP 는 지금처럼 preview → execute 까지 한 번에 간다(호출하는 쪽 승인 창이 확인 단계다). 갈매봇은 preview 만 부르고
 *   execute 는 사람이 확인한 서버 경로에서만 부르게 할 준비다.
 *
 * 범위 확인·분당 상한·idempotency·가림·연락처 읽기 감사는 정의가 아니라 표면과 상관없는 실행기
 * lib/ops-tools/run.ts(runOpsTool·presentOpsResult)에 있다. 어느 표면이든 정의를 직접 부르지 말고 실행기를 거친다.
 * execute 는 preview 가 만든 plan 을 다시 검증하지 않는다 — plan 은 서버 안에서만 오가야 한다(클라이언트로 보냈다 받는
 * 구조라면 preview 를 서버에서 다시 계산해 비교한다).
 */
import type { OpsActor, OpsScope } from "@/lib/ops-tools/actor"

export type ToolArgs = Record<string, unknown>
export type OpsRisk = "R0" | "R1"

type ToolBase = {
  /** 레지스트리 안 고유 id(점 표기) */
  id: string
  /** MCP tools/list 에 나가는 이름 — 바꾸면 클라이언트 승인 설정이 깨진다 */
  mcpName: string
  title: string
  description: string
  /** 이 도구를 부르려면 있어야 하는 범위 */
  requiredScope: OpsScope
  inputSchema: Record<string, unknown>
}

export type ReadToolDef = ToolBase & {
  risk: "R0"
  run: (args: ToolArgs, actor: OpsActor) => Promise<unknown>
  /** 이 호출의 결과가 이미 공개된 글(공개 챗봇 답)이라 연락처를 가리지 않는가. 없으면 늘 가린다 */
  publicResult?: (args: ToolArgs, actor: OpsActor) => boolean
}

/** preview 결과 — plan 은 execute 에 그대로 넘기는 검증 끝난 입력, warnings 는 사람이 볼 경고 */
export type WritePreview<P> = { plan: P; summary: Record<string, unknown>; warnings: Record<string, unknown>[] }

/** idempotency — 도메인 행에 싣는 키 해시와 인자 지문(원문 키는 싣지 않는다) */
export type WriteExecuteMeta = { idempotency?: { keyHash: string; fingerprint: string } }

/** execute 결과 — output 은 호출자에게 그대로 가는 값(꼴은 바꾸기 전과 같다), auditFailure 는 감사 실패 코드(로그에만) */
export type WriteExecuteResult = {
  output: unknown
  auditFailure?: string
  /** 같은 키로 이미 만든 결과를 돌려줬다(동시 두 번째 호출이 유니크 제약·공용 저장소에서 처음 결과를 찾았다) — 로그 코드 replayed */
  replayed?: true
  /** 공용 저장소 없이 인스턴스 메모리로만 판정했다 — 응답(idempotency_scope)·로그에 표시한다 */
  idempotencyScope?: "instance_memory"
}

export type WriteToolDef<P = unknown> = ToolBase & {
  risk: "R1"
  /** 검증·조회·계산만 한다. DB 에 쓰지 않는다 */
  preview: (args: ToolArgs, actor: OpsActor) => Promise<WritePreview<P>>
  /** preview 가 만든 plan 으로 실제로 쓴다 */
  execute: (preview: WritePreview<P>, actor: OpsActor, meta: WriteExecuteMeta) => Promise<WriteExecuteResult>
  /**
   * 메모리 밖(도메인 표)에서 같은 키 해시로 이미 만든 결과와 그때의 인자 지문을 찾는다(없으면 null).
   * 키를 실을 칸이 없으면 두지 않는다
   */
  /**
   * 도메인 행에 키를 실을 칸이 없는 도구 — 공용 저장소(Upstash)에서 같은 키 동시 실행을 한 번으로 막는다
   * (lib/ops-tools/idempotency-store.ts). 저장소가 없으면 닫지 않고 인스턴스 메모리 판정으로 내려가 표시한다
   */
  sharedIdempotency?: boolean
  findExisting?: (actor: OpsActor, keyHash: string) => Promise<{ result: WriteExecuteResult; fingerprint: string | null } | null>
}

export type OpsToolDef = ReadToolDef | WriteToolDef

/** 정의를 레지스트리 배열에 담을 때 plan 타입을 지운다 */
export const defineWrite = <P>(def: WriteToolDef<P>): WriteToolDef => def as unknown as WriteToolDef

export const isWriteDef = (def: OpsToolDef): def is WriteToolDef => def.risk !== "R0"
