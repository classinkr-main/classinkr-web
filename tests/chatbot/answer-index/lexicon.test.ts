import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { compileAbsent, compileLexicon, conceptIdsOf, matchAbsent, matchConcepts } from "@/lib/chatbot/answer-index/lexicon"
import { normalizeText } from "@/lib/chatbot/answer-index/normalize"
import type { AbsentConcept, LexiconConcept } from "@/lib/chatbot/answer-index/types"

// 답 색인 사양 §3.3 ①(낱말 첫머리 경계·짧은 형태 끝 경계·띄어쓰기 무시·모호 규칙), §12.1 I4 경계 오탐 시험.

const concept = (id: string, forms: LexiconConcept["doc"], extra: Partial<LexiconConcept> = {}): LexiconConcept => ({
  id,
  kind: "object",
  generic: false,
  parents: [],
  doc: forms,
  visitor: [],
  ambiguous: [],
  ...extra,
})

const lexicon = compileLexicon([
  concept("C_home", [{ form: "집에서", boundary: "both" }]),
  concept("C_edit", [{ form: "편집", boundary: "both" }]),
  concept("C_student", [{ form: "학생", boundary: "both" }]),
  concept("C_student_count", [{ form: "학생 수", boundary: "both" }], { parents: ["C_student"] }),
  concept("C_class", [{ form: "수업", boundary: "both" }]),
  concept("C_chat", ["채팅"].map((form) => ({ form, boundary: "both" as const }))),
  concept("C_chat_ban", ["채팅 금지", "채팅 막기"], { parents: ["C_chat"] }),
  concept("C_classroom", [{ form: "교실", boundary: "both" }]),
  concept("C_file", [{ form: "파일", boundary: "both" }]),
  concept("C_kick", ["강제 퇴장"], { ambiguous: [{ form: "내보내", requiresAny: ["C_student", "C_classroom"], notWith: ["C_file"] }] }),
  concept("C_zoom", [{ form: "줌", boundary: "both" }]),
])

const ids = (text: string) => conceptIdsOf(matchConcepts(normalizeText(text), lexicon))

describe("개념 사전 경계", () => {
  it("형태는 낱말 첫머리에서만 맞춘다: '편집에서'가 '집에서'로 잡히지 않는다", () => {
    expect(ids("판서 편집에서 지워요")).toEqual(["C_edit"])
    expect(ids("집에서 수업 들어요")).toEqual(["C_home", "C_class"])
  })

  it("3글자 이하 형태는 끝 경계를 요구한다: '학생 수업'이 '학생 수'로 잡히지 않는다", () => {
    expect(ids("학생 수업 녹화")).toEqual(["C_student", "C_class"])
    expect(ids("학생 수가 몇 명까지예요")).toEqual(["C_student_count"])
    expect(ids("학생수 제한")).toEqual(["C_student_count"])
    expect(ids("학생들 채팅")).toEqual(["C_student", "C_chat"])
  })

  it("띄어쓰기는 무시하고, 앞 형태가 끝난 자리도 첫머리로 본다", () => {
    expect(ids("채팅금지 어떻게")).toEqual(["C_chat_ban"])
    expect(ids("학생채팅금지")).toEqual(["C_student", "C_chat_ban"])
    // 1글자 형태도 끝 경계(조사)면 잡히고, 다른 낱말의 앞부분이면 잡히지 않는다.
    expect(ids("줌이랑 비교")).toEqual(["C_zoom"])
    expect(ids("줌바 댄스")).toEqual([])
  })

  it("한 맞춤을 품는 더 긴 맞춤이 있으면 짧은 것을 버린다", () => {
    const matches = matchConcepts(normalizeText("채팅 금지 기능"), lexicon)
    expect(matches.map((match) => match.id)).toEqual(["C_chat_ban"])
  })

  it("모호 규칙: requiresAny 가 있어야 붙고 notWith 가 있으면 붙지 않는다", () => {
    expect(ids("학생 내보내기")).toEqual(["C_student", "C_kick"])
    expect(ids("교실 밖으로 내보내요")).toEqual(["C_classroom", "C_kick"])
    expect(ids("내보내기 버튼")).toEqual([])
    expect(ids("학생 파일 내보내기")).toEqual(["C_student", "C_file"])
    expect(matchConcepts(normalizeText("학생 내보내기"), lexicon).find((match) => match.id === "C_kick")?.ambiguous).toBe(true)
  })

  it("빈 사전·빈 글은 맞춤이 없다", () => {
    expect(matchConcepts("녹화", compileLexicon([]))).toEqual([])
    expect(matchConcepts("", lexicon)).toEqual([])
  })
})

describe("문서에 없는 개념 맞추기", () => {
  const absent: AbsentConcept[] = [
    {
      id: "A_isms",
      label: "ISMS 같은 보안 인증",
      forms: ["ISMS", "ISMS-P", "정보보호 인증"],
      area: "trust",
      gapCard: "gap:trust/security-certification",
      verified: { grep: ["ISMS"], unitHits: 0, siteHits: 0, checkedAt: "2026-11-19", checker: "test" },
    },
    {
      id: "A_api",
      label: "API",
      forms: ["API"],
      area: "start",
      gapCard: "gap:start/api",
      verified: { grep: ["API"], unitHits: 0, siteHits: 0, checkedAt: "2026-11-19", checker: "test" },
    },
  ]
  const compiled = compileAbsent(absent)

  it("형태를 대소문자·문장부호·띄어쓰기와 관계없이 찾고, 짧은 형태는 끝 경계를 지킨다", () => {
    expect(matchAbsent(normalizeText("ISMS-P 인증 받았나요"), compiled).map((match) => match.id)).toEqual(["A_isms"])
    expect(matchAbsent(normalizeText("정보보호인증 있어요"), compiled).map((match) => match.id)).toEqual(["A_isms"])
    expect(matchAbsent(normalizeText("api 연동 되나요"), compiled).map((match) => match.id)).toEqual(["A_api"])
    expect(matchAbsent(normalizeText("apiary 견학"), compiled)).toEqual([])
  })
})

describe("저장소 사전의 방향 낱말 대조(R3 c1)", () => {
  const root = join(__dirname, "..", "..", "..", "data", "answer-index")
  const repoLexicon = compileLexicon(JSON.parse(readFileSync(join(root, "lexicon.json"), "utf8")) as LexiconConcept[])
  const repoAbsent = compileAbsent(JSON.parse(readFileSync(join(root, "absent.json"), "utf8")) as AbsentConcept[])
  const repoIds = (text: string) => conceptIdsOf(matchConcepts(normalizeText(text), repoLexicon))

  it("내려받기/올리기: 명단 낱말은 올리기·일괄 등록과 같이 오면 명단 내려받기로 보지 않는다", () => {
    expect(repoIds("학생 명단 엑셀로 내려받기 돼요")).toContain("C_roster_export")
    expect(repoIds("구성원 명단 보고 싶어요")).toContain("C_roster_export")
    const upload = repoIds("학생 명단 엑셀을 올리면 비밀번호가 생기나요")
    expect(upload).toContain("C_upload")
    expect(upload).not.toContain("C_roster_export")
    expect(repoIds("학생 명단 업로드 방법")).not.toContain("C_roster_export")
  })

  it("예약/가능 여부: '통화 가능 시간'은 예약·시간 지정 동작이 있을 때만 통화 예약이다", () => {
    expect(repoIds("통화 가능 시간 알려주세요")).not.toContain("C_callback_booking")
    expect(repoIds("통화 가능 시간 예약하고 싶어요")).toContain("C_callback_booking")
    expect(repoIds("콜백 예약 돼요")).toContain("C_callback_booking")
  })

  it("필수/선택: 펜이 꼭 있어야 하는지 묻는 말에만 펜 필수 표지가 붙는다", () => {
    expect(repoIds("아이패드 펜 필수인가요")).toContain("C_pen_required")
    expect(repoIds("태블릿 펜 없으면 판서 못 해요")).toContain("C_pen_required")
    expect(repoIds("태블릿으로 필기하면서 수업 가능한가요")).not.toContain("C_pen_required")
  })

  it("현금영수증은 문서에 없는 개념이다", () => {
    expect(matchAbsent(normalizeText("현금영수증도 끊어주나요"), repoAbsent).map((match) => match.id)).toEqual(["absent:pricing/cash-receipt"])
    expect(matchAbsent(normalizeText("결제 영수증 어디서 받아요"), repoAbsent).map((match) => match.id)).not.toContain("absent:pricing/cash-receipt")
  })
})
