// "지금 열린 대상" — 화면이 갈매봇에게 알리는 길의 골격(점검 R28, 기획 §11.6).
//
// 경로만으로는 "이 고객 담당·이 견적" 을 풀 수 없다. 화면의 글자를 긁어 추측하지 않고, 대상을 아는 화면이
// useAdminAiEntity 훅으로 직접 알린다. 이 모듈은 그 등록부이고 화면 연결은 각 화면 소유 파트가 한다
// (CRM 고객 상세·리드 서랍·견적 상세). 등록이 없으면 맥락은 경로와 화면 이름까지만 간다.
//
// 여러 화면이 동시에 등록할 수 있다(서랍 위에 서랍). 가장 나중에 등록한 것이 "지금 열린 대상" 이다.
import type { AdminAiEntity } from "./types"

interface Registration {
  token: symbol
  entity: AdminAiEntity
}

let registrations: Registration[] = []
let snapshot: AdminAiEntity | null = null
const listeners = new Set<() => void>()

function publish() {
  const next = registrations[registrations.length - 1]?.entity ?? null
  if (next === snapshot) return
  snapshot = next
  listeners.forEach((listener) => listener())
}

/** 대상을 알린다. 돌려받은 함수를 부르면 거둔다(화면이 닫힐 때). */
export function registerAdminAiEntity(entity: AdminAiEntity): () => void {
  const token = Symbol("admin-ai-entity")
  registrations = [...registrations, { token, entity }]
  publish()
  return () => {
    registrations = registrations.filter((item) => item.token !== token)
    publish()
  }
}

export function getAdminAiEntity(): AdminAiEntity | null {
  return snapshot
}

export function subscribeAdminAiEntity(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
