import { describe, expect, it } from "vitest"

import {
  buildAliasIndex,
  buildInventoryIndex,
  buildUnitIndex,
  cardUnitSentences,
  classifyRow,
  filterByArea,
  idsFromCard,
  isNotFoundEquivalentCard,
  legacyIds,
  normalizeHeading,
  parseAreaFilter,
  readAnswerKeys,
  readInventory,
  readUnits,
  rejectIdsFromCard,
  summarizeNodoc,
  summarizeProxy,
  summarizeTop1,
  traceTop1CardId,
  withinKeyRange,
  type AnswerKey,
  type CardRecord,
  type ProxyContext,
  type ProxyEvalRow,
} from "@/scripts/answer-index/proxy-eval"

// 대리 점수(답 색인 사양 §2.4 끝): 측정 줄을 옛 답 id·unit id 로 바꿔 정답 키(§4.2)와 대조한다.

const units = readUnits({
  units: [
    { unitId: "doc:/docs/teacher/course-members#4", kind: "section", path: "/docs/teacher/course-members", heading: "4. 구성원 삭제" },
    { unitId: "doc:/docs/teacher/course-members#summary", kind: "summary", path: "/docs/teacher/course-members", heading: null },
    { unitId: "doc:/docs/software/classroom-tools#5", kind: "section", path: "/docs/software/classroom-tools", heading: "학생 내보내기" },
  ],
})

const inventory = readInventory({
  answers: [
    { answerId: "svc:showroom", text: ["쇼룸은 서울에 있고 방문 전에 예약이 필요해요.", "아래 버튼으로 신청해 주세요."] },
    { answerId: "svc:showroom-short", text: "쇼룸은 서울에 있어요." },
    { answerId: "basics:basics-contact-channel", text: "상담은 문의 페이지에서 남기실 수 있어요.\n\n둘째 문단" },
  ],
})

// I2 inventory.json 꼴({ entries: [{ id, text, textAlternatives, gateOriginal }] })
const entriesInventory = readInventory({
  entries: [
    { id: "svc:academy-payment", text: "학원 결제 기능은 상담에서 안내해 드려요.", gateOriginal: "policy:academy-payment" },
    { id: "svc:migration", text: "기존 자료를 옮기는 방법은 담당자가 안내해 드려요.", gateOriginal: "service", textAlternatives: ["옮길 자료가 많으면 담당자가 일정을 같이 잡아 드려요."] },
    { id: "svc:double-charge", text: "결제가 두 번 됐다면 상담으로 확인해 드려요.", gateOriginal: "service" },
    { id: "template:/docs/start/positioning#getIdentityAnswer", text: "클래스인은 학원 수업과 운영을 한곳에서 하는 도구예요.", gateOriginal: null },
  ],
})

const cards = new Map<string, CardRecord>([
  [
    "doc:/docs/teacher/course-members#4/remove-member",
    {
      id: "doc:/docs/teacher/course-members#4/remove-member",
      kind: "doc",
      answer: { sentences: [{ unit: "doc:/docs/teacher/course-members#4" }] },
      provenance: { legacyIds: [] },
    },
  ],
  [
    "fixed:basics-billing-unit",
    {
      id: "fixed:basics-billing-unit",
      kind: "fixed",
      answer: { curatedRef: { module: "basics", id: "basics-billing-unit" } },
      provenance: { legacyIds: ["basics:basics-billing-unit"] },
    },
  ],
  ["howto:recording-missing", { id: "howto:recording-missing", kind: "howto", answer: { symptomTopic: "recording-missing" } }],
])

const context: ProxyContext = { units: buildUnitIndex(units), inventory: buildInventoryIndex(inventory), cards }

const legacy = (extra: Partial<ProxyEvalRow>): ProxyEvalRow => ({
  id: "q1",
  router: "legacy",
  answer: "답",
  answerMode: "direct_answer",
  unresolved: false,
  sources: [],
  decidedBy: "unknown",
  gateOriginal: null,
  ...extra,
})

const compiled = (decision: string, extra: Record<string, unknown> = {}): ProxyEvalRow => {
  const answerIndex = { router: "compiled", scope: "in", decision, top: [{ id: "doc:/docs/teacher/course-members#4/remove-member" }], ...extra }
  return { id: "q1", router: "compiled", answer: "답", answerMode: "direct_answer", sources: [], decidedBy: "index:?", answerIndex }
}

const key = (extra: Partial<AnswerKey> = {}): AnswerKey => ({ id: "q1", accept: [], partialAccept: [], nodoc: false, clarifyOk: false, ...extra })

describe("legacy decidedBy → id", () => {
  it("field·basics·guide·self·template 는 그대로", () => {
    expect(legacyIds(legacy({ decidedBy: "basics:basics-billing-unit" }), context)).toEqual(["basics:basics-billing-unit"])
    expect(legacyIds(legacy({ decidedBy: "field:logo-usage" }), context)).toEqual(["field:logo-usage"])
    expect(legacyIds(legacy({ decidedBy: "guide:late-joiner-replay" }), context)).toEqual(["guide:late-joiner-replay"])
    expect(legacyIds(legacy({ decidedBy: "self:intro" }), context)).toEqual(["self:intro"])
    expect(legacyIds(legacy({ decidedBy: "template:체험·파일럿 확인" }), context)).toEqual(["template:체험·파일럿 확인"])
  })

  it("symptom 은 gateOriginal 의 주제 id 를 쓴다", () => {
    expect(legacyIds(legacy({ decidedBy: "symptom", gateOriginal: "symptom:recording-missing" }), context)).toEqual([
      "symptom:recording-missing",
    ])
    expect(legacyIds(legacy({ decidedBy: "symptom", gateOriginal: "symptom:triage" }), context)).toEqual([])
  })

  it("service 처럼 id 가 없는 답은 inventory 첫 문단으로 찾고, 가장 긴 첫 문단을 고른다", () => {
    const row = legacy({ decidedBy: "service", answer: "좋은 질문이에요.\n\n쇼룸은 서울에 있고 방문 전에   예약이 필요해요.\n\n끝" })
    expect(legacyIds(row, context)).toEqual(["svc:showroom"])
    expect(legacyIds(legacy({ decidedBy: "policy", answer: "다른 답" }), context)).toEqual([])
  })

  it("I2 inventory 꼴: 관문 출처 이름이 한 답에만 쓰이면 그 답, 아니면 답 글(갈래 글 포함)로 찾는다", () => {
    const ctx: ProxyContext = { ...context, inventory: buildInventoryIndex(entriesInventory) }
    expect(legacyIds(legacy({ decidedBy: "policy:academy-payment", answer: "다른 글" }), ctx)).toEqual(["svc:academy-payment"])
    expect(legacyIds(legacy({ decidedBy: "service", answer: "옮길 자료가 많으면 담당자가 일정을 같이 잡아 드려요." }), ctx)).toEqual([
      "svc:migration",
    ])
    expect(legacyIds(legacy({ decidedBy: "service", answer: "다른 글" }), ctx)).toEqual([])
  })

  it("inventory 답 글의 자리표시({NAME}) 사이 글만 순서대로 맞춘다", () => {
    const index = buildInventoryIndex(
      readInventory({ entries: [{ id: "svc:showroom", text: "예약은 최소 {MIN_DAYS}영업일 전에 해 주셔야 하고 상담은 {MINUTES}분이에요." }] })
    )
    expect(index.match("안내드려요.\n\n예약은 최소 2영업일 전에 해 주셔야 하고 상담은 60분이에요.")).toEqual(["svc:showroom"])
    expect(index.match("상담은 60분이에요. 예약은 최소 2영업일 전에 해 주셔야 하고")).toEqual([])
  })

  it("inventory 에 없는 이름의 틀 답은 답 글로도 찾는다(함수로 만드는 틀 답)", () => {
    const ctx: ProxyContext = { ...context, inventory: buildInventoryIndex(entriesInventory) }
    const row = legacy({ decidedBy: "template:핵심 포지셔닝", answer: "클래스인은 학원 수업과 운영을 한곳에서 하는 도구예요.\n\n더 보기" })
    expect(legacyIds(row, ctx)).toEqual(["template:핵심 포지셔닝", "template:/docs/start/positioning#getIdentityAnswer"])
  })

  it("근거 선별 답은 출처(경로·절 제목) 전부를 unit id 로 바꾼다", () => {
    const row = legacy({
      decidedBy: "evidence_select",
      sources: [
        { path: "/docs/teacher/course-members/", heading: "4. 구성원  삭제" },
        { path: "/docs/teacher/course-members", heading: "요약" },
        { path: "/docs/none", heading: "없음" },
      ],
    })
    expect(legacyIds(row, context)).toEqual(["unit:doc:/docs/teacher/course-members#4", "unit:doc:/docs/teacher/course-members#summary"])
    expect(normalizeHeading("4. 구성원 삭제")).toBe(normalizeHeading("구성원 삭제"))
  })

  it("검색 조각 초안·틀 답은 첫 출처만, 정해 둔 답에 붙은 출처는 쓰지 않는다", () => {
    const sources = [
      { path: "/docs/software/classroom-tools", heading: "학생 내보내기" },
      { path: "/docs/teacher/course-members", heading: "4. 구성원 삭제" },
    ]
    expect(legacyIds(legacy({ decidedBy: "draft", sources }), context)).toEqual(["unit:doc:/docs/software/classroom-tools#5"])
    expect(legacyIds(legacy({ decidedBy: "template:학생 내보내기", sources }), context)).toEqual([
      "template:학생 내보내기",
      "unit:doc:/docs/software/classroom-tools#5",
    ])
    expect(legacyIds(legacy({ decidedBy: "basics:basics-billing-unit", sources }), context)).toEqual(["basics:basics-billing-unit"])
  })
})

describe("판정", () => {
  it("legacy 답: accept 면 good, partialAccept 면 partial, 아니면 wrong", () => {
    const row = legacy({ decidedBy: "basics:basics-billing-unit" })
    expect(classifyRow(row, key({ accept: ["basics:basics-billing-unit"] }), context)).toMatchObject({
      route: "legacy",
      verdict: "good",
      matched: ["basics:basics-billing-unit"],
    })
    expect(classifyRow(row, key({ partialAccept: ["basics:basics-billing-unit"] }), context).verdict).toBe("partial")
    expect(classifyRow(row, key({ accept: ["basics:other"] }), context).verdict).toBe("wrong")
  })

  it("legacy 못 찾음: nodoc 이면 nf_ok, 아니면 nf_doc_has. 예전 파일의 출처 없는 못 찾음(policy)도 알아본다", () => {
    const notFound = legacy({ decidedBy: "not_found", answerMode: "doc_suggestion", unresolved: true })
    expect(classifyRow(notFound, key({ nodoc: true }), context).verdict).toBe("nf_ok")
    expect(classifyRow(notFound, key({ accept: ["unit:doc:/docs/x#1"] }), context).verdict).toBe("nf_doc_has")
    const oldFormat = legacy({ router: undefined, decidedBy: "policy", answerMode: "fallback", unresolved: true, sources: [] })
    expect(classifyRow(oldFormat, key({ nodoc: true }), context)).toMatchObject({ kind: "not_found", verdict: "nf_ok" })
    // 새 결과 파일은 측정 스크립트가 못 찾음을 not_found 로 적으므로 policy 줄을 못 찾음으로 짐작하지 않는다.
    expect(classifyRow({ ...oldFormat, router: "legacy" }, key({ nodoc: true }), context).kind).toBe("answer")
  })

  it("되묻기: clarifyOk 면 good, 아니면 needless_clarify", () => {
    const row = legacy({ decidedBy: "policy", answerMode: "clarifying_question" })
    expect(classifyRow(row, key({ clarifyOk: true }), context).verdict).toBe("good")
    expect(classifyRow(row, key(), context).verdict).toBe("needless_clarify")
  })

  it("id 를 못 만든 답은 wrong 이고 unmapped 로 표시한다. 키가 없으면 점수에서 뺀다", () => {
    const row = legacy({ decidedBy: "unknown", answer: "아무 답" })
    expect(classifyRow(row, key({ nodoc: true }), context)).toMatchObject({ verdict: "wrong", unmapped: true })
    expect(classifyRow(row, undefined, context).verdict).toBeNull()
  })

  it("측정 오류 줄은 wrong", () => {
    expect(classifyRow(legacy({ answer: null }), key({ nodoc: true }), context)).toMatchObject({ kind: "error", verdict: "wrong" })
  })
})

describe("compiled 줄", () => {
  it("고른 카드의 sentences[].unit 으로 대조한다", () => {
    const result = classifyRow(compiled("answer"), key({ accept: ["unit:doc:/docs/teacher/course-members#4"] }), context)
    expect(result).toMatchObject({ route: "compiled", decidedBy: "index:doc:/docs/teacher/course-members#4/remove-member", verdict: "good" })
  })

  it("provenance.legacyIds·curatedRef·symptomTopic 으로 대조한다", () => {
    expect(idsFromCard(cards.get("fixed:basics-billing-unit") as CardRecord)).toEqual(["basics:basics-billing-unit"])
    expect(idsFromCard(cards.get("howto:recording-missing") as CardRecord)).toEqual(["symptom:recording-missing"])
    expect(idsFromCard({ id: "x", answer: { curatedRef: { module: "service", id: "showroom" } } })).toEqual(["svc:showroom"])
    expect(idsFromCard({ id: "y", answer: { guide: "course-member-management" } })).toEqual([
      "guide:course-member-management",
      "unit:guide:course-member-management",
    ])
    const row = compiled("answer", { cardId: "fixed:basics-billing-unit" })
    expect(classifyRow(row, key({ accept: ["basics:basics-billing-unit"] }), context).verdict).toBe("good")
  })

  it("답한 조각의 카드도 함께 본다", () => {
    const row = compiled("answer", {
      segments: [
        { decision: "answer", top: [{ id: "doc:/docs/teacher/course-members#4/remove-member" }] },
        { kind: "answer", card: "howto:recording-missing", conf: 0.8, text: "녹화" },
      ],
    })
    const result = classifyRow(row, key({ accept: ["symptom:recording-missing"] }), context)
    expect(result.verdict).toBe("good")
    expect(result.ids).toEqual(["unit:doc:/docs/teacher/course-members#4", "symptom:recording-missing"])
  })

  it("gap·abstain 은 못 찾음, clarify 는 되묻기", () => {
    expect(classifyRow(compiled("gap", { top: [{ id: "gap:support/phone-hours" }] }), key({ nodoc: true }), context)).toMatchObject({
      kind: "not_found",
      verdict: "nf_ok",
    })
    expect(classifyRow(compiled("abstain"), key({ accept: ["basics:x"] }), context).verdict).toBe("nf_doc_has")
    expect(classifyRow(compiled("clarify"), key(), context).verdict).toBe("needless_clarify")
  })

  it("카드 자료에 없는 카드는 id 를 못 만든 답", () => {
    const result = classifyRow(compiled("answer", { cardId: "doc:missing" }), key({ accept: ["basics:x"] }), context)
    expect(result).toMatchObject({ verdict: "wrong", unmapped: true })
    expect(result.reason).toMatch(/doc:missing/)
  })

  it("범위 밖(scope=out) 줄은 legacy 로 대조한다", () => {
    const row = { ...compiled("answer", { scope: "out" }), decidedBy: "basics:basics-billing-unit" }
    expect(classifyRow(row, key({ accept: ["basics:basics-billing-unit"] }), context)).toMatchObject({ route: "legacy", verdict: "good" })
  })
})

describe("요약", () => {
  it("키 있는 줄만 점수에 넣고 경로별·사각지대 수를 낸다", () => {
    const results = [
      classifyRow(legacy({ id: "a", decidedBy: "basics:x" }), { id: "a", accept: ["basics:x"] }, context),
      classifyRow({ ...compiled("abstain"), id: "b" }, { id: "b", nodoc: true }, context),
      classifyRow(legacy({ id: "c", decidedBy: "unknown", answer: "?" }), { id: "c" }, context),
      classifyRow(legacy({ id: "d" }), undefined, context),
    ]
    const summary = summarizeProxy(results, 4)
    expect(summary).toMatchObject({ n: 3, rows: 4, missingKey: 1, keysWithoutRow: 1, unmapped: 1 })
    expect(summary.score).toBeCloseTo((2 / 3) * 100, 1)
    expect(summary.byRoute.legacy?.n).toBe(2)
    expect(summary.byRoute.compiled?.n).toBe(1)
  })

  it("정답 키 파일을 읽는다", () => {
    const parsed = readAnswerKeys({ set: "dev5", keys: [{ id: "dev5-parent-16", accept: ["basics:basics-contact-channel"], nodoc: true }] })
    expect(parsed.set).toBe("dev5")
    expect(parsed.keys[0]).toEqual({ id: "dev5-parent-16", accept: ["basics:basics-contact-channel"], partialAccept: [], nodoc: true, clarifyOk: false })
  })
})

describe("정답 키의 reject·영역·1위 카드", () => {
  it("reject 의 id 가 답 id 에 있으면 accept 보다 앞서 wrong 이다", () => {
    const row = legacy({ decidedBy: "basics:basics-max-participants" })
    const rejected = classifyRow(row, key({ accept: ["basics:basics-max-participants"], reject: ["basics:basics-max-participants"] }), context)
    expect(rejected).toMatchObject({ verdict: "wrong", rejected: ["basics:basics-max-participants"], matched: ["basics:basics-max-participants"] })
    expect(rejected.reason).toContain("reject")
    // partialAccept 보다도 앞선다. reject 에 없는 답은 그대로 accept 로 맞는다.
    expect(classifyRow(row, key({ partialAccept: ["basics:basics-max-participants"], reject: ["basics:basics-max-participants"] }), context).verdict).toBe("wrong")
    expect(classifyRow(row, key({ accept: ["basics:basics-max-participants"], reject: ["basics:other"] }), context).verdict).toBe("good")
    // compiled 카드의 id(legacyIds·curatedRef)로도 본다.
    const compiledRow = compiled("answer", { cardId: "fixed:basics-billing-unit" })
    expect(classifyRow(compiledRow, key({ accept: ["basics:basics-billing-unit"], reject: ["basics:basics-billing-unit"] }), context).verdict).toBe("wrong")
    // 못 찾음·되묻기에는 reject 가 상관없다.
    const notFound = legacy({ decidedBy: "not_found", answerMode: "doc_suggestion", unresolved: true })
    expect(classifyRow(notFound, key({ nodoc: true, reject: ["basics:x"] }), context).verdict).toBe("nf_ok")
  })

  it("compiled 카드의 reject 는 카드가 실제로 내는 글의 id 로만 본다(FIX·CONVERT 의 provenance 는 출처일 뿐)", () => {
    const legacyText = "상담은 문의 페이지에서 남기실 수 있어요.\n\n둘째 문단"
    const extraCards = new Map<string, CardRecord>([
      ...cards,
      [
        // 문서 문장으로 바꾼 카드(CONVERT): provenance 에 옛 답이 있어도 글은 문서 문장이다.
        "doc:/docs/teacher/course-members#4/converted",
        {
          id: "doc:/docs/teacher/course-members#4/converted",
          kind: "doc",
          answer: { sentences: [{ unit: "doc:/docs/teacher/course-members#4" }] },
          provenance: { legacyIds: ["basics:basics-contact-channel"] },
        },
      ],
      // 점검에서 고친 글(FIX): 옛 답 글과 다르다.
      ["fixed:contact-fixed", { id: "fixed:contact-fixed", kind: "fixed", answer: { text: "상담은 문의 페이지나 대표 전화로 남기실 수 있어요." }, provenance: { legacyIds: ["basics:basics-contact-channel"] } }],
      // 결정 전 policy 카드: 옛 답 글 그대로(공백만 다름).
      ["policy:contact", { id: "policy:contact", kind: "policy", answer: { text: legacyText.replace("\n\n", "\n") }, provenance: { legacyIds: ["basics:basics-contact-channel"] } }],
    ])
    const ctx: ProxyContext = { ...context, cards: extraCards }
    const rejectKey = (extra: Partial<AnswerKey> = {}) =>
      key({ accept: ["unit:doc:/docs/teacher/course-members#4", "basics:basics-contact-channel"], reject: ["basics:basics-contact-channel"], ...extra })

    expect(rejectIdsFromCard(extraCards.get("doc:/docs/teacher/course-members#4/converted")!, ctx.inventory)).toEqual(["unit:doc:/docs/teacher/course-members#4"])
    expect(rejectIdsFromCard(extraCards.get("fixed:contact-fixed")!, ctx.inventory)).toEqual([])
    expect(rejectIdsFromCard(extraCards.get("policy:contact")!, ctx.inventory)).toEqual(["basics:basics-contact-channel"])
    // inventory 가 없으면 글을 확인할 수 없어 provenance 는 넣지 않는다.
    expect(rejectIdsFromCard(extraCards.get("policy:contact")!)).toEqual([])
    // KEEP 은 curatedRef 가 곧 옛 답 글이다.
    expect(rejectIdsFromCard(extraCards.get("fixed:basics-billing-unit")!)).toEqual(["basics:basics-billing-unit"])

    const row = (cardId: string) => compiled("answer", { cardId, top: [{ id: cardId }] })
    expect(classifyRow(row("doc:/docs/teacher/course-members#4/converted"), rejectKey(), ctx)).toMatchObject({ verdict: "good" })
    expect(classifyRow(row("fixed:contact-fixed"), rejectKey(), ctx)).toMatchObject({ verdict: "good", matched: ["basics:basics-contact-channel"] })
    expect(classifyRow(row("policy:contact"), rejectKey(), ctx)).toMatchObject({ verdict: "wrong", rejected: ["basics:basics-contact-channel"] })
    // legacy 줄은 그 옛 답 자체라 그대로 reject 에 걸린다.
    expect(classifyRow(legacy({ decidedBy: "basics:basics-contact-channel" }), rejectKey(), ctx).verdict).toBe("wrong")

    // --top1 도 같은 기준이다.
    const rows: ProxyEvalRow[] = [
      { ...row("doc:/docs/teacher/course-members#4/converted"), id: "a" },
      { ...row("fixed:contact-fixed"), id: "b" },
      { ...row("policy:contact"), id: "c" },
    ]
    const keyById = new Map<string, AnswerKey>(rows.map((r) => [r.id, rejectKey({ id: r.id })]))
    const results = rows.map((r) => classifyRow(r, keyById.get(r.id), ctx))
    expect(summarizeTop1(rows, results, keyById, ctx)).toMatchObject({ acceptRows: 3, top1Accept: 2, top1Rejected: 1 })
  })

  it("선택 칸(reject·siteAccept·area·areaFrom·note·keyGroup·evidenceScope·searched)을 읽는다", () => {
    const parsed = readAnswerKeys({
      set: "dev5",
      keys: [
        {
          id: "k1",
          keyGroup: "k0001",
          accept: ["unit:doc:/docs/software/software-overview#1"],
          partialAccept: [],
          reject: ["basics:basics-max-participants"],
          siteAccept: ["basics:basics-max-participants"],
          nodoc: false,
          clarifyOk: false,
          area: "pricing",
          areaFrom: "accept",
          evidenceScope: "site",
          note: "근거 메모",
          searched: ["최대 인원"],
        },
        { id: "k2", accept: [], area: "nowhere" },
      ],
    })
    expect(parsed.keys[0]).toEqual({
      id: "k1",
      keyGroup: "k0001",
      accept: ["unit:doc:/docs/software/software-overview#1"],
      partialAccept: [],
      reject: ["basics:basics-max-participants"],
      siteAccept: ["basics:basics-max-participants"],
      nodoc: false,
      clarifyOk: false,
      area: "pricing",
      areaFrom: "accept",
      evidenceScope: "site",
      note: "근거 메모",
      searched: ["최대 인원"],
    })
    // 영역 12개 밖 값은 버린다.
    expect(parsed.keys[1].area).toBeUndefined()
  })

  it("--area 는 키의 area 로 줄을 거른다", () => {
    expect(parseAreaFilter("pricing, company")).toEqual(["pricing", "company"])
    expect(() => parseAreaFilter("pricing,nowhere")).toThrow(/nowhere/)
    const keyById = new Map<string, AnswerKey>([
      ["a", { id: "a", accept: [], area: "pricing" }],
      ["b", { id: "b", accept: [], area: "company" }],
      ["c", { id: "c", accept: [] }],
    ])
    const rows = ["a", "b", "c", "d"].map((id) => legacy({ id }))
    expect(filterByArea(rows, keyById, ["pricing"]).map((row) => row.id)).toEqual(["a"])
    expect(filterByArea(rows, keyById, ["pricing", "company"]).map((row) => row.id)).toEqual(["a", "b"])
  })

  it("--top1: compiled 줄의 흔적 1위 카드가 accept 에 드는 비율(NODOC 답함은 요약의 nodoc 지표로 센다)", () => {
    const memberCardId = "doc:/docs/teacher/course-members#4/remove-member"
    const rows: ProxyEvalRow[] = [
      // 결정은 못 찾음이어도 1위 카드가 accept 면 센다.
      { ...compiled("abstain", { top: [{ id: "none" }, { id: memberCardId }] }), id: "a" },
      { ...compiled("answer", { cardId: "fixed:basics-billing-unit", top: [{ id: "fixed:basics-billing-unit" }] }), id: "b" },
      { ...compiled("answer", { cardId: "fixed:basics-billing-unit", top: [{ id: "fixed:basics-billing-unit" }] }), id: "c" },
      { ...compiled("answer", { cardId: "howto:recording-missing", top: [{ id: "howto:recording-missing" }] }), id: "d" },
      { ...compiled("gap", { top: [{ id: "doc:missing" }] }), id: "e" },
      { ...compiled("answer", { top: [{ id: "doc:missing" }] }), id: "f" },
      legacy({ id: "g", decidedBy: "basics:basics-billing-unit" }),
    ]
    const keyById = new Map<string, AnswerKey>([
      ["a", key({ id: "a", accept: ["unit:doc:/docs/teacher/course-members#4"] })],
      ["b", key({ id: "b", accept: ["basics:other"], partialAccept: ["basics:basics-billing-unit"] })],
      ["c", key({ id: "c", accept: ["basics:basics-billing-unit"], reject: ["basics:basics-billing-unit"] })],
      ["d", key({ id: "d", nodoc: true })],
      ["e", key({ id: "e", nodoc: true })],
      ["f", key({ id: "f", accept: ["basics:x"] })],
      ["g", key({ id: "g", accept: ["basics:basics-billing-unit"] })],
    ])
    const results = rows.map((row) => classifyRow(row, keyById.get(row.id), context))
    expect(traceTop1CardId(rows[0].answerIndex)).toBe(memberCardId)
    expect(summarizeTop1(rows, results, keyById, context)).toEqual({
      compiledRows: 6,
      acceptRows: 4,
      top1Accept: 1,
      top1Partial: 1,
      top1Rejected: 1,
      top1Unmapped: 1,
    })
    // d(howto 카드로 답함)·e(공백) 는 accept 없는 nodoc 키: 진짜 NODOC 2줄 중 답함 1.
    expect(summarizeProxy(results, results.length).nodocByRoute.compiled).toEqual({ trueRows: 2, trueAnswered: 1, acceptRows: 0, acceptWrong: 0 })
  })
})

describe("legacy-alias(옛 id → 카드)", () => {
  const aliasCards = new Map<string, CardRecord>([
    ...cards,
    // provenance 에 옛 id 가 빠진 FIX 카드: alias 로만 옛 답과 이어진다.
    ["fixed:contact-channel", { id: "fixed:contact-channel", kind: "fixed", answer: { text: "상담은 문의 페이지나 대표 전화로 남기실 수 있어요." }, provenance: { legacyIds: [] } }],
    // 옛 답 글 그대로인 policy 카드(공백만 다름), provenance 없음.
    ["policy:contact-same", { id: "policy:contact-same", kind: "policy", answer: { text: "상담은 문의 페이지에서 남기실 수 있어요.\n둘째 문단" } }],
  ])
  const alias = buildAliasIndex({
    "basics:basics-contact-channel": "fixed:contact-channel",
    "basics:basics-contact-old": "policy:contact-same",
    "basics:basics-dropped": null,
  })
  const ctx: ProxyContext = { ...context, cards: aliasCards, alias }
  const answer = (cardId: string, id = "q1") => ({ ...compiled("answer", { cardId, top: [{ id: cardId }] }), id })

  it("alias 를 뒤집어 카드 id → 옛 id 로 읽고 null 은 뺀다", () => {
    expect(alias.get("fixed:contact-channel")).toEqual(["basics:basics-contact-channel"])
    expect([...alias.keys()]).toEqual(["fixed:contact-channel", "policy:contact-same"])
    expect(() => buildAliasIndex(["x"])).toThrow(/legacy-alias/)
  })

  it("accept 옛 id 의 alias 대상 카드로 답하면 good 이고 1위 정답에도 센다", () => {
    const card = aliasCards.get("fixed:contact-channel") as CardRecord
    expect(idsFromCard(card)).toEqual([])
    expect(idsFromCard(card, alias)).toEqual(["basics:basics-contact-channel"])
    const contactKey = key({ accept: ["basics:basics-contact-channel"] })
    expect(classifyRow(answer("fixed:contact-channel"), contactKey, context).verdict).toBe("wrong")
    expect(classifyRow(answer("fixed:contact-channel"), contactKey, ctx)).toMatchObject({ verdict: "good", matched: ["basics:basics-contact-channel"] })
    const rows = [answer("fixed:contact-channel")]
    const keyById = new Map<string, AnswerKey>([["q1", contactKey]])
    const results = rows.map((row) => classifyRow(row, contactKey, ctx))
    expect(summarizeTop1(rows, results, keyById, ctx)).toMatchObject({ acceptRows: 1, top1Accept: 1 })
    expect(summarizeTop1(rows, results, keyById, context)).toMatchObject({ acceptRows: 1, top1Accept: 0, top1Unmapped: 1 })
  })

  it("alias 옛 id 는 글이 그 옛 답 글과 같은 text 카드일 때만 reject 에 건다", () => {
    const inventoryWithOld = buildInventoryIndex(
      readInventory({ answers: [{ answerId: "basics:basics-contact-old", text: ["상담은 문의 페이지에서 남기실 수 있어요.", "둘째 문단"] }] })
    )
    expect(rejectIdsFromCard(aliasCards.get("fixed:contact-channel") as CardRecord, ctx.inventory, alias)).toEqual([])
    expect(rejectIdsFromCard(aliasCards.get("policy:contact-same") as CardRecord, inventoryWithOld, alias)).toEqual(["basics:basics-contact-old"])
    const rejectCtx: ProxyContext = { ...ctx, inventory: inventoryWithOld }
    const oldKey = key({ accept: ["basics:basics-contact-old"], reject: ["basics:basics-contact-old"] })
    expect(classifyRow(answer("policy:contact-same"), oldKey, rejectCtx).verdict).toBe("wrong")
    const fixKey = key({ accept: ["basics:basics-contact-channel"], reject: ["basics:basics-contact-channel"] })
    expect(classifyRow(answer("fixed:contact-channel"), fixKey, rejectCtx).verdict).toBe("good")
  })
})

describe("NODOC 지표: 진짜 NODOC 답함 · nodoc+accept 오답", () => {
  it("accept 없는 nodoc 키는 답하면 답함, accept 있는 nodoc 키는 wrong 만 센다(경로별로도)", () => {
    const rows: Array<[ProxyEvalRow, AnswerKey]> = [
      [legacy({ id: "a", decidedBy: "basics:x" }), { id: "a", nodoc: true }],
      [legacy({ id: "b", decidedBy: "not_found", answerMode: "doc_suggestion", unresolved: true }), { id: "b", nodoc: true }],
      [legacy({ id: "c", decidedBy: "policy", answerMode: "clarifying_question" }), { id: "c", nodoc: true }],
      [legacy({ id: "d", decidedBy: "basics:ok" }), { id: "d", nodoc: true, accept: ["basics:ok"] }],
      [legacy({ id: "e", decidedBy: "basics:other" }), { id: "e", nodoc: true, accept: ["basics:ok"] }],
      [{ ...compiled("answer", { cardId: "fixed:basics-billing-unit" }), id: "f" }, { id: "f", nodoc: true }],
      [legacy({ id: "g", decidedBy: "basics:x" }), { id: "g", accept: ["basics:x"] }],
    ]
    const results = rows.map(([row, k]) => classifyRow(row, k, context))
    expect(results.map((r) => r.nodocKey)).toEqual(["true_nodoc", "true_nodoc", "true_nodoc", "nodoc_accept", "nodoc_accept", "true_nodoc", undefined])
    const summary = summarizeProxy(results, rows.length)
    expect(summary.nodoc).toEqual({ trueRows: 4, trueAnswered: 2, acceptRows: 2, acceptWrong: 1 })
    expect(summary.nodocByRoute.legacy).toEqual({ trueRows: 3, trueAnswered: 1, acceptRows: 2, acceptWrong: 1 })
    expect(summary.nodocByRoute.compiled).toEqual({ trueRows: 1, trueAnswered: 1, acceptRows: 0, acceptWrong: 0 })
    expect(summarizeNodoc([])).toEqual({ trueRows: 0, trueAnswered: 0, acceptRows: 0, acceptWrong: 0 })
  })
})

describe("못 찾음 상당 카드(policy·gap 이 '공개 안내에 없음'을 말함)", () => {
  const nfCards = new Map<string, CardRecord>([
    ...cards,
    ["policy:overseas-card", { id: "policy:overseas-card", kind: "policy", covers: "해외 카드 결제 여부는 공개 안내에 없고 결제 담당자가 확인한다는 것, 상담 채널 안내", answer: { text: "…" }, provenance: { legacyIds: ["basics:overseas"] } }],
    ["policy:plan-upgrade", { id: "policy:plan-upgrade", kind: "policy", covers: "Pro 에서 비즈니스로 바꿀 수 있다는 것, 차액 처리는 공개 안내에 없다는 것", answer: { text: "…" } }],
    ["fixed:not-public", { id: "fixed:not-public", kind: "fixed", covers: "숫자는 공개 안내에 없다는 것", answer: { text: "…" } }],
    ["gap:pricing/refund", { id: "gap:pricing/refund", kind: "gap" }],
  ])
  const ctx: ProxyContext = { ...context, cards: nfCards }
  const answer = (cardId: string, extra: Record<string, unknown> = {}) => compiled("answer", { cardId, top: [{ id: cardId }], ...extra })

  it("gap 카드와, covers 첫 항목이 '공개 안내에 없음'인 policy 카드만 표지가 붙는다", () => {
    expect(isNotFoundEquivalentCard(nfCards.get("gap:pricing/refund") as CardRecord)).toBe(true)
    expect(isNotFoundEquivalentCard(nfCards.get("policy:overseas-card") as CardRecord)).toBe(true)
    // 사실을 먼저 답하고 덧붙여 '공개 안내에 없다'고 하는 카드, fixed 카드, covers 가 없는 카드는 아니다.
    expect(isNotFoundEquivalentCard(nfCards.get("policy:plan-upgrade") as CardRecord)).toBe(false)
    expect(isNotFoundEquivalentCard(nfCards.get("fixed:not-public") as CardRecord)).toBe(false)
    expect(isNotFoundEquivalentCard({ id: "policy:x", kind: "policy" })).toBe(false)
    expect(isNotFoundEquivalentCard({ id: "policy:y", kind: "policy", covers: "공개 안내에 정리돼 있지 않아 단정하지 않는다는 것" })).toBe(true)
  })

  it("nodoc 키면 nf_ok, accept 에 들면 good, 그 밖에는 partial 또는 nf_doc_has 이고 NODOC 답함에 넣지 않는다", () => {
    const nodoc = classifyRow(answer("policy:overseas-card"), key({ nodoc: true }), ctx)
    expect(nodoc).toMatchObject({ kind: "answer", nfEquivalent: true, verdict: "nf_ok" })
    expect(nodoc.reason).toContain("못 찾음 상당")
    expect(classifyRow(answer("policy:overseas-card"), key({ accept: ["basics:overseas"] }), ctx).verdict).toBe("good")
    expect(classifyRow(answer("policy:overseas-card"), key({ partialAccept: ["basics:overseas"] }), ctx).verdict).toBe("partial")
    expect(classifyRow(answer("policy:overseas-card"), key({ accept: ["basics:x"] }), ctx).verdict).toBe("nf_doc_has")
    // reject 는 그대로 앞선다(text 가 옛 답 글과 다르므로 여기서는 reject id 가 없다).
    expect(classifyRow(answer("policy:plan-upgrade"), key({ nodoc: true }), ctx)).toMatchObject({ verdict: "wrong" })
    expect(classifyRow(answer("policy:plan-upgrade"), key({ nodoc: true }), ctx).nfEquivalent).toBeUndefined()
    // 다른 카드 조각과 같이 답하면 못 찾음 상당이 아니다.
    const mixed = answer("policy:overseas-card", { segments: [{ kind: "answer", card: "policy:overseas-card" }, { kind: "answer", card: "fixed:basics-billing-unit" }] })
    expect(classifyRow(mixed, key({ nodoc: true }), ctx)).toMatchObject({ verdict: "wrong" })

    const results = [
      classifyRow({ ...answer("policy:overseas-card"), id: "a" }, { id: "a", nodoc: true }, ctx),
      classifyRow({ ...answer("policy:plan-upgrade"), id: "b" }, { id: "b", nodoc: true }, ctx),
    ]
    const summary = summarizeProxy(results, 2)
    expect(summary.nodoc).toEqual({ trueRows: 2, trueAnswered: 1, acceptRows: 0, acceptWrong: 0 })
    expect(summary.nfEquivalent).toBe(1)
  })
})

describe("키 문장 범위(unitSentences): 같은 단위를 쓰는 형제 카드", () => {
  const unit = "doc:/docs/teacher/course-members#4"
  const rangeCards = new Map<string, CardRecord>([
    ["doc:a", { id: "doc:a", kind: "doc", answer: { sentences: [{ unit, ids: [0, 1] }] } }],
    ["doc:b", { id: "doc:b", kind: "doc", answer: { sentences: [{ unit, ids: [4] }] } }],
    ["howto:guide", { id: "howto:guide", kind: "howto", answer: { guide: "course-member-management" } }],
  ])
  const ctx: ProxyContext = { ...context, cards: rangeCards }
  const answer = (cardId: string, id = "q1") => ({ ...compiled("answer", { cardId, top: [{ id: cardId }] }), id })

  it("범위가 있으면 겹치는 문장을 쓰는 카드만 맞고, 없으면 단위 전체다", () => {
    const ranged = key({ accept: [`unit:${unit}`], unitSentences: { [`unit:${unit}`]: [4, 5] } })
    expect(classifyRow(answer("doc:b"), ranged, ctx).verdict).toBe("good")
    expect(classifyRow(answer("doc:a"), ranged, ctx).verdict).toBe("wrong")
    const whole = key({ accept: [`unit:${unit}`] })
    expect(classifyRow(answer("doc:a"), whole, ctx).verdict).toBe("good")
    // partialAccept·reject 도 같은 규칙이다.
    const partial = key({ partialAccept: [`unit:${unit}`], unitSentences: { [`unit:${unit}`]: [1] } })
    expect(classifyRow(answer("doc:a"), partial, ctx).verdict).toBe("partial")
    expect(classifyRow(answer("doc:b"), partial, ctx).verdict).toBe("wrong")
    const rejectKey = key({ accept: ["basics:x"], reject: [`unit:${unit}`], unitSentences: { [`unit:${unit}`]: [4] } })
    expect(classifyRow(answer("doc:a"), rejectKey, ctx).rejected).toBeUndefined()
    expect(classifyRow(answer("doc:b"), rejectKey, ctx).rejected).toEqual([`unit:${unit}`])
  })

  it("legacy 출처처럼 문장 번호를 모르는 답은 단위 전체로 본다", () => {
    const ranged = key({ accept: [`unit:${unit}`], unitSentences: { [`unit:${unit}`]: [4] } })
    const row = legacy({ decidedBy: "evidence_select", sources: [{ path: "/docs/teacher/course-members", heading: "4. 구성원 삭제" }] })
    expect(classifyRow(row, ranged, ctx).verdict).toBe("good")
    expect(withinKeyRange(`unit:${unit}`, ranged)).toBe(true)
    expect(withinKeyRange("basics:x", ranged, new Map())).toBe(true)
    expect(cardUnitSentences([rangeCards.get("doc:a")!, rangeCards.get("doc:b")!, rangeCards.get("howto:guide")!])).toEqual(
      new Map([[`unit:${unit}`, new Set([0, 1, 4])]])
    )
  })

  it("--top1 도 같은 범위 규칙을 쓴다", () => {
    const ranged = (id: string) => key({ id, accept: [`unit:${unit}`], unitSentences: { [`unit:${unit}`]: [4] } })
    const rows = [answer("doc:a", "a"), answer("doc:b", "b")]
    const keyById = new Map<string, AnswerKey>(rows.map((row) => [row.id, ranged(row.id)]))
    const results = rows.map((row) => classifyRow(row, keyById.get(row.id), ctx))
    expect(summarizeTop1(rows, results, keyById, ctx)).toMatchObject({ acceptRows: 2, top1Accept: 1 })
  })

  it("정답 키 파일의 unitSentences 를 읽고 잘못된 꼴은 오류로 알린다", () => {
    const parsed = readAnswerKeys({ set: "dev5", keys: [{ id: "k1", accept: [`unit:${unit}`], unitSentences: { [`unit:${unit}`]: [5, 4, 4] } }, { id: "k2", unitSentences: {} }] })
    expect(parsed.keys[0].unitSentences).toEqual({ [`unit:${unit}`]: [4, 5] })
    expect(parsed.keys[1].unitSentences).toBeUndefined()
    expect(() => readAnswerKeys({ keys: [{ id: "k3", unitSentences: { "basics:x": [1] } }] })).toThrow(/unit:/)
    expect(() => readAnswerKeys({ keys: [{ id: "k4", unitSentences: { [`unit:${unit}`]: [-1] } }] })).toThrow(/정수/)
  })
})
