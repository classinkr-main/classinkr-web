import "server-only"

// Meta 리드 미러 건강 지표 읽기 — public.meta_lead_mirror_health() RPC 한 번(읽기 전용, 건수·시각만, PII 없음).
// 관리 화면(app/api/admin/meta-lead-mirror)과 "미측정" 가드(lib/meta/lead-intake-coverage.ts)가 쓴다.
// 크론 사이클의 경보·스로틀은 lib/server/meta-lead-mirror.ts(checkHealth)가 따로 한다 — 이 파일은 경보를 내지 않는다.
// 이 모듈은 미러 오케스트레이터를 import 하지 않는다(보고서 모듈이 부수효과 코드까지 끌어오지 않게).

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/** lib/server/meta-lead-mirror.ts 의 META_LEAD_MIRROR_HEALTH_RPC 와 같은 이름(테스트가 대조한다) */
export const META_LEAD_MIRROR_HEALTH_FUNCTION = "meta_lead_mirror_health"

/** 기본 상한 — 건강 함수는 수신·원장·리드 90일 창을 센다 */
export const META_LEAD_MIRROR_HEALTH_TIMEOUT_MS = 8_000

export type MetaLeadMirrorHealthRead =
  | { ok: true; health: Record<string, unknown> }
  | { ok: false; error: string }

function errorLabel(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown }
    const message = typeof record.message === "string" ? record.message : String(record.message ?? "")
    return typeof record.code === "string" && record.code ? `${record.code} ${message}`.trim() : message
  }
  return String(error)
}

function clip(value: string, max = 200) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/** 건강 RPC 한 번. 절대 throw 하지 않는다 — 오류·시간 초과·객체가 아닌 응답은 ok:false. */
export async function readMetaLeadMirrorHealth(
  options: { timeoutMs?: number } = {}
): Promise<MetaLeadMirrorHealthRead> {
  const timeoutMs = options.timeoutMs ?? META_LEAD_MIRROR_HEALTH_TIMEOUT_MS
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const sb = createSupabaseAdminClient()
    const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve({ data: null, error: { message: `${timeoutMs}ms 초과` } })
      }, timeoutMs)
    })
    const call = Promise.resolve(sb.rpc(META_LEAD_MIRROR_HEALTH_FUNCTION).abortSignal(controller.signal)) as Promise<{
      data: unknown
      error: unknown
    }>
    const { data, error } = await Promise.race([call, timeout])
    if (error) return { ok: false, error: clip(`${META_LEAD_MIRROR_HEALTH_FUNCTION} 실패: ${errorLabel(error)}`) }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: `${META_LEAD_MIRROR_HEALTH_FUNCTION}: 객체가 아닌 응답` }
    }
    return { ok: true, health: data as Record<string, unknown> }
  } catch (error) {
    return { ok: false, error: clip(`${META_LEAD_MIRROR_HEALTH_FUNCTION} 실패: ${errorLabel(error)}`) }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
