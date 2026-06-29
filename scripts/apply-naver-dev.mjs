/**
 * apply-naver-dev.mjs
 *
 * Write the developed Naver posts (data/_naver-dev/<slug>.md) back to Supabase blog_posts.
 * Matches rows by id using data/_naver-pull/manifest.json. Posts stay DRAFT.
 *
 * Updates: content_markdown, excerpt, seo_title, seo_description, benefit_items, read_time
 * (only columns known to exist from the original import).
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-naver-dev.mjs          # DRY-RUN (no writes)
 *   node --env-file=.env.local scripts/apply-naver-dev.mjs --write  # apply
 *
 * Restore (if needed): re-run import with manifest, or write content_markdown back
 * from data/_naver-pull/manifest.json (full original rows are stored there).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const pullDir = join(projectRoot, "data", "_naver-pull");
const devDir = join(projectRoot, "data", "_naver-dev");

const WRITE = process.argv.includes("--write");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("[err] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 누락");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function stripMarkdown(md) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/\{\{green:(.+?)\}\}/g, "$1")
    .replace(/==(.+?)==/g, "$1")
    .replace(/[*_~`>#|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estimateReadTime(md) {
  const len = stripMarkdown(md).length;
  return `${Math.max(1, Math.ceil(len / 650))}분`;
}

function firstSentences(md, maxLength = 180) {
  const text = stripMarkdown(md);
  if (text.length <= maxLength) return text;
  const candidate = text.slice(0, maxLength);
  const end = Math.max(candidate.lastIndexOf("다."), candidate.lastIndexOf("."), candidate.lastIndexOf("?"), candidate.lastIndexOf("!"));
  return `${candidate.slice(0, end > 70 ? end + 1 : maxLength - 1).trim()}…`;
}

const manifest = JSON.parse(readFileSync(join(pullDir, "manifest.json"), "utf8"));
const slugToRow = new Map(manifest.map((r) => [r.slug, r]));

const metaPath = join(devDir, "_meta.json");
const metaList = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : [];
const slugToMeta = new Map(metaList.map((m) => [m.slug, m]));

console.log(`[mode] ${WRITE ? "WRITE" : "DRY-RUN"}  posts=${slugToRow.size}  meta=${metaList.length}`);

let applied = 0;
let skipped = 0;

for (const [slug, row] of slugToRow) {
  const devPath = join(devDir, `${slug}.md`);
  if (!existsSync(devPath)) {
    console.warn(`[skip] no dev file: ${slug}`);
    skipped += 1;
    continue;
  }
  const content = readFileSync(devPath, "utf8").trim();
  const meta = slugToMeta.get(slug) || {};

  const update = {
    content_markdown: content,
    excerpt: meta.excerpt?.trim() || firstSentences(content),
    seo_title: meta.seoTitle?.trim() || row.seo_title,
    seo_description: meta.seoDescription?.trim() || firstSentences(content, 150),
    benefit_items: Array.isArray(meta.benefitItems) && meta.benefitItems.length ? meta.benefitItems : row.benefit_items,
    read_time: estimateReadTime(content),
  };

  const beforeLen = (row.content_markdown || "").length;
  console.log(`\n[post] ${slug}`);
  console.log(`   chars ${beforeLen} -> ${content.length}   read=${update.read_time}`);
  console.log(`   excerpt: ${update.excerpt.slice(0, 90)}...`);

  if (!WRITE) {
    skipped += 1;
    continue;
  }

  const { error } = await supabase.from("blog_posts").update(update).eq("id", row.id);
  if (error) {
    console.error(`   ! update failed: ${error.message}`);
  } else {
    console.log(`   ~ updated id=${row.id} (status stays ${row.status})`);
    applied += 1;
  }
}

console.log(`\n[summary] ${WRITE ? `applied=${applied}` : "dry-run (no writes)"} skipped=${skipped}`);
if (!WRITE) console.log("Run with --write to apply.");
