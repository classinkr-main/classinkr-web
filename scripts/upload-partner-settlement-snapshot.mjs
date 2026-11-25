/**
 * upload-partner-settlement-snapshot.mjs
 * 정산 대조 스크립트가 만든 스냅샷 JSON → Supabase partner_settlement_snapshots 한 행(총판마다 최신 1행, 덮어쓰기).
 * 견적·문서 › 총판 미수금의 쿼드러닝 보드와 Overview 카드가 이 행을 읽는다.
 *
 * 운영자가 직접 실행한다(운영 DB에 쓴다). 표가 먼저 있어야 한다:
 *   supabase/migrations/20261123_partner_settlement_snapshots.sql
 *
 * 실행:
 *   node --env-file=.env.local scripts/upload-partner-settlement-snapshot.mjs <snapshot.json> [partner=quad]
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const [file, partner = "quad"] = process.argv.slice(2);
if (!file) {
  console.error("사용: node --env-file=.env.local scripts/upload-partner-settlement-snapshot.mjs <snapshot.json> [partner=quad]");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(file, "utf8"));
// 화면이 읽는 머리값만 확인한다. 자세한 모양 검사는 읽을 때 lib/partner-settlement.ts 가 한다.
if (typeof snapshot?.generatedAt !== "string" || typeof snapshot?.totals?.balance !== "number") {
  console.error("스냅샷 모양이 아닙니다 — generatedAt(문자열)과 totals.balance(숫자)가 필요합니다.");
  process.exit(1);
}

const generatedAt = new Date(snapshot.generatedAt);
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await supabase.from("partner_settlement_snapshots").upsert(
  {
    partner,
    snapshot,
    generated_at: Number.isNaN(generatedAt.getTime()) ? null : generatedAt.toISOString(),
    updated_by: "scripts/upload-partner-settlement-snapshot.mjs",
  },
  { onConflict: "partner" }
);
if (error) {
  console.error(`올리지 못했습니다: ${error.message}`);
  process.exit(1);
}

console.log(`partner=${partner} generatedAt=${snapshot.generatedAt} balance=${snapshot.totals.balance}`);
