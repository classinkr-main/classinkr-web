"use client"

// 본사 담당 분류·초안을 서버(POST /api/admin/cs-chat/escalation)에서 받아 온다(2026-11 B2, R2).
// 담당 표는 server-only 라 브라우저 번들에 없다. 같은 대화를 여러 패널(채팅 칩·소통 탭·본사 확인)이 함께 보므로
// 입력이 같으면 한 번만 부르고 결과를 탭 메모리에 둔다(브라우저 저장소에는 쓰지 않는다 — 고객 글이 섞여 있다).

import { useCallback, useEffect, useState } from "react"

import { adminFetchJson } from "@/lib/admin-client"
import type { EscalationInput, EscalationResult } from "@/lib/internal-cs-chat/escalation-types"

import { escalationInputFromDetail } from "./formatters"
import type { ConversationDetailResponse } from "./types"

export const ESCALATION_ENDPOINT = "/api/admin/cs-chat/escalation"

export type EscalationState =
  | { status: "idle"; result: null; error: null }
  | { status: "loading"; result: null; error: null }
  | { status: "ready"; result: EscalationResult; error: null }
  | { status: "error"; result: null; error: string }

const resultMemory = new Map<string, EscalationResult>()
const inFlight = new Map<string, Promise<EscalationResult>>()

/** 같은 입력이면 같은 열쇠. 대화 id 를 앞에 두어 대화가 바뀌면 다른 열쇠다. */
export function escalationKey(conversationId: string, input: EscalationInput) {
  return `${conversationId}:${JSON.stringify(input)}`
}

export function escalationKeyFromDetail(detail: ConversationDetailResponse) {
  return escalationKey(detail.conversation.id, escalationInputFromDetail(detail))
}

/** 시험·서버 렌더용: 결과를 미리 넣어 둔다(서버 응답과 같은 꼴). */
export function primeEscalationResult(detail: ConversationDetailResponse, result: EscalationResult) {
  resultMemory.set(escalationKeyFromDetail(detail), result)
}

/** 시험용: 메모리를 비운다. */
export function resetEscalationMemory() {
  resultMemory.clear()
  inFlight.clear()
}

export function readEscalationResult(detail: ConversationDetailResponse | null) {
  return detail ? resultMemory.get(escalationKeyFromDetail(detail)) ?? null : null
}

type Fetcher = (input: EscalationInput) => Promise<EscalationResult>

const defaultFetcher: Fetcher = (input) =>
  adminFetchJson<EscalationResult>(ESCALATION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    // 계산만 하는 POST 다. cs-chat 캐시를 무효화하지 않게 읽기 전용으로 표시한다.
    adminReadOnly: true,
  })

/** 입력이 같으면 진행 중인 요청을 함께 기다린다. 성공한 결과만 기억한다(실패는 다시 시도할 수 있게). */
export function loadEscalation(detail: ConversationDetailResponse, fetcher: Fetcher = defaultFetcher) {
  const input = escalationInputFromDetail(detail)
  const key = escalationKey(detail.conversation.id, input)
  const cached = resultMemory.get(key)
  if (cached) return Promise.resolve(cached)
  const pending = inFlight.get(key)
  if (pending) return pending
  const request = fetcher(input)
    .then((result) => {
      resultMemory.set(key, result)
      return result
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, request)
  return request
}

function stateFor(detail: ConversationDetailResponse | null): EscalationState {
  if (!detail) return { status: "idle", result: null, error: null }
  const cached = readEscalationResult(detail)
  return cached ? { status: "ready", result: cached, error: null } : { status: "loading", result: null, error: null }
}

export function useEscalation(detail: ConversationDetailResponse | null) {
  const key = detail ? escalationKeyFromDetail(detail) : null
  const [state, setState] = useState<{ key: string | null; value: EscalationState }>(() => ({
    key,
    value: stateFor(detail),
  }))
  const [attempt, setAttempt] = useState(0)
  // 입력이 바뀌면(새 메시지·태그·우선순위) 그 입력의 상태로 갈아 끼운다(렌더 중 상태 맞추기).
  if (state.key !== key) setState({ key, value: stateFor(detail) })

  useEffect(() => {
    if (!detail || readEscalationResult(detail)) return
    let cancelled = false
    loadEscalation(detail)
      .then((result) => {
        if (!cancelled) setState({ key, value: { status: "ready", result, error: null } })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error && error.message ? error.message : "본사 담당 추천을 불러오지 못했습니다."
        setState({ key, value: { status: "error", result: null, error: message } })
      })
    return () => {
      cancelled = true
    }
    // detail 은 key 가 같으면 같은 입력이다 — key 와 attempt 로만 다시 부른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const retry = useCallback(() => {
    setState((prev) => ({ key: prev.key, value: { status: "loading", result: null, error: null } }))
    setAttempt((value) => value + 1)
  }, [])

  return { ...(state.key === key ? state.value : stateFor(detail)), retry }
}
