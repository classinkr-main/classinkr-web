import "server-only"

/**
 * 공용 운영 도구 레지스트리 — 정의의 정본. 홈 MCP(lib/mcp/tools.ts)는 이 목록을 MCP 꼴로 내보내는 어댑터다.
 * 순서가 MCP tools/list 순서다(바꾸면 tests/mcp/fixtures/tools-list.before.json 대조가 깨진다).
 * 정의 꼴·등급은 lib/ops-tools/types.ts.
 */
import { hwMovements, hwPlanMovement, hwSales, hwStock } from "@/lib/ops-tools/defs/hardware"
import { dealsList, quoteCreateDraft, quoteGet, quotesList, quoteTemplates } from "@/lib/ops-tools/defs/quotes"
import { chatbotAsk, siteTraffic } from "@/lib/ops-tools/defs/site"
import type { OpsToolDef } from "@/lib/ops-tools/types"

export const OPS_TOOLS: readonly OpsToolDef[] = [
  hwStock,
  hwMovements,
  hwSales,
  dealsList,
  quotesList,
  quoteGet,
  quoteTemplates,
  chatbotAsk,
  siteTraffic,
  quoteCreateDraft,
  hwPlanMovement,
]

const BY_MCP_NAME = new Map(OPS_TOOLS.map((t) => [t.mcpName, t]))

export const getOpsToolByMcpName = (name: string): OpsToolDef | undefined => BY_MCP_NAME.get(name)
