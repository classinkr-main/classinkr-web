import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 월 매출 목표 — crm_revenue_target(월별 1행)에서 읽는다. 통화는 CNY(¥, REV 동기화와 동일).
// 마이그레이션 미적용/행 없음/오류면 null을 반환하고 절대 throw하지 않는다 →
// 코크핏 매출추이 목표선·달성률 배지는 목표가 있을 때만 표시(없으면 자연 degrade).

export interface CrmRevenueTarget {
  month: string // "YYYY-MM"
  amount: number // CNY
  currency: "CNY"
}

export async function getCrmRevenueTarget(month: string): Promise<CrmRevenueTarget | null> {
  if (!/^[0-9]{4}-[0-9]{2}$/.test(month)) return null
  try {
    const sb = createSupabaseAdminClient()
    const { data, error } = await sb
      .from("crm_revenue_target")
      .select("month, amount")
      .eq("month", month)
      .maybeSingle()
    if (error || !data) return null
    const amount = Number((data as { amount: number }).amount)
    if (!Number.isFinite(amount) || amount <= 0) return null
    return { month: (data as { month: string }).month, amount, currency: "CNY" }
  } catch {
    // 테이블 부재(마이그레이션 전) 등 — 목표 없음으로 취급.
    return null
  }
}

// 월 목표 upsert(CNY). 읽기와 달리 오류를 삼키지 않고 던진다 →
// 테이블 미적용(마이그레이션 전)이면 호출자(API)가 그 사실을 사용자에게 알릴 수 있게.
export async function setCrmRevenueTarget(month: string, amount: number): Promise<CrmRevenueTarget> {
  if (!/^[0-9]{4}-[0-9]{2}$/.test(month)) throw new Error("month must be YYYY-MM")
  if (!Number.isFinite(amount) || amount < 0) throw new Error("amount must be a non-negative number")
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("crm_revenue_target")
    .upsert({ month, amount, updated_at: new Date().toISOString() }, { onConflict: "month" })
    .select("month, amount")
    .single()
  if (error) throw error
  return { month: (data as { month: string }).month, amount: Number((data as { amount: number }).amount), currency: "CNY" }
}
