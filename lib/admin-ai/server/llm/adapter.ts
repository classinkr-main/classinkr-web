// 갈매봇 모델 어댑터의 경계 — 이번 단계는 인터페이스와 시험용 가짜만 있다.
//
// 결정형 갈래(router.ts)가 기본이다. 모델은 결정형이 정하지 못한 곳에서 "주어진 후보 중 하나"만 고른다.
//  - route: 되묻기 후보 두 갈래 중 하나(또는 null = 모르겠음 → 되묻기 카드).
//  - pick: 후보 id 목록 중 하나(링크·근거 고르기). 목록 밖 값은 버린다.
// 모델은 도구를 실행하지 않고 오더를 만들지 않는다. 확인 경로(orders/confirm)는 이 파일을 import 하지 않는다(시험이 지킨다).
// 모델로 가는 글은 lib/ops-tools/redact 의 연락처 가림을 거친다(redactModelText).
//
// 실제 연결(Vertex Gemini·Claude)은 키와 공급자 결정(갱신 구조 결정 11) 뒤에 붙인다. 그때도 이 인터페이스만 구현한다.
// 지금 getAdminAiModelAdapter() 는 늘 null 이다 — 환경변수가 있어도 연결 코드가 없으므로 결정형만 돈다.
import { maskContactText } from "@/lib/ops-tools/redact"

export interface ModelRouteInput {
  /** 가린 질문 조각. */
  text: string
  candidates: readonly string[]
}

export interface ModelPickInput {
  text: string
  options: ReadonlyArray<{ id: string; label: string }>
}

export interface AdminAiModelAdapter {
  name: string
  route(input: ModelRouteInput): Promise<string | null>
  pick(input: ModelPickInput): Promise<string | null>
}

/** 모델 입력 글 — 연락처(전화·이메일)를 가린다. 결정형 경로와 상관없이 모델로 가는 모든 글이 이 함수를 거친다. */
export function redactModelText(text: string): string {
  return maskContactText(text).slice(0, 1000)
}

export const MODEL_TIMEOUT_MS = 4000

/** 모델 호출 — 시간 초과·오류·후보 밖 답이면 null(결정형으로 돌아간다). */
export async function askModelRoute(adapter: AdminAiModelAdapter | null, text: string, candidates: readonly string[]): Promise<string | null> {
  if (!adapter || candidates.length === 0) return null
  try {
    const answer = await withTimeout(adapter.route({ text: redactModelText(text), candidates }), MODEL_TIMEOUT_MS)
    return answer && candidates.includes(answer) ? answer : null
  } catch {
    return null
  }
}

export async function askModelPick(adapter: AdminAiModelAdapter | null, text: string, options: ReadonlyArray<{ id: string; label: string }>): Promise<string | null> {
  if (!adapter || options.length === 0) return null
  try {
    const answer = await withTimeout(
      adapter.pick({ text: redactModelText(text), options: options.map((o) => ({ id: o.id, label: redactModelText(o.label) })) }),
      MODEL_TIMEOUT_MS
    )
    return answer && options.some((o) => o.id === answer) ? answer : null
  } catch {
    return null
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("model_timeout")), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/** 지금 연결된 모델. 실제 공급자 연결 전이라 늘 null(결정형만). */
export function getAdminAiModelAdapter(): AdminAiModelAdapter | null {
  return null
}

/** 시험용 가짜 — 정해 둔 답을 내고, 받은 입력을 기록한다. */
export function createFakeModelAdapter(answers: { route?: string | null; pick?: string | null; delayMs?: number } = {}) {
  const calls: Array<{ kind: "route" | "pick"; input: ModelRouteInput | ModelPickInput }> = []
  const wait = () => (answers.delayMs ? new Promise((resolve) => setTimeout(resolve, answers.delayMs)) : Promise.resolve())
  const adapter: AdminAiModelAdapter = {
    name: "fake",
    async route(input) {
      calls.push({ kind: "route", input })
      await wait()
      return answers.route ?? null
    },
    async pick(input) {
      calls.push({ kind: "pick", input })
      await wait()
      return answers.pick ?? null
    },
  }
  return { adapter, calls }
}
