/**
 * pull-naver-blog-posts.mjs
 *
 * Pull all naver-* blog posts from Supabase into a local backup + per-post markdown,
 * so we can develop the content offline and write it back later.
 *
 * Usage:
 *   node --env-file=.env.local scripts/pull-naver-blog-posts.mjs
 *
 * Output:
 *   data/_naver-pull/manifest.json        full rows (backup / restore point)
 *   data/_naver-pull/<slug>.md            content_markdown per post (for review)
 */

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const outDir = join(projectRoot, "data", "_naver-pull");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("[err] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 누락");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .like("slug", "naver-%")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`[db] query failed: ${error.message}`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(data, null, 2));

  for (const row of data) {
    const imgCount = (row.content_markdown?.match(/!\[[^\]]*]\([^)]+\)/g) || []).length;
    writeFileSync(join(outDir, `${row.slug}.md`), row.content_markdown || "");
    console.log(
      `[post] id=${row.id} status=${row.status} chars=${(row.content_markdown || "").length} images=${imgCount} ${row.slug}`
    );
  }

  console.log(`\n[done] pulled ${data.length} posts -> ${outDir}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
