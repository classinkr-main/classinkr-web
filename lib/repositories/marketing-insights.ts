// lib/repositories/marketing-insights.ts
// 마케팅 주간 AI 브리핑 저장소(marketing_insights) — lib/branch/insights 의 branch_insights 패턴 미러.
// 스키마: supabase/migrations/20260820_marketing_insights.sql
//   id / scope / digest / headline / payload(jsonb) / model / created_at
//
// RLS: deny-all(admin-only) — 반드시 admin(service-role) 클라이언트로만 접근한다.
// server(anon/authenticated) 클라이언트로 읽으면 RLS 가 전 행을 막아 빈 배열이 돌아온다.

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const sb = () => createSupabaseAdminClient()

/** AI 브리핑과 결정론적 주간 보고서를 같은 보관 테이블에서 스코프로 분리한다. */
export type MarketingInsightScope = "weekly" | "weekly_report"

export interface MarketingInsightAction {
  title: string
  why: string
}

/** payload 는 jsonb — 표시에 필요한 본문 전체(하이라이트·액션·감지된 이상·검증 메타)를 담는다. */
export interface MarketingInsightPayload {
  highlights?: string[]
  next_actions?: MarketingInsightAction[]
  anomalies?: unknown[]
  [key: string]: unknown
}

export interface MarketingInsight {
  id: string
  scope: string
  digest: string
  headline: string
  payload: MarketingInsightPayload
  model: string | null
  created_at: string
}

export interface InsertMarketingInsightInput {
  scope: MarketingInsightScope
  digest: string
  headline: string
  payload: MarketingInsightPayload
  model: string | null
}

/** 스코프의 최신 브리핑 1건 — 생성 실패 시 stale 폴백의 원천. */
export async function getLatestInsight(scope: MarketingInsightScope): Promise<MarketingInsight | null> {
  const { data, error } = await sb()
    .from("marketing_insights")
    .select("*")
    .eq("scope", scope)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`[marketing-insights] 최신 조회 실패: ${error.message}`)
  return (data as MarketingInsight | null) ?? null
}

/**
 * 같은 입력(digest)으로 이미 만든 브리핑 — 중복 LLM 호출을 막는 캐시 키.
 * withinHours 를 넘긴 건은 무시한다: 입력이 같아도 오래된 브리핑을 "방금 만든 것"처럼
 * 보여주지 않기 위해서다.
 */
export async function findInsightByDigest(
  scope: MarketingInsightScope,
  digest: string,
  withinHours = 24
): Promise<MarketingInsight | null> {
  const cutoff = new Date(Date.now() - withinHours * 3_600_000).toISOString()
  const { data, error } = await sb()
    .from("marketing_insights")
    .select("*")
    .eq("scope", scope)
    .eq("digest", digest)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`[marketing-insights] digest 조회 실패: ${error.message}`)
  return (data as MarketingInsight | null) ?? null
}

export async function insertInsight(row: InsertMarketingInsightInput): Promise<MarketingInsight> {
  const { data, error } = await sb().from("marketing_insights").insert(row).select("*").single()
  if (error) throw new Error(`[marketing-insights] 저장 실패: ${error.message}`)
  return data as MarketingInsight
}
