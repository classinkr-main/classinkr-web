import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { decide } from "@/lib/chatbot/answer-index/decide"
import { answerIndexDataDir } from "@/lib/chatbot/answer-index/load"
import { buildTopKIndex, readTopKQuestions, topKDataDir, topKForQuestion, TOPK_DEFAULT_K } from "@/scripts/answer-index/lib/topk-core"

import { CARDS, FIXTURE_DIR, fixtureUnits } from "./index-fixture"

// 라벨용 상위 카드 덤프(scripts/answer-index/topk.ts): 런타임과 같은 색인·같은 결정, 카드별 답 글 미리보기, 공백 카드 후보.

const loadOverrides = { currentUnits: fixtureUnits(), symptomTopics: new Set<string>(), guides: new Set<string>() }
const env = {}

describe("상위 카드 덤프", () => {
  const { index, data } = buildTopKIndex({ dir: FIXTURE_DIR, load: loadOverrides })

  it("런타임 load·compile 과 같은 카드로 만들고, 결정은 decide 와 같다", () => {
    expect(index.dataVersion).toBe("ai-fixture")
    // review·낡은 카드·합치지 않은 조각은 런타임처럼 빠진다.
    expect(data.excluded.map((item) => item.id)).toEqual(expect.arrayContaining(["doc:/docs/fake/chat#0/review-only", "doc:/docs/fake/chat#0/stale"]))
    expect(data.skipped).toContain("cards/classroom.D1-99.json")
    for (const q of ["수업 중 학생 채팅 막을 수 있나요?", "녹화 영상 다시보기 어디서 봐요", "요금이 어떻게 돼요?", "에러나요"]) {
      const row = topKForQuestion(index, { id: "x", q }, { votes: false, env })
      const decision = decide(index, q, { env })
      expect(row.decision.kind, q).toBe(decision.kind)
      expect(row.decision.card, q).toBe(decision.card)
      expect(row.decision.conf, q).toBeCloseTo(decision.conf, 3)
      const firstReal = decision.top.find((candidate) => candidate.id !== "none")
      if (firstReal) expect(row.top[0].id, q).toBe(firstReal.id)
    }
  })

  it("두 조각으로 나뉘는 질문·끈 카드·문턱 하한에서도 결정 전체(조각·꼬리 포함)가 decide 와 같다", () => {
    const split = "수업 중 학생 채팅 막을 수 있나요? 그리고 녹화 영상 다시보기 어디서 봐요"
    expect(decide(index, split, { env }).segments).not.toBeNull()
    const envs = [env, { CHATBOT_COMPILED_DISABLED_CARDS: CARDS.chat }, { CHATBOT_COMPILED_MIN_CONFIDENCE: "0.99" }]
    for (const caseEnv of envs) {
      for (const q of [split, "수업 중 학생 채팅 막을 수 있나요?", "ISMS 인증 받았나요?"]) {
        const row = topKForQuestion(index, { id: "x", q }, { votes: false, env: caseEnv })
        const decision = decide(index, q, { env: caseEnv })
        const label = `${q} ${JSON.stringify(caseEnv)}`
        expect(row.decision, label).toMatchObject({
          kind: decision.kind,
          card: decision.card,
          partial: Boolean(decision.partial),
          absentHit: decision.absentHit,
          absentTail: decision.absentTail,
          abstainReason: decision.abstainReason ?? null,
        })
        expect(row.decision.segments?.map((segment) => [segment.kind, segment.card]) ?? null, label).toEqual(
          decision.segments?.map((segment) => [segment.kind, segment.card]) ?? null
        )
        // 끈 카드는 상위 카드에도 나오지 않는다.
        for (const disabled of (caseEnv as Record<string, string>).CHATBOT_COMPILED_DISABLED_CARDS?.split(",") ?? []) {
          expect(row.top.some((card) => card.id === disabled), label).toBe(false)
        }
      }
    }
  })

  it("환경변수로 끈 공백 카드는 inIndex=false 이고 decide 처럼 gap 으로 가지 않는다", () => {
    const off = { CHATBOT_COMPILED_DISABLED_CARDS: CARDS.gapCert }
    const row = topKForQuestion(index, { id: "q", q: "ISMS 인증 받았나요?" }, { votes: false, env: off })
    expect(row.absent[0]).toMatchObject({ id: "A_isms", gapCard: CARDS.gapCert, inIndex: false })
    expect(row.decision.kind).not.toBe("gap")
    expect(row.decision.kind).toBe(decide(index, "ISMS 인증 받았나요?", { env: off }).kind)
  })

  it("자료 폴더: --data-dir 가 없으면 런타임 answerIndexDataDir(ANSWER_INDEX_DATA_DIR, 공백 떼고 작업 폴더 기준)와 같다", () => {
    expect(topKDataDir(undefined, {})).toBe(join(process.cwd(), "data/answer-index"))
    expect(topKDataDir(undefined, { ANSWER_INDEX_DATA_DIR: " tmp/work " })).toBe(answerIndexDataDir({ ANSWER_INDEX_DATA_DIR: " tmp/work " }))
    expect(topKDataDir(undefined, { ANSWER_INDEX_DATA_DIR: " tmp/work " })).toBe(resolve(process.cwd(), "tmp/work"))
    expect(topKDataDir("other/data", { ANSWER_INDEX_DATA_DIR: "tmp/work" })).toBe(resolve(process.cwd(), "other/data"))
  })

  it("상위 k 카드에 종류·영역·주제·덮는 것·답 글 앞 200자·점수를 싣는다", () => {
    const row = topKForQuestion(index, { id: "q1", q: "수업 중 학생 채팅 막을 수 있나요?" }, { votes: false, env })
    expect(row).toMatchObject({ id: "q1", q: "수업 중 학생 채팅 막을 수 있나요?", scope: "in" })
    expect(row.top.length).toBeGreaterThan(1)
    expect(row.top.length).toBeLessThanOrEqual(TOPK_DEFAULT_K)
    expect(row.top.map((card) => card.rank)).toEqual(row.top.map((_, at) => at + 1))
    expect(row.top.some((card) => card.id === "none")).toBe(false)
    const chat = row.top.find((card) => card.id === CARDS.chat)!
    const unit = fixtureUnits().find((candidate) => candidate.unitId === "doc:/docs/fake/chat#0")!
    expect(chat).toMatchObject({ kind: "doc", area: "classroom", covers: "수업 중 학생 채팅을 막는 방법" })
    expect(chat.answerPreview.startsWith(unit.sentences[0].text.replace(/\s+/g, " ").trim().slice(0, 20))).toBe(true)
    expect(chat.answerPreview.length).toBeLessThanOrEqual(200)

    const narrow = topKForQuestion(index, { id: "q2", q: "요금이 어떻게 돼요?" }, { k: 2, votes: false, env })
    expect(narrow.top).toHaveLength(2)
    const price = topKForQuestion(index, { id: "q3", q: "요금이 어떻게 돼요?" }, { votes: false, env }).top.find((card) => card.id === CARDS.price)!
    expect(price.answerPreview).toBe("요금은 학생 수와 사용 기간에 따라 달라요. 정확한 견적은 상담으로 안내해 드려요.")
  })

  it("없는 개념에 걸리면 공백 카드 후보를 싣고, 공백 카드 미리보기는 주제 한 줄이다", () => {
    const row = topKForQuestion(index, { id: "q4", q: "ISMS 인증 받았나요?" }, { votes: false, env })
    expect(row.absent).toEqual([
      expect.objectContaining({ id: "A_isms", gapCard: CARDS.gapCert, inIndex: true, label: "ISMS 같은 보안 인증" }),
    ])
    expect(row.absent[0].answerPreview).toBe(`공개 안내에 없는 주제: ${row.absent[0].topic}`)
    expect(row.decision.kind).toBe("gap")
    // 공백 카드가 색인에 없는 없는 개념(카카오페이)은 inIndex=false.
    const missing = topKForQuestion(index, { id: "q5", q: "카카오페이로 결제 돼요?" }, { votes: false, env })
    expect(missing.absent[0]).toMatchObject({ id: "A_kakaopay", inIndex: false, topic: null, answerPreview: null })
  })

  it("범위 밖 질문도 상위 카드를 보이고 scope=out 으로 적는다", () => {
    const long = `${"수업 중에 학생들이 채팅으로 계속 떠들어서 ".repeat(4)}채팅을 막을 수 있나요?`
    expect(topKForQuestion(index, { id: "q6", q: long }, { votes: false, env }).scope).toBe("out")
  })

  it("질문 파일: [{ id, q }]·우주 샤드·측정 입력·{ items } 꼴을 읽고, id·q 가 없거나 겹치면 오류", () => {
    expect(readTopKQuestions([{ id: "a", q: "녹화 되나요" }])).toEqual([{ id: "a", q: "녹화 되나요" }])
    expect(readTopKQuestions([{ id: "u-1", q: "채팅 막기", p: "P-1", m: "m", label: null, conf: null, labeler: null, label2: null }])).toEqual([
      { id: "u-1", q: "채팅 막기" },
    ])
    expect(readTopKQuestions({ cases: [{ id: "c", question: "요금 얼마예요" }] })).toEqual([{ id: "c", q: "요금 얼마예요" }])
    expect(readTopKQuestions({ version: "v", items: [{ id: "i", q: "강퇴 돼요" }] })).toEqual([{ id: "i", q: "강퇴 돼요" }])
    expect(() => readTopKQuestions([{ id: "a" }])).toThrow(/1번째/)
    expect(() => readTopKQuestions([{ id: "a", q: "x" }, { id: "a", q: "y" }])).toThrow(/겹칩니다/)
    expect(() => readTopKQuestions({ nothing: [] })).toThrow()
  })
})
