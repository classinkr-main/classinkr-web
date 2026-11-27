import { describe, expect, it } from "vitest"

import { parseEvalCases } from "@/scripts/lib/chatbot-live-eval-checks"
import {
  buildFragmentRecord,
  classifyDecoy,
  hasAbsenceNotice,
  hasUnansweredNotice,
  outcomeSignature,
  summarizeDecoys,
  summarizeFragments,
  type ExpectFragment,
} from "@/scripts/lib/chatbot-live-eval-probes"

const topics: Record<string, string> = {
  "doc:rec": "녹화 방법",
  "policy:trial": "무료 체험",
  "doc:install": "PC 설치",
}
const topicOf = (id: string) => topics[id] ?? ""

const expectTwo: ExpectFragment[] = [
  { topic: "녹화", cardPattern: "rec", text: "녹화는 어떻게 하나요?" },
  { topic: "체험", cardPattern: "trial", text: "무료 체험이 있나요?" },
]

describe("parseEvalCases 탐침 칸", () => {
  it("expectFragments·single·decoy 를 읽고 기존 칸은 그대로 둔다", () => {
    const [multi, single, decoy] = parseEvalCases([
      { id: "a", question: "녹화랑 체험", expectFragments: [{ topic: "녹화", cardPattern: "rec", text: "녹화" }] },
      { id: "b", question: "한 가지", single: true },
      { id: "c", question: "미끼", decoy: { device: "handoff", forbid: ["^handoff$"] } },
    ])
    expect(multi.expectFragments).toEqual([{ topic: "녹화", cardPattern: "rec", text: "녹화" }])
    expect(single.single).toBe(true)
    expect(decoy.decoy).toEqual({ device: "handoff", forbid: ["^handoff$"] })
    expect(parseEvalCases([{ id: "d", question: "x" }])[0]).not.toHaveProperty("expectFragments")
  })

  it("잘못된 정규식이나 빠진 칸은 오류", () => {
    expect(() => parseEvalCases([{ id: "a", question: "x", expectFragments: [{ topic: "t", cardPattern: "(" }] }])).toThrow(/정규식/)
    expect(() => parseEvalCases([{ id: "a", question: "x", expectFragments: [{ topic: "t" }] }])).toThrow(/cardPattern/)
    expect(() => parseEvalCases([{ id: "a", question: "x", decoy: { forbid: ["x"] } }])).toThrow(/device/)
  })
})

describe("buildFragmentRecord", () => {
  it("흔적에 조각 배열이 없으면 결정형 판정(probe)으로 조각 답을 센다", () => {
    const record = buildFragmentRecord({
      question: "녹화는 어떻게 하나요? 그리고 무료 체험도 있나요?",
      answer: "녹화 답",
      indexDecided: true,
      trace: { decision: "answer", card: "doc:rec", segments: 2 },
      probe: {
        kind: "answer",
        card: "doc:rec",
        segments: [
          { text: "녹화는 어떻게 하나요?", kind: "answer", card: "doc:rec", conf: 0.9 },
          { text: "무료 체험도 있나요?", kind: "abstain", card: null, conf: 0.2 },
        ],
      },
      expect: expectTwo,
      solo: [
        { kind: "answer", card: "doc:rec", conf: 0.9, top: [{ id: "doc:rec" }] },
        { kind: "abstain", card: null, conf: 0.3, top: [{ id: "policy:trial" }] },
      ],
      topicOf,
    })
    expect(record.source).toBe("probe")
    expect(record.segmentCount).toBe(2)
    expect(record.answeredCards).toEqual(["doc:rec"])
    expect(record.perFragment.map((item) => item.answered)).toEqual([true, false])
    expect(record.perFragment[1]).toMatchObject({ soloAnswered: false, soloTop: true })
  })

  it("고르기가 채운 조각은 흔적 parts 의 고른 카드로 센다(고르기를 안 쓴 줄은 그대로)", () => {
    const probe = {
      kind: "answer",
      card: "doc:rec",
      segments: [
        { text: "녹화는 어떻게 하나요?", kind: "answer", card: "doc:rec", conf: 0.9 },
        { text: "무료 체험도 있나요?", kind: "abstain", card: null, conf: 0.5 },
      ],
    }
    const parts = [
      { text: "녹화는 어떻게 하나요?", kind: "answer", card: "doc:rec", by: "index" },
      { text: "무료 체험도 있나요?", kind: "answer", card: "policy:trial", by: "assist" },
    ]
    const base = { question: "녹화는 어떻게 하나요? 그리고 무료 체험도 있나요?", answer: "1. 녹화\n2. 체험", indexDecided: true, probe, expect: expectTwo, topicOf }
    const assisted = buildFragmentRecord({ ...base, trace: { card: "doc:rec", segments: 2, parts, assist: { used: true, accepted: true } } })
    expect(assisted.source).toBe("probe")
    expect(assisted.segments.map((segment) => [segment.card, segment.by])).toEqual([["doc:rec", "index"], ["policy:trial", "assist"]])
    expect(assisted.perFragment.map((item) => item.answered)).toEqual([true, true])
    const notUsed = buildFragmentRecord({ ...base, trace: { card: "doc:rec", segments: 2, parts, assist: { used: false } } })
    expect(notUsed.perFragment.map((item) => item.answered)).toEqual([true, false])
    const noAssist = buildFragmentRecord({ ...base, trace: { card: "doc:rec", segments: 2, parts } })
    expect(noAssist.segments).toEqual(buildFragmentRecord({ ...base, trace: { card: "doc:rec", segments: 2 } }).segments)
  })

  it("흔적의 segments 배열이 있으면 그것을 먼저 쓴다", () => {
    const record = buildFragmentRecord({
      question: "q",
      answer: "a",
      indexDecided: true,
      trace: { segments: [{ text: "가", kind: "answer", card: "doc:rec", by: "assist" }, { text: "나", kind: "answer", card: "policy:trial" }] },
      probe: { kind: "abstain", card: null },
      expect: expectTwo,
      topicOf,
    })
    expect(record.source).toBe("trace")
    expect(record.segments.map((segment) => segment.by)).toEqual(["assist", "index"])
    expect(record.perFragment.map((item) => item.answered)).toEqual([true, true])
  })

  it("색인이 답하지 않은 줄(앞 단계가 답함)은 답한 카드가 없다", () => {
    const record = buildFragmentRecord({
      question: "q",
      answer: "상담 연결",
      indexDecided: false,
      trace: { pre: "handoff", decision: null, segments: 0 },
      expect: expectTwo,
      topicOf,
    })
    expect(record.answeredCards).toEqual([])
    expect(record.perFragment.every((item) => !item.answered)).toBe(true)
  })

  it("알림 줄을 알아본다", () => {
    expect(hasUnansweredNotice("함께 물어보신 다른 내용은 공개 안내에서 찾지 못했어요.")).toBe(true)
    expect(hasUnansweredNotice("【체험】 이 질문만 따로 보내 주시면 이어서 안내해 드릴게요.")).toBe(true)
    expect(hasUnansweredNotice("【두 번째 질문】\n이 내용은 따로 한 번 더 물어봐 주세요.")).toBe(true)
    // R2 검토 뒤 알림 줄: '바로 찾지 못했어요'·증상 줄은 알림이지만 '없다'고 단정하지 않는다.
    expect(hasUnansweredNotice("【출석부】\n이 부분은 공개 안내에서 바로 찾지 못했어요.")).toBe(true)
    expect(hasAbsenceNotice("【출석부】\n이 부분은 공개 안내에서 바로 찾지 못했어요.")).toBe(false)
    expect(hasUnansweredNotice("【설치】\n이 증상에 딱 맞는 해결 안내는 아직 찾지 못했어요.")).toBe(true)
    expect(hasAbsenceNotice("【보안 인증】\n공개 안내에는 없는 내용이에요.")).toBe(true)
    expect(hasUnansweredNotice("녹화는 [수업 설정]에서 켜요.")).toBe(false)
  })

  it("조각이 둘 이상이고 색인이 정한 줄은 L13 복합 꼴을 판정해 compoundLint 에 적는다", () => {
    const base = {
      question: "녹화는 어떻게 하나요? 그리고 무료 체험도 있나요?",
      indexDecided: true,
      probe: null,
      expect: expectTwo,
      topicOf,
    }
    const traced = { segments: [{ text: "가", kind: "answer", card: "doc:rec" }, { text: "나", kind: "abstain", card: null }] }
    const ok = buildFragmentRecord({ ...base, answer: "【녹화】\n[수업 설정]에서 켜요.\n\n【체험】\n이 내용은 따로 한 번 더 물어봐 주세요.", trace: traced })
    expect(ok.compoundLint).toEqual([])
    const alone = buildFragmentRecord({ ...base, answer: "【녹화】\n\n[수업 설정]에서 켜요.", trace: traced })
    expect(alone.compoundLint).toEqual(expect.arrayContaining(["head_count", "head_alone"]))
    // 두 조각이 같은 카드면 번호 하나 + 묶임 하나 — 머리 없는 단일 답도 통과다.
    const same = buildFragmentRecord({ ...base, answer: "[수업 설정]에서 켜요.", trace: { segments: [{ text: "가", kind: "answer", card: "doc:rec" }, { text: "나", kind: "answer", card: "doc:rec" }] } })
    expect(same.compoundLint).toEqual([])
    const single = buildFragmentRecord({ ...base, answer: "[수업 설정]에서 켜요.", trace: { segments: [{ text: "가", kind: "answer", card: "doc:rec" }] } })
    expect(single).not.toHaveProperty("compoundLint")
    const summary = summarizeFragments([
      { id: "a", expectFragments: expectTwo, fragments: ok },
      { id: "b", expectFragments: expectTwo, fragments: alone },
    ])
    expect(summary.multi.compoundLint).toMatchObject({ judged: 2, pass: 1 })
    expect(summary.multi.compoundLint.codes.head_alone).toBe(1)
  })

  it("'공개 안내에 없다'는 알림만 거짓 알림 후보로 본다", () => {
    expect(hasAbsenceNotice("【외부 출결】\n공개 안내에는 없는 내용이라 상담으로 확인해 드릴게요.")).toBe(true)
    expect(hasAbsenceNotice("【두 번째 질문】\n이 내용은 따로 한 번 더 물어봐 주세요.")).toBe(false)
  })
})

describe("summarizeFragments", () => {
  const record = (answered: boolean[], notice: boolean, soloTop: boolean[], segmentCount = 2, soloConf: number[] = [0.8, 0.4]) => ({
    source: "probe" as const,
    segmentCount,
    segments: [],
    answeredCards: answered.some(Boolean) ? ["x"] : [],
    notice,
    absenceNotice: notice,
    perFragment: answered.map((value, index) => ({
      topic: `t${index}`,
      answered: value,
      soloAnswered: false,
      soloCard: null,
      soloKind: null,
      soloConf: soloConf[index] ?? null,
      soloTop: soloTop[index],
    })),
  })
  const expectFragments = expectTwo

  it("조각 답·모두 답·쏠림·소리 없는 누락·거짓 알림을 센다", () => {
    const summary = summarizeFragments([
      { id: "1", group: "g", expectFragments, fragments: record([true, true], false, [true, true]) },
      { id: "2", group: "g", expectFragments, fragments: record([true, false], false, [true, true]) },
      { id: "3", group: "g", expectFragments, fragments: record([false, true], true, [true, true], 2, [0.3, 0.9]) },
      { id: "4", group: "g", expectFragments, fragments: record([false, false], true, [true, false], 1) },
    ]).multi
    expect(summary).toMatchObject({
      rows: 4,
      fragments: 8,
      answeredFragments: 4,
      allAnswered: 1,
      noneAnswered: 1,
      noCard: 1,
      partialRows: 2,
      lean: { firstOnly: 1, laterOnly: 1, strongerSolo: 2, soloKnown: 2 },
      silentMissing: 1,
      noticeRows: 2,
      falseNotice: 2,
      underSplit: 1,
    })
    expect(summary.answeredRatio).toBe(50)
  })

  it("단일 질문의 과분할 비율", () => {
    const summary = summarizeFragments([
      { id: "s1", single: true, fragments: record([], false, [], 1) },
      { id: "s2", single: true, fragments: record([], false, [], 2) },
    ]).single
    expect(summary).toMatchObject({ rows: 2, overSplit: 1, overSplitRatio: 50, overSplitIds: ["s2"] })
  })
})

describe("낱말 미끼 판정", () => {
  it("결정 표시: 앞 단계·색인 결정·승격·없는 개념", () => {
    expect(outcomeSignature(null)).toBe("legacy")
    expect(outcomeSignature({ pre: "handoff", decision: null })).toBe("handoff")
    expect(outcomeSignature({ scope: "out" })).toBe("scope_out")
    expect(outcomeSignature({ decision: "abstain" })).toBe("abstain")
    expect(outcomeSignature({ decision: "answer", card: "policy:x", decidedBy: "index:vote-rescue" })).toBe("answer:policy:x(rescue)")
    expect(outcomeSignature({ decision: "gap", card: "gap:a", absentHit: "absent:a" })).toBe("gap:gap:a[absent:absent:a]")
    expect(outcomeSignature({ decision: "answer", top: [{ id: "doc:z" }] })).toBe("answer:doc:z")
  })

  it("걸림·기대대로·관찰 불가·그 밖", () => {
    expect(classifyDecoy({ device: "handoff", forbid: ["^handoff$"] }, "handoff")).toBe("trapped")
    expect(classifyDecoy({ device: "handoff", forbid: ["^handoff$"], expect: "^answer" }, "answer:doc:a")).toBe("expected")
    expect(classifyDecoy({ device: "handoff", forbid: ["^handoff$"] }, "abstain")).toBe("other")
    expect(classifyDecoy({ device: "angry", observable: false, forbid: ["x"] }, "x")).toBe("unobservable")
  })

  it("장치별로 센다", () => {
    const summary = summarizeDecoys([
      { id: "h1", decoy: { device: "handoff", forbid: ["^handoff$"] }, outcome: "handoff" },
      { id: "h2", decoy: { device: "handoff", forbid: ["^handoff$"] }, outcome: "answer:doc:a" },
      { id: "x" },
    ])
    expect(summary.total).toBe(2)
    expect(summary.devices.handoff).toMatchObject({ n: 2, trapped: 1, other: 1, trappedIds: ["h1"] })
  })
})
