/**
 * backfill-event-slugs.mjs
 * public_events 테이블에서 slug가 비어 있는 행에 자동 slug 채워넣기.
 * supabase/migrations/20260430_backfill_public_event_slugs.sql 와 동일 효과,
 * Supabase CLI 없는 환경에서 JS 클라이언트로 실행.
 *
 * 멱등성: slug가 이미 있는 행은 건드리지 않음.
 *
 * 실행:
 *   node --env-file=.env.local scripts/backfill-event-slugs.mjs
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SECRET_KEY 누락");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalizeSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-가-힣]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function generateSlug(title, id) {
  const base = normalizeSlug(title);
  const suffix = id.slice(0, 5);
  return base ? `${base}-${suffix}` : `event-${suffix}`;
}

async function main() {
  const { data, error } = await supabase
    .from("public_events")
    .select("id, title, slug")
    .or("slug.is.null,slug.eq.");

  if (error) {
    console.error("❌ 조회 실패:", error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log("✅ 백필 대상 없음. 모든 행에 slug가 채워져 있음.");
    return;
  }

  console.log(`🔍 백필 대상: ${data.length}건`);

  let ok = 0;
  let fail = 0;
  for (const row of data) {
    const newSlug = generateSlug(row.title, row.id);
    const { error: updateErr } = await supabase
      .from("public_events")
      .update({ slug: newSlug })
      .eq("id", row.id);
    if (updateErr) {
      console.error(`  ✗ ${row.id} (${row.title}): ${updateErr.message}`);
      fail++;
    } else {
      console.log(`  ✓ ${row.id} → ${newSlug}`);
      ok++;
    }
  }

  console.log(`\n완료: 성공 ${ok}건, 실패 ${fail}건`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("❌ 예외:", e);
  process.exit(1);
});
