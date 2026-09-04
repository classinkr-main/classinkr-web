// lib/repositories/channel-budgets.ts
// 채널별 예산(배정) 저장소 — Supabase(channel_budgets) 이전 완료(2026-08-20).
// RLS admin-only(deny-all) — admin 클라이언트 전용. KRW 0 이상 정수로 정규화.

import "server-only"
import { revalidateTag } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { MARKETING_PERF_CACHE_TAG } from "@/lib/repositories/marketing"
import { AD_CHANNELS, type AdChannel } from "@/lib/types/event-metrics"

const sb = () => createSupabaseAdminClient()
const CHANNEL_SET = new Set<string>(AD_CHANNELS)

function normalizeAmount(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

/** 7개 AdChannel 전 키 반환 — 테이블에 없는 채널은 0. */
export async function getChannelBudgets(): Promise<Record<AdChannel, number>> {
  const { data, error } = await sb().from("channel_budgets").select("channel, amount")
  if (error) throw new Error(`[channel-budgets] 조회 실패: ${error.message}`)
  const stored = new Map((data ?? []).map((row) => [row.channel as string, row.amount]))
  const result = {} as Record<AdChannel, number>
  for (const channel of AD_CHANNELS) {
    result[channel] = normalizeAmount(stored.get(channel))
  }
  return result
}

/** 단일 채널 배정 저장 후 전체 맵 반환. enum 밖 채널은 방어적으로 무시. */
export async function saveChannelBudget(
  channel: AdChannel,
  amount: number
): Promise<Record<AdChannel, number>> {
  if (!CHANNEL_SET.has(channel)) return getChannelBudgets()
  const { error } = await sb()
    .from("channel_budgets")
    .upsert(
      { channel, amount: normalizeAmount(amount), updated_at: new Date().toISOString() },
      { onConflict: "channel" }
    )
  if (error) throw new Error(`[channel-budgets] 저장 실패: ${error.message}`)
  // perf의 budgetExecutionPct KPI(배정 대비 집행률)가 이 배정을 분모로 쓴다 — 저장 직후
  // 최대 60초(getCachedMarketingPerf) 동안 옛 배정으로 계산된 집행률이 보이지 않게 무효화.
  revalidateTag(MARKETING_PERF_CACHE_TAG, "max")
  return getChannelBudgets()
}
