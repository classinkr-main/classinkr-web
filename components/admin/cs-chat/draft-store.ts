// 대화별 작업 초안 저장소(IC-08·IC-11, newChatDesign §7).
//
// 담는 것: 입력창 글, 첨부 파일 이름(바이트는 저장하지 않는다), 고객용 최종 답, 검토 메모, 확인 체크, 맥락 비우기 대기 표시.
// 저장 위치: 탭 단위 sessionStorage. localStorage는 쓰지 않는다 — 고객 글이 섞인 초안을 디스크에 오래 남기지 않는다.
// 모든 접근은 try/catch로 감싼다. 저장소가 막히거나(private window·정책) 값이 깨져도 메모리로만 동작하고 화면은 깨지지 않는다.
// 만료: 마지막 활동 뒤 12시간(결정 15, 기본값). 만료되면 모든 대화의 초안을 비운다.
//
// 소통 초안 편집본(CommunicationTabs)은 B1이 탭 메모리에만 두기로 했으므로 여기에 넣지 않는다.

import type { ReviewChecks } from "./types"

export const DRAFT_STORE_KEY = "classinkr.admin.cs-copilot.drafts.v1"
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000
/** 아직 상담 기록이 없는 새 화면의 초안 키. 서버 id는 UUID라 겹치지 않는다. */
export const NEW_DRAFT_KEY = "__new__"
const STORE_VERSION = 1
const MAX_CONVERSATIONS = 40

export interface ConversationDraft {
  composer: string
  attachmentNames: string[]
  finalDraft: string
  reviewNote: string
  checks: ReviewChecks
  /** 맥락 비우기를 눌렀고 아직 다음 질문을 보내지 않은 상태. 다음 generate 본문에 resetContext:true 를 싣는다. */
  resetPending: boolean
}

export const EMPTY_CHECKS: ReviewChecks = { customer: false, evidence: false, externalScope: false, warnings: false }

export function emptyDraft(): ConversationDraft {
  return {
    composer: "",
    attachmentNames: [],
    finalDraft: "",
    reviewNote: "",
    checks: { ...EMPTY_CHECKS },
    resetPending: false,
  }
}

interface StoredShape {
  v: number
  savedAt: number
  byConversation: Record<string, Partial<ConversationDraft>>
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null
    return window.sessionStorage
  } catch {
    return null
  }
}

function sanitizeChecks(value: unknown): ReviewChecks {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return {
    customer: source.customer === true,
    evidence: source.evidence === true,
    externalScope: source.externalScope === true,
    warnings: source.warnings === true,
  }
}

function sanitizeDraft(value: unknown): ConversationDraft {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return {
    composer: typeof source.composer === "string" ? source.composer : "",
    attachmentNames: Array.isArray(source.attachmentNames)
      ? source.attachmentNames.filter((name): name is string => typeof name === "string").slice(0, 10)
      : [],
    finalDraft: typeof source.finalDraft === "string" ? source.finalDraft : "",
    reviewNote: typeof source.reviewNote === "string" ? source.reviewNote : "",
    checks: sanitizeChecks(source.checks),
    resetPending: source.resetPending === true,
  }
}

/** 값이 하나라도 있으면 "작업 중인 초안"이다. 체크만 켜 둔 것은 초안으로 세지 않는다(되돌리기 띠·이탈 경고 기준). */
export function draftHasContent(draft: ConversationDraft | null | undefined) {
  if (!draft) return false
  return Boolean(
    draft.composer.trim() ||
      draft.finalDraft.trim() ||
      draft.reviewNote.trim() ||
      draft.attachmentNames.length > 0
  )
}

function draftIsDefault(draft: ConversationDraft) {
  return (
    !draftHasContent(draft) &&
    !draft.resetPending &&
    !draft.checks.customer &&
    !draft.checks.evidence &&
    !draft.checks.externalScope &&
    !draft.checks.warnings
  )
}

export interface DraftStore {
  get(conversationKey: string): ConversationDraft
  set(conversationKey: string, draft: ConversationDraft): void
  remove(conversationKey: string): void
  /** 값이 있는 초안이 하나라도 있는지(beforeunload 경고용). */
  anyContent(): boolean
  /** 시험용. */
  snapshot(): Record<string, ConversationDraft>
}

/**
 * 저장소를 만든다. storage 와 시계를 주입할 수 있어 시험에서 막힌 저장소·만료를 재현한다.
 * 같은 탭의 여러 호출이 같은 값을 보도록 메모리 사본을 항상 먼저 읽고, 저장소는 그 사본의 복구·복제용이다.
 */
export function createDraftStore(options?: {
  getStorage?: () => StorageLike | null
  now?: () => number
}): DraftStore {
  const getStorage = options?.getStorage ?? defaultStorage
  const now = options?.now ?? Date.now
  let memory: Map<string, ConversationDraft> | null = null
  let savedAt = 0

  function hydrate() {
    if (memory) {
      if (savedAt && now() - savedAt > DRAFT_TTL_MS) {
        memory = new Map()
        savedAt = 0
        persist()
      }
      return memory
    }
    memory = new Map()
    try {
      const storage = getStorage()
      const raw = storage?.getItem(DRAFT_STORE_KEY)
      if (!raw) return memory
      const parsed = JSON.parse(raw) as Partial<StoredShape> | null
      if (!parsed || typeof parsed !== "object" || parsed.v !== STORE_VERSION) return memory
      const stamp = typeof parsed.savedAt === "number" ? parsed.savedAt : 0
      if (!stamp || now() - stamp > DRAFT_TTL_MS) {
        try { storage?.removeItem(DRAFT_STORE_KEY) } catch { /* 저장소가 막혀도 계속 */ }
        return memory
      }
      savedAt = stamp
      const by = parsed.byConversation
      if (by && typeof by === "object" && !Array.isArray(by)) {
        for (const [key, value] of Object.entries(by)) memory.set(key, sanitizeDraft(value))
      }
    } catch {
      // 깨진 JSON·접근 차단 — 빈 저장소로 시작한다.
      memory = new Map()
    }
    return memory
  }

  function persist() {
    const map = memory
    if (!map) return
    try {
      const storage = getStorage()
      if (!storage) return
      if (map.size === 0) {
        storage.removeItem(DRAFT_STORE_KEY)
        return
      }
      const byConversation: Record<string, ConversationDraft> = {}
      // 오래 쌓이지 않도록 가장 나중에 넣은 항목 위주로 상한을 둔다.
      const entries = [...map.entries()].slice(-MAX_CONVERSATIONS)
      for (const [key, value] of entries) byConversation[key] = value
      const payload: StoredShape = { v: STORE_VERSION, savedAt, byConversation }
      storage.setItem(DRAFT_STORE_KEY, JSON.stringify(payload))
    } catch {
      // 용량 초과·접근 차단 — 메모리 사본은 그대로 살아 있다.
    }
  }

  return {
    get(conversationKey) {
      const stored = hydrate().get(conversationKey)
      return stored ? sanitizeDraft(stored) : emptyDraft()
    },
    set(conversationKey, draft) {
      const map = hydrate()
      if (draftIsDefault(draft)) {
        if (!map.has(conversationKey)) return
        map.delete(conversationKey)
      } else {
        // 다시 넣어 삽입 순서를 갱신한다(상한에서 오래된 것부터 빠진다).
        map.delete(conversationKey)
        map.set(conversationKey, sanitizeDraft(draft))
      }
      savedAt = now()
      persist()
    },
    remove(conversationKey) {
      const map = hydrate()
      if (!map.delete(conversationKey)) return
      savedAt = now()
      persist()
    },
    anyContent() {
      for (const draft of hydrate().values()) if (draftHasContent(draft)) return true
      return false
    },
    snapshot() {
      return Object.fromEntries(hydrate().entries())
    },
  }
}
