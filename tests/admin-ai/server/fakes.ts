// 갈매봇 서버 시험용 가짜 자료 — DB·모델·네트워크 없음. 사람 이름·연락처·실제 고객 기관 없음.
import { vi } from "vitest"

import type { OrchestratorDeps } from "@/lib/admin-ai/server/orchestrator"
import type { OpsDeps } from "@/lib/admin-ai/server/tools"
import type { ContactCard as InternalContactCard } from "@/lib/internal-cs-chat/contact"
import type { InternalEvidenceParts } from "@/lib/internal-cs-chat/context"
import type { OpsActor } from "@/lib/ops-tools/actor"
import type { OpsToolDef, ReadToolDef, ToolArgs, WriteToolDef } from "@/lib/ops-tools/types"

const EMPTY: InternalEvidenceParts = { curated: [], incidents: [], publicDocs: [], internalDocs: [], publicAnswer: null, internalDraft: null }

/** 질문 낱말로 근거를 고른다. "근거없는주제" 가 들어 있으면 빈 근거. 주제별로 다른 문서를 준다(FAKE_DOCS). */
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
  const doc = FAKE_DOCS.find((entry) => entry.match.test(question)) ?? FAKE_DOCS[FAKE_DOCS.length - 1]
  return {
    ...EMPTY,
    publicDocs: [
      {
        kind: "public_doc",
        id: doc.id,
        title: doc.title,
        heading: "시작하기",
        summary: doc.summary,
        excerpt: doc.excerpt,
        urlPath: "/support",
        confirmed: true,
        customerUse: "allowed",
        asOf: null,
        sources: [{ id: doc.id, label: doc.title }],
      },
    ],
  }
}

/**
 * 질문 주제별 공개 문서(샘플). 근거 검색처럼 낱말로 고르되 주제마다 다른 글을 돌려준다 — 질문과 상관없이 늘 같은 문서를 주면
 * "결론이 질문에 대한 답인가"(검토 동작-1)를 시험이 잡지 못한다. 마지막 줄은 아무 주제에도 안 맞을 때의 일반 문서다.
 */
const FAKE_DOCS: ReadonlyArray<{ match: RegExp; id: string; title: string; summary: string; excerpt: string }> = [
  {
    match: /녹화/,
    id: "doc-recording",
    title: "수업 녹화 안내(샘플)",
    summary: "수업 녹화는 수업 설정 화면에서 켤 수 있습니다. 교사 계정으로 로그인해야 합니다.",
    excerpt: "수업 녹화는 수업 설정 화면에서 켤 수 있습니다. 교사 계정으로 로그인합니다. 수업 설정을 엽니다. 녹화 항목을 켭니다. 녹화 영상 삭제는 녹화 목록에서 합니다.",
  },
  {
    match: /화질|카메라/,
    id: "doc-camera",
    title: "카메라 화질 안내(샘플)",
    summary: "카메라 화질이 흐리면 장치 설정의 해상도를 먼저 확인합니다.",
    excerpt: "카메라 화질이 흐리면 장치 설정의 해상도를 먼저 확인합니다. 렌즈를 닦습니다. 조명을 확인합니다.",
  },
  {
    match: /입장|접속|링크/,
    id: "doc-join",
    title: "수업 입장 안내(샘플)",
    summary: "학생이 수업 링크로 입장이 안 되면 링크 만료와 앱 버전을 확인합니다.",
    excerpt: "학생이 수업 링크로 입장이 안 되면 링크 만료와 앱 버전을 확인합니다. 새 링크를 보냅니다. 앱을 다시 설치합니다.",
  },
  {
    match: /칠판|PDF|판서/i,
    id: "doc-board",
    title: "칠판 안내(샘플)",
    summary: "칠판에 PDF를 올리려면 칠판 도구의 파일 올리기를 누릅니다.",
    excerpt: "칠판에 PDF를 올리려면 칠판 도구의 파일 올리기를 누릅니다. 파일을 고릅니다. 올린 PDF는 페이지로 넘깁니다.",
  },
  {
    match: /설치|앱/,
    id: "doc-install",
    title: "앱 설치 안내(샘플)",
    summary: "앱 설치가 안 되면 운영체제 버전과 저장 공간을 먼저 확인합니다.",
    excerpt: "앱 설치가 안 되면 운영체제 버전과 저장 공간을 먼저 확인합니다. 설치 파일을 다시 받습니다.",
  },
  {
    match: /숙제|출석/,
    id: "doc-class",
    title: "숙제·출석 안내(샘플)",
    summary: "숙제는 수업 화면의 숙제 탭에서 보내고, 출석 체크는 수업 기록에서 봅니다.",
    excerpt: "숙제는 수업 화면의 숙제 탭에서 보냅니다. 출석 체크는 수업 기록에서 봅니다.",
  },
  {
    match: /계정/,
    id: "doc-account",
    title: "계정 안내(샘플)",
    summary: "교사 계정 추가는 기관 관리자 화면에서 합니다. 학생 계정도 같은 화면에서 만듭니다.",
    excerpt: "교사 계정 추가는 기관 관리자 화면에서 합니다. 학생 계정도 같은 화면에서 만듭니다.",
  },
  {
    match: /요금제|결제\s*수단|가격/,
    id: "doc-pricing",
    title: "요금제 안내(샘플)",
    summary: "요금제 차이와 결제 수단은 가격표 페이지에 있습니다.",
    excerpt: "요금제 차이와 결제 수단은 가격표 페이지에 있습니다. 결제 수단은 카드와 계좌 이체입니다.",
  },
  {
    match: /화면\s*공유|끊/,
    id: "doc-share",
    title: "화면 공유 안내(샘플)",
    summary: "화면 공유가 끊기면 네트워크 상태와 공유 권한을 확인합니다.",
    excerpt: "화면 공유가 끊기면 네트워크 상태와 공유 권한을 확인합니다. 다시 공유를 누릅니다.",
  },
  {
    match: /./,
    id: "doc-sample",
    title: "수업 기능 안내(샘플)",
    summary: "수업 설정 화면에서 켤 수 있습니다. 교사 계정으로 로그인해야 합니다.",
    excerpt: "수업 설정 화면에서 켤 수 있습니다. 교사 계정으로 로그인합니다. 수업 설정을 엽니다. 해당 항목을 켭니다.",
  },
]

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
    readDef("hw_movements", () => [
      { occurred_at: "2026-11-20", product_name: "T1 카메라", quantity: 2, status: "planned", movement_type: "outbound" },
      { occurred_at: "2026-10-30", product_name: "86형 보드", quantity: 1, status: "", movement_type: "inbound" },
    ]),
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
