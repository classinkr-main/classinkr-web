import { beforeEach, vi } from "vitest"

import { __resetModelCircuitForTests } from "@/lib/chatbot/llm"

/**
 * 최종 답변에 모델을 쓰는 방식(CHATBOT_FINAL_ANSWER_LLM)을 다루는 테스트 도우미.
 * 기본값 select 는 모델이 문서 문장만 고르고, generate 는 고른 문장을 근거로 모델이 답을 다시 쓴다.
 */

// 결제·인증 실패 차단기(lib/chatbot/llm.ts)는 프로세스 단위 상태다. 이 도우미를 쓰는 테스트 파일은 테스트마다 닫힌 상태에서 시작한다.
beforeEach(() => {
  __resetModelCircuitForTests()
})

/** 모델이 답을 다시 쓰는 generate 모드로 돌린다. */
export function enableGenerateMode() {
  vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "generate")
}

/** 정해 둔 답 확인 관문(판정만 하는 JSON 호출)인지 본다. */
export function isAnswerGateCall(init?: RequestInit | null) {
  const body = String(init?.body ?? "")
  return body.includes('"off_target"') && body.includes('"verdict"')
}

/** 관문 판정 응답. 기본은 "준비된 답이 질문에 답한다"(기존 답 유지). */
export function answerGateResponse(verdict: "answers" | "off_target" = "answers") {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ verdict }) }] } }] }),
  }
}

/** 못 찾았을 때 목차에서 절을 고르는 두 번째 검색 호출인지 본다. */
export function isOutlinePickCall(init?: RequestInit | null) {
  return String(init?.body ?? "").includes('"sectionIds"')
}

/** 목차 고르기 응답. 기본은 "답이 있을 만한 절 없음"(못 찾음 유지). */
export function outlinePickResponse(sectionIds: number[] = []) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ sectionIds }) }] } }] }),
  }
}

/** 근거 선별 호출인지 본다. 선별은 JSON 응답을 요청하는 generateContent 호출이다(관문 판정·목차 고르기 호출은 뺀다). */
export function isEvidenceSelectionCall(init?: RequestInit | null) {
  return (
    String(init?.body ?? "").includes('"responseMimeType":"application/json"') &&
    !isAnswerGateCall(init) &&
    !isOutlinePickCall(init)
  )
}

/** 근거 선별 호출에 돌려줄 응답. 기본은 "1번 문장이 답". 빈 배열이면 답 문장이 없다는 뜻이다. */
export function evidenceSelectionResponse(ids: number[] = [1]) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ids }) }] } }] }),
  }
}

type FetchLike = (url: string | URL | Request, init?: RequestInit) => unknown

/**
 * fetch 를 목으로 바꾸되 근거 선별 호출만 따로 답한다. 나머지 호출은 넘겨받은 목이 그대로 받으므로,
 * 목의 호출 기록에는 임베딩과 답 생성 호출만 남는다.
 */
export function stubFetchWithEvidenceSelection(fetchMock: FetchLike, ids: number[] = [1]) {
  const wrapped = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
    isAnswerGateCall(init)
      ? answerGateResponse()
      : isOutlinePickCall(init)
        ? outlinePickResponse()
        : isEvidenceSelectionCall(init)
        ? evidenceSelectionResponse(ids)
        : fetchMock(url, init)
  )
  vi.stubGlobal("fetch", wrapped)
  return wrapped
}

export interface SelectionSentence {
  id: number
  text: string
}

/** 근거 선별 요청에서 프롬프트와 번호 붙은 문장을 읽는다. */
export function readEvidenceSelectionRequest(init?: RequestInit | null) {
  const body = JSON.parse(String(init?.body ?? "{}")) as { contents?: { parts?: { text?: string }[] }[] }
  const prompt = body.contents?.at(-1)?.parts?.[0]?.text ?? ""
  const sentences: SelectionSentence[] = Array.from(prompt.matchAll(/^\[(\d+)\] (.*)$/gm)).map((match) => ({
    id: Number(match[1]),
    text: match[2],
  }))
  const labels = Array.from(prompt.matchAll(/^# (.*)$/gm)).map((match) => match[1])
  return { prompt, sentences, labels }
}

/**
 * 문장 내용을 보고 고르는 근거 선별 목. pick 이 true 를 돌려준 문장의 번호를 답한다.
 * 선별이 아닌 호출(임베딩·답 생성)은 onOtherCall 이 받는다(없으면 빈 성공 응답).
 */
export function stubEvidenceSelection(pick: (text: string) => boolean, onOtherCall?: FetchLike) {
  const requests: ReturnType<typeof readEvidenceSelectionRequest>[] = []
  const otherCalls: { url: string; init?: RequestInit }[] = []
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (isAnswerGateCall(init)) return answerGateResponse()
    if (isOutlinePickCall(init)) return outlinePickResponse()
    if (isEvidenceSelectionCall(init)) {
      const request = readEvidenceSelectionRequest(init)
      requests.push(request)
      return evidenceSelectionResponse(request.sentences.filter((sentence) => pick(sentence.text)).map((sentence) => sentence.id))
    }
    otherCalls.push({ url: String(url), init })
    return onOtherCall ? onOtherCall(url, init) : { ok: true, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, requests, otherCalls }
}
