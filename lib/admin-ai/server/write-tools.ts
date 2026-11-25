import "server-only"

// 갈매봇 확인 경로가 찾는 쓰기 도구 표 — 견적 초안·HW 배송 예정 정의만 직접 import 한다.
// 공용 레지스트리(lib/ops-tools/registry)를 쓰지 않는 까닭: 레지스트리는 chatbot_ask(defs/site.ts)를 거쳐 공개 챗봇 서비스·모델
// 호출(lib/chatbot/service → lib/chatbot/llm)까지 끌고 온다. 확인 경로에는 모델이 없어야 한다(검토 안전-1, 모듈 그래프 시험:
// tests/admin-ai/server/writes-confirm.test.ts).
import { hwPlanMovement } from "@/lib/ops-tools/defs/hardware"
import { quoteCreateDraft } from "@/lib/ops-tools/defs/quotes"
import type { OpsToolDef } from "@/lib/ops-tools/types"

export const GALMAE_WRITE_TOOLS: readonly OpsToolDef[] = [quoteCreateDraft, hwPlanMovement]

const BY_MCP_NAME: ReadonlyMap<string, OpsToolDef> = new Map(GALMAE_WRITE_TOOLS.map((def) => [def.mcpName, def]))

export const getGalmaeWriteTool = (mcpName: string): OpsToolDef | undefined => BY_MCP_NAME.get(mcpName)
