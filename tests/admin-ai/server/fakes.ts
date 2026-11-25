// 갈매봇 서버 시험용 가짜 자료 — DB·모델·네트워크 없음. 사람 이름·연락처·실제 고객 기관 없음.
import { vi } from "vitest"

import type { OrchestratorDeps } from "@/lib/admin-ai/server/orchestrator"
import type { OpsDeps } from "@/lib/admin-ai/server/tools"
import type { ContactCard as InternalContactCard } from "@/lib/internal-cs-chat/contact"
import type { InternalEvidenceParts } from "@/lib/internal-cs-chat/context"
import type { OpsActor } from "@/lib/ops-tools/actor"
import type { OpsToolDef, ReadToolDef, ToolArgs, WriteToolDef } from "@/lib/ops-tools/types"

const EMPTY: InternalEvidenceParts = { curated: [], incidents: [], publicDocs: [], internalDocs: [], publicAnswer: null, internalDraft: null }

/** 질문 낱말로 근거를 고른다. "근거없는주제" 가 들어 있으면 빈 근거. */
export function fakeEvidence(question: string): InternalEvidenceParts {
  if (/근거없는주제|우주선/.test(question)) return EMPTY
  if (/환불|할인|정책|규정|승인/.test(question)) {
    return {
      ...EMPTY,
      curated: [
        {
          kind: "curated",
          id: "policy-sample",
          title: "할인·환불 처리 원칙(샘플)",
          summary: "할인과 환불은 지사장 승인 뒤에 처리합니다. 승인 전에는 고객에게 확정해 말하지 않습니다.",
          status: "hq_confirmation_required",
          externalUse: "confirmation_required",
          handling: ["견적 화면에서 할인 사유를 적는다", "지사장 승인을 받는다", "승인 뒤 고객에게 안내한다"],
          recommendedTags: [],
          confirmed: false,
          customerUse: "confirm_first",
          asOf: "2026-10-01",
          sources: [{ id: "docs/sample-policy-2026-10-01.md", label: "샘플 정책 문서" }],
        },
      ],
    }
  }
  return {
    ...EMPTY,
    publicDocs: [
      {
        kind: "public_doc",
        id: "doc-sample",
        title: "수업 기능 안내(샘플)",
        heading: "시작하기",
        summary: "수업 설정 화면에서 켤 수 있습니다. 교사 계정으로 로그인해야 합니다.",
        excerpt: "수업 설정 화면에서 켤 수 있습니다. 교사 계정으로 로그인합니다. 수업 설정을 엽니다. 해당 항목을 켭니다.",
        urlPath: "/support",
        confirmed: true,
        customerUse: "allowed",
        asOf: null,
        sources: [{ id: "doc-sample", label: "수업 기능 안내(샘플)" }],
      },
    ],
  }
}

export function fakeInternalContact(question: string): InternalContactCard {
  return {
    kind: /카메라|화질|녹화/.test(question) ? "hq" : "kr",
    who: "역할 담당(샘플)",
    backup: "지사장(샘플)",
    prepare: ["질문 요지 한 줄"],
    channel: { label: "사내 메신저(샘플)", href: null },
    evidence: [],
    verifiedAt: "2026-10-01",
    reason: "샘플 담당표",
    alternatives: [],
    gaps: [],
  }
}

const SAMPLE_STOCK = {
  totals: { availableStock: 12 },
  stock: [
    { itemId: "item-t1", product: "T1 카메라", category: "카메라", availableStock: 7, warehouseStock: 9, plannedOut: 2, low: false, orderRecommended: false },
    { itemId: "item-86", product: "86형 보드", category: "보드", availableStock: 5, warehouseStock: 5, plannedOut: 0, low: true, orderRecommended: false },
  ],
  alerts: [],
}

function readDef(mcpName: string, run: (args: ToolArgs) => unknown): ReadToolDef {
  return { id: `fake.${mcpName}`, mcpName, risk: "R0", requiredScope: "read", title: mcpName, description: "", inputSchema: {}, run: async (args) => run(args) }
}

export function fakeOps() {
  const execute = vi.fn(async () => ({ output: { id: "new-row" } }))
  const preview = vi.fn(async (args: ToolArgs) => {
    if (args.template_id) {
      return { plan: {}, summary: { deal_id: args.deal_id, customer: "가온학원(샘플)", template_id: args.template_id, subtotal: 1_000_000, vat: 100_000, total: 1_100_000 }, warnings: [] }
    }
    return { plan: {}, summary: { item_id: "item-t1", product: "T1 카메라", quantity: args.quantity, planned_date: args.planned_date, to: args.customer, outbound_type: "sales", status: "planned" }, warnings: [] }
  })
  const writeDef = (mcpName: string, scope: "write:quote" | "write:hw"): WriteToolDef => ({
    id: `fake.${mcpName}`,
    mcpName,
    risk: "R1",
    requiredScope: scope,
    title: mcpName,
    description: "",
    inputSchema: {},
    preview: (args) => preview(args),
    execute,
  })
  const defs: OpsToolDef[] = [
    readDef("hw_stock", (args) => ({
      ...SAMPLE_STOCK,
      stock: SAMPLE_STOCK.stock.filter((row) => !args.query || row.product.toLowerCase().includes(String(args.query).toLowerCase())),
    })),
    readDef("hw_movements", () => [{ occurred_at: "2026-11-20", product_name: "T1 카메라", quantity: 2, status: "planned" }]),
    readDef("hw_sales", () => ({ fy: 2026, grandTotal: { total: { installed: 40, planned: 3 } }, groups: [] })),
    readDef("deals_list", () => [{ customer_name: "가온학원(샘플)", title: "녹화 세트", stage: "proposal", owner: "담당 A" }]),
    readDef("quotes_list", () => [{ document_number: "Q-1", customer_name: "가온학원(샘플)", status: "draft", total_amount: 1_100_000, contact_phone: "010-1234-5678" }]),
    readDef("quote_templates", () => [
      { template_id: "camera_t1", label: "T1 카메라" },
      { template_id: "studio_l", label: "올인원 녹화수업 세트 L" },
    ]),
    readDef("site_traffic", () => ({ totals: { visitors: 321, pageViews: 999 } })),
    writeDef("quote_create_draft", "write:quote"),
    writeDef("hw_plan_movement", "write:hw"),
  ]
  const byName = new Map(defs.map((d) => [d.mcpName, d]))
  const run = vi.fn(async (def: OpsToolDef, args: ToolArgs, actor: OpsActor) => {
    if (def.risk !== "R0") throw new Error("write through run is not allowed in chat")
    if (!actor.scopes.includes(def.requiredScope)) throw new Error("scope")
    return { value: await def.run(args, actor) }
  })
  const ops: OpsDeps = {
    getTool: (name) => byName.get(name),
    run,
    present: async (_def, _args, _actor, value) => ({ value }),
    preview: async (def, args, actor) => {
      if (def.risk !== "R1") throw new Error("not write")
      return def.preview(args, actor)
    },
    describeError: async () => "샘플 오류",
  }
  return { ops, run, preview, execute, defs }
}

export const STAFF_ACTOR: OpsActor = { name: "galmae-staff-1", scopes: ["read", "write:quote", "write:hw"], legacy: false }

export function fakeDeps(overrides: Partial<OrchestratorDeps> = {}) {
  const fake = fakeOps()
  const deps: OrchestratorDeps = {
    knowledge: { evidence: async (q) => fakeEvidence(q) },
    resolveContact: async (q) => fakeInternalContact(q),
    ops: fake.ops,
    model: null,
    ...overrides,
  }
  return { deps, ...fake }
}
