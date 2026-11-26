import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * 계약 번호(`C-<연도>-<NNN>`) 채번.
 * 직접 작성(V1 `contracts`)과 견적 전환(V2 `contract_documents`)이 한 목록에 합쳐 보이므로
 * 두 표를 모두 보고 해당 연도의 최대 순번 + 1 을 돌려준다.
 * 행 수(count)가 아니라 최대 순번을 쓰므로 삭제 후에도 번호를 재사용하지 않는다.
 */

const CONTRACT_TABLES = ["contracts", "contract_documents"] as const;
// 해당 연도 번호를 이만큼까지 읽는다. 사전순 내림차순이라 999 를 넘어가도(C-2026-1000 < C-2026-999)
// 이 범위 안에 최댓값이 들어오도록 넉넉히 잡는다.
const FETCH_LIMIT = 2000;

export const CONTRACT_NUMBER_INSERT_ATTEMPTS = 3;

function parseSequence(contractNumber: unknown, prefix: string): number {
  if (typeof contractNumber !== "string" || !contractNumber.startsWith(prefix)) return 0;
  const suffix = contractNumber.slice(prefix.length);
  return /^\d+$/.test(suffix) ? Number(suffix) : 0;
}

export async function generateContractNumber(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getFullYear();
  const prefix = `C-${year}-`;

  let maxSequence = 0;
  for (const table of CONTRACT_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select("contract_number")
      .like("contract_number", `${prefix}%`)
      .order("contract_number", { ascending: false })
      .limit(FETCH_LIMIT);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ contract_number: unknown }>) {
      maxSequence = Math.max(maxSequence, parseSequence(row.contract_number, prefix));
    }
  }

  return `${prefix}${String(maxSequence + 1).padStart(3, "0")}`;
}

/** Postgres 유니크 제약 위반(23505) 여부 — 동시 채번 충돌 재시도 판단에 쓴다. */
export function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && (error as { code?: unknown }).code === "23505"
  );
}
