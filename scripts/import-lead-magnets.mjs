/**
 * import-lead-magnets.mjs
 * data/lead-magnets.json → Supabase lead_magnets 테이블 이관(업서트, 1회성)
 *
 * 실행:
 *   node --env-file=.env.local scripts/import-lead-magnets.mjs
 *   node --env-file=.env.local scripts/import-lead-magnets.mjs --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { buildLeadMagnetImportPlan } from "./lib/lead-magnets-import-plan.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "../data/lead-magnets.json");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const unsupportedArgs = Array.from(args).filter((arg) => arg !== "--dry-run");

if (unsupportedArgs.length > 0) {
  console.error(`지원하지 않는 옵션입니다: ${unsupportedArgs.join(", ")}`);
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const magnets = JSON.parse(readFileSync(dataPath, "utf8"));

if (!Array.isArray(magnets)) {
  console.error("data/lead-magnets.json 최상위는 배열이어야 합니다.");
  process.exit(1);
}

if (dryRun) {
  const localPlan = buildLeadMagnetImportPlan(magnets);
  const slugs = Array.from(new Set(localPlan.operations.map((operation) => operation.slug)));
  const { data: existing, error } = slugs.length > 0
    ? await supabase
        .from("lead_magnets")
        .select("slug, data, published")
        .in("slug", slugs)
    : { data: [], error: null };

  if (error) {
    // 테이블 미적용 환경에서도 로컬 문서 유효성과 "마이그레이션 후 초기 이관" 예상치는
    // 제공한다. DB 현재값과 비교한 진짜 update/unchanged 판정은 schemaReady 이후만 가능하다.
    console.log("[lead-magnets:dry-run] read-only preview — DB 쓰기 없음");
    console.log(JSON.stringify({
      schemaReady: false,
      blocker: error.message,
      total: localPlan.total,
      valid: localPlan.valid,
      invalid: localPlan.invalid,
      duplicateSlugs: localPlan.duplicateSlugs,
      afterSchemaApply: {
        wouldInsert: localPlan.wouldInsert,
        wouldUpdate: localPlan.wouldUpdate,
        unchanged: localPlan.unchanged,
        wouldUpsert: localPlan.wouldUpsert,
      },
    }, null, 2));
    process.exitCode = 1;
  } else {
    const plan = buildLeadMagnetImportPlan(magnets, existing ?? []);
    console.log("[lead-magnets:dry-run] read-only preview — DB 쓰기 없음");
    console.log(JSON.stringify({
      schemaReady: true,
      total: plan.total,
      valid: plan.valid,
      invalid: plan.invalid,
      duplicateSlugs: plan.duplicateSlugs,
      existingRows: existing?.length ?? 0,
      wouldInsert: plan.wouldInsert,
      wouldUpdate: plan.wouldUpdate,
      unchanged: plan.unchanged,
      wouldUpsert: plan.wouldUpsert,
    }, null, 2));
    if (plan.invalid > 0 || plan.duplicateSlugs.length > 0) process.exitCode = 1;
  }
} else {
  let failed = 0;
  for (const magnet of magnets) {
    if (!magnet?.slug) {
      console.error("slug 없는 항목을 건너뜁니다:", magnet?.title ?? "(제목 없음)");
      failed += 1;
      continue;
    }
    const { error } = await supabase
      .from("lead_magnets")
      .upsert(
        { slug: magnet.slug, data: magnet, published: magnet.published === true },
        { onConflict: "slug" }
      );
    if (error) {
      console.error("실패:", magnet.slug, "—", error.message);
      failed += 1;
    } else {
      console.log("업서트:", magnet.slug);
    }
  }

  console.log(`완료 — ${magnets.length - failed}/${magnets.length} 업서트`);
  if (failed > 0) process.exitCode = 1;
}
