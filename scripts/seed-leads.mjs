/**
 * seed-leads.mjs
 * data/leads.json → Supabase leads 테이블 이관
 *
 * 실행:
 *   node --env-file=.env.local scripts/seed-leads.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "../data/leads.json");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SECRET_KEY 누락");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const raw = JSON.parse(readFileSync(dataPath, "utf-8"));
  console.log(`📄 JSON에서 ${raw.length}개 리드 발견`);

  if (raw.length === 0) {
    console.log("⏩ 이관할 리드 없음 (JSON이 비어 있음)");
    return;
  }

  // 기존 lead id 목록 (중복 방지 — JSON id는 문자열, Supabase는 UUID라 그냥 전체 삽입)
  const rows = raw.map((lead) => ({
    source: lead.source ?? "manual",
    name: lead.name ?? null,
    org: lead.org ?? null,
    role: lead.role ?? null,
    size: lead.size ?? null,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    message: lead.message ?? null,
    branch: lead.branch ?? null,
    status: lead.status ?? "new",
    notes: lead.notes ?? null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    created_at: lead.timestamp ?? new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("leads")
    .insert(rows)
    .select("id, source, name");

  if (error) {
    console.error("❌ 삽입 실패:", error.message);
    process.exit(1);
  }

  console.log(`✅ ${data.length}개 리드 Supabase 삽입 완료`);
  data.forEach((l) => console.log(`  - [${l.id.slice(0, 8)}...] ${l.source} / ${l.name ?? "(이름 없음)"}`));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
