"use client"

import { useCallback, useSyncExternalStore } from "react"

import {
  DEFAULT_QUOTE_WORKSPACE_PREFERENCES,
  parseQuoteWorkspacePreferences,
  quoteWorkspaceStorageKey,
  type QuoteWorkspacePreferences,
} from "@/lib/quote-workspace-preferences"

const CHANGE_EVENT = "quote-workspace-preferences-change"
const snapshots = new Map<string, { raw: string | null; value: QuoteWorkspacePreferences }>()
const saveErrors = new Map<string, string>()

function storageKey() {
  try {
    return quoteWorkspaceStorageKey(window.sessionStorage)
  } catch {
    return null
  }
}

function snapshot() {
  const key = storageKey()
  if (!key) return DEFAULT_QUOTE_WORKSPACE_PREFERENCES
  if (saveErrors.has(key)) return snapshots.get(key)?.value ?? DEFAULT_QUOTE_WORKSPACE_PREFERENCES
  try {
    const raw = window.localStorage.getItem(key)
    const cached = snapshots.get(key)
    if (cached?.raw === raw) return cached.value
    const value = parseQuoteWorkspacePreferences(raw)
    snapshots.set(key, { raw, value })
    return value
  } catch {
    return snapshots.get(key)?.value ?? DEFAULT_QUOTE_WORKSPACE_PREFERENCES
  }
}

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify)
  window.addEventListener(CHANGE_EVENT, notify)
  return () => {
    window.removeEventListener("storage", notify)
    window.removeEventListener(CHANGE_EVENT, notify)
  }
}

function errorSnapshot() {
  return saveErrors.get(storageKey() ?? "") ?? null
}

export function useQuoteWorkspacePreferences() {
  const preferences = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_QUOTE_WORKSPACE_PREFERENCES)
  const storageError = useSyncExternalStore(subscribe, errorSnapshot, () => null)

  const updatePreferences = useCallback((patch: Partial<Omit<QuoteWorkspacePreferences, "version">>) => {
    const key = storageKey()
    if (!key) return
    const value = parseQuoteWorkspacePreferences(JSON.stringify({ ...snapshot(), ...patch }))
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
      saveErrors.delete(key)
    } catch {
      // 이번 화면에서는 선택을 반영하되 다음 접속까지 저장됐다고 알리지 않는다.
      snapshots.set(key, { raw: null, value })
      saveErrors.set(key, "설정을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.")
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return { preferences, updatePreferences, storageError }
}
