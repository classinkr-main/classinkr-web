// lib/repositories/event-metrics.ts
// 행사 캠페인 메트릭 저장소 — 현재는 JSON 폴백 (Supabase 마이그레이션 전 단계)

import "server-only"
import fs from "fs"
import path from "path"
import {
  DEFAULT_EVENT_METRICS,
  type EventMetrics,
} from "@/lib/types/event-metrics"

const DATA_DIR = path.join(process.cwd(), "data")
const FILE = "event-metrics.json"

type Store = Record<string, EventMetrics>

function readStore(): Store {
  const target = path.join(DATA_DIR, FILE)
  if (!fs.existsSync(target)) return {}
  try {
    return JSON.parse(fs.readFileSync(target, "utf8")) as Store
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(path.join(DATA_DIR, FILE), JSON.stringify(store, null, 2))
}

export function getEventMetrics(eventId: string): EventMetrics {
  const store = readStore()
  const existing = store[eventId]
  if (existing) {
    return {
      ...DEFAULT_EVENT_METRICS,
      ...existing,
      eventId,
      adSpendEntries: Array.isArray(existing.adSpendEntries) ? existing.adSpendEntries : [],
    }
  }
  return {
    ...DEFAULT_EVENT_METRICS,
    eventId,
    updatedAt: new Date().toISOString(),
  }
}

export function getAllEventMetrics(): Record<string, EventMetrics> {
  const store = readStore()
  const result: Record<string, EventMetrics> = {}
  for (const [eventId, metrics] of Object.entries(store)) {
    result[eventId] = {
      ...DEFAULT_EVENT_METRICS,
      ...metrics,
      eventId,
      adSpendEntries: Array.isArray(metrics.adSpendEntries) ? metrics.adSpendEntries : [],
    }
  }
  return result
}

export function saveEventMetrics(
  eventId: string,
  patch: Partial<Omit<EventMetrics, "eventId" | "updatedAt">>
): EventMetrics {
  const store = readStore()
  const current = store[eventId] ?? {
    ...DEFAULT_EVENT_METRICS,
    eventId,
    updatedAt: new Date().toISOString(),
  }
  const merged: EventMetrics = {
    ...current,
    ...patch,
    eventId,
    adSpendEntries: patch.adSpendEntries ?? current.adSpendEntries ?? [],
    updatedAt: new Date().toISOString(),
  }
  store[eventId] = merged
  writeStore(store)
  return merged
}

export function deleteEventMetrics(eventId: string): void {
  const store = readStore()
  if (store[eventId]) {
    delete store[eventId]
    writeStore(store)
  }
}
