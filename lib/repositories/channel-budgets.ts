// lib/repositories/channel-budgets.ts
// 채널별 예산(배정) 저장소 — event-metrics.ts와 동일한 JSON 폴백 지속성 계약을 그대로 따른다.
// (같은 DATA_DIR · atomicWriteJsonSync · assertLocalJsonWriteAllowed · 방어적 read)

import "server-only"
import fs from "fs"
import path from "path"
import { type AdChannel } from "@/lib/types/event-metrics"
import { atomicWriteJsonSync } from "@/lib/atomic-write"
import { assertLocalJsonWriteAllowed } from "@/lib/server/runtime-persistence"

const DATA_DIR = path.join(process.cwd(), "data")
const FILE = "channel-budgets.json"

// AdChannel enum의 SSOT는 lib/types/event-metrics. 여기서는 7개 키를 고정 순서로 갖는다.
const AD_CHANNELS: AdChannel[] = [
  "google",
  "meta",
  "naver",
  "kakao",
  "youtube",
  "offline",
  "other",
]
const CHANNEL_SET = new Set<string>(AD_CHANNELS)

// KRW 정수 예산. 파일에는 배정된 채널만 저장되고(누락=0), 값은 항상 0 이상 정수로 정규화한다.
type Store = Partial<Record<AdChannel, number>>

// 어떤 입력이든 0 이상 정수로 정규화한다(음수·NaN·Infinity·소수 → 방어). 잘못된 값은 0으로 본다.
function normalizeAmount(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

function readStore(): Store {
  const target = path.join(DATA_DIR, FILE)
  if (!fs.existsSync(target)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return parsed as Store
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  assertLocalJsonWriteAllowed("channel-budgets")
  atomicWriteJsonSync(path.join(DATA_DIR, FILE), store)
}

// 7개 AdChannel 전 키를 반환한다. 파일에 없거나 잘못된 값은 0으로 채운다.
export function getChannelBudgets(): Record<AdChannel, number> {
  const store = readStore()
  const result = {} as Record<AdChannel, number>
  for (const channel of AD_CHANNELS) {
    result[channel] = normalizeAmount(store[channel])
  }
  return result
}

// 단일 채널의 배정 예산을 저장하고, 정규화된 전체 맵을 반환한다.
// 채널이 enum에 없으면 방어적으로 무시(쓰기 없이 현재 맵 반환).
export function saveChannelBudget(channel: AdChannel, amount: number): Record<AdChannel, number> {
  if (!CHANNEL_SET.has(channel)) return getChannelBudgets()
  const store = readStore()
  store[channel] = normalizeAmount(amount)
  writeStore(store)
  return getChannelBudgets()
}
