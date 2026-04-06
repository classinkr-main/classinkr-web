/**
 * seed-roadmap.mjs
 * data/roadmap.json → Supabase roadmap_items 테이블 이관
 *
 * 실행:
 *   node --env-file=.env.local scripts/seed-roadmap.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "../data/roadmap.json");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ 환경변수 누락");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const raw = JSON.parse(readFileSync(dataPath, "utf-8"));
  console.log(`📄 JSON에서 ${raw.length}개 로드맵 아이템 발견`);

  const rows = raw.map((item) => ({
    version: item.version,
    title: item.title,
    status: item.status,
    start_date: item.startDate ?? null,
    target_date: item.targetDate ?? null,
    features: item.features ?? [],
  }));

  const { data, error } = await supabase
    .from("roadmap_items")
    .insert(rows)
    .select("id, version, title");

  if (error) {
    console.error("❌ 삽입 실패:", error.message);
    process.exit(1);
  }

  console.log(`✅ ${data.length}개 로드맵 아이템 삽입 완료`);
  data.forEach((r) => console.log(`  - [${r.id.slice(0, 8)}...] ${r.version} ${r.title}`));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
