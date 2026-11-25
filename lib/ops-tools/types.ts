/**
 * 공용 운영 도구 정의의 꼴 — 홈 MCP(lib/mcp/tools.ts)와 이후 갈매봇이 같은 정의를 쓴다.
 *
 * 등급:
 * - R0 조회 — run 하나. 데이터를 바꾸지 않는다.
 * - R1 등록 — 되돌릴 수 있는 새 행만 만든다. run 이 없고 preview(쓰기 없음)와 execute 로 나뉜다.
 *   MCP 는 지금처럼 preview → execute 까지 한 번에 간다(호출하는 쪽 승인 창이 확인 단계다). 갈매봇은 preview 만 부르고
 *   execute 는 사람이 확인한 서버 경로에서만 부르게 할 준비다.
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
}

/** preview 결과 — plan 은 execute 에 그대로 넘기는 검증 끝난 입력, warnings 는 사람이 볼 경고 */
export type WritePreview<P> = { plan: P; summary: Record<string, unknown>; warnings: Record<string, unknown>[] }

export type WriteExecuteMeta = { idempotencyKey?: string }

export type WriteToolDef<P = unknown> = ToolBase & {
  risk: "R1"
  /** 검증·조회·계산만 한다. DB 에 쓰지 않는다 */
  preview: (args: ToolArgs, actor: OpsActor) => Promise<WritePreview<P>>
  /** preview 가 만든 plan 으로 실제로 쓴다 */
  execute: (preview: WritePreview<P>, actor: OpsActor, meta: WriteExecuteMeta) => Promise<unknown>
  /** 메모리 밖(도메인 표)에서 같은 idempotency_key 로 이미 만든 결과를 찾는다. 키를 실을 칸이 없으면 두지 않는다 */
  findExisting?: (actor: OpsActor, key: string) => Promise<unknown | null>
}

export type OpsToolDef = ReadToolDef | WriteToolDef

/** 정의를 레지스트리 배열에 담을 때 plan 타입을 지운다 */
export const defineWrite = <P>(def: WriteToolDef<P>): WriteToolDef => def as unknown as WriteToolDef

export const isWriteDef = (def: OpsToolDef): def is WriteToolDef => def.risk !== "R0"
