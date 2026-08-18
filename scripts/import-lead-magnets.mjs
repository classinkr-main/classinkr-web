/**
 * import-lead-magnets.mjs
 * data/lead-magnets.json → Supabase lead_magnets 테이블 이관(업서트, 1회성)
 *
 * 실행:
 *   node --env-file=.env.local scripts/import-lead-magnets.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "../data/lead-magnets.json");

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
