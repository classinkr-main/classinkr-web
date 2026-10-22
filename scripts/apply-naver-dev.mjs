/**
 * apply-naver-dev.mjs
 *
 * Write the developed Naver posts (data/_naver-dev/<slug>.md) back to Supabase blog_posts.
 * Matches rows by id using data/_naver-pull/manifest.json. 공개 상태(status)는 바꾸지 않는다.
 *
 * 새 글: data/_naver-pull/pending-inserts.json(import-naver-blog-posts.mjs --local 이 만든다)에 있고
 * manifest 에 없는 slug 는 다듬은 본문으로 DRAFT 행을 새로 넣는다. 넣은 뒤에는 pending 에서 빼고
 * manifest 에 행을 덧붙여 다음 실행부터 id 로 갱신되게 한다.
 *
 * 수기 편집 보호: --baseline-ref=<git ref> 를 주면, 지금 DB 본문이 그 ref 시점의
 * data/_naver-dev/<slug>.md 와 다를 때(어드민에서 손으로 고친 것으로 보고) 건너뛴다.
 *
 * Updates: content_markdown, excerpt, seo_title, seo_description, benefit_items, read_time
 * (only columns known to exist from the original import).
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-naver-dev.mjs          # DRY-RUN (no writes)
 *   node --env-file=.env.local scripts/apply-naver-dev.mjs --write  # apply
 *   node --env-file=.env.local scripts/apply-naver-dev.mjs --write --baseline-ref=<commit>
 *
 * Restore (if needed): re-run import with manifest, or write content_markdown back
 * from data/_naver-pull/manifest.json (full original rows are stored there).
 */

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const pullDir = join(projectRoot, "data", "_naver-pull");
const devDir = join(projectRoot, "data", "_naver-dev");

const WRITE = process.argv.includes("--write");
const baselineArg = process.argv.find((arg) => arg.startsWith("--baseline-ref="));
const BASELINE_REF = baselineArg ? baselineArg.slice("--baseline-ref=".length) : "";
const pendingInsertsPath = join(pullDir, "pending-inserts.json");
const manifestPath = join(pullDir, "manifest.json");

function baselineContent(slug) {
  try {
    return execFileSync("git", ["show", `${BASELINE_REF}:data/_naver-dev/${slug}.md`], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

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

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const slugToRow = new Map(manifest.map((r) => [r.slug, r]));

const metaPath = join(devDir, "_meta.json");
const metaList = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : [];
const slugToMeta = new Map(metaList.map((m) => [m.slug, m]));

console.log(`[mode] ${WRITE ? "WRITE" : "DRY-RUN"}  posts=${slugToRow.size}  meta=${metaList.length}  baseline=${BASELINE_REF || "(없음: 수기 편집 확인 생략)"}`);

let applied = 0;
let skipped = 0;
let inserted = 0;

function buildFields(slug, content, fallback) {
  const meta = slugToMeta.get(slug) || {};
  return {
    content_markdown: content,
    excerpt: meta.excerpt?.trim() || firstSentences(content),
    seo_title: meta.seoTitle?.trim() || fallback.seo_title,
    seo_description: meta.seoDescription?.trim() || firstSentences(content, 150),
    benefit_items: Array.isArray(meta.benefitItems) && meta.benefitItems.length ? meta.benefitItems : fallback.benefit_items,
    read_time: estimateReadTime(content),
  };
}

for (const [slug, row] of slugToRow) {
  const devPath = join(devDir, `${slug}.md`);
  if (!existsSync(devPath)) {
    console.warn(`[skip] no dev file: ${slug}`);
    skipped += 1;
    continue;
  }
  const content = readFileSync(devPath, "utf8").trim();
  const update = buildFields(slug, content, row);

  if (BASELINE_REF) {
    const baseline = baselineContent(slug);
    const { data: current, error: currentError } = await supabase
      .from("blog_posts")
      .select("content_markdown, status, updated_at")
      .eq("id", row.id)
      .maybeSingle();
    if (currentError || !current) {
      console.error(`   ! ${slug}: 현재 행 조회 실패, 건너뜀`);
      skipped += 1;
      continue;
    }
    const now = (current.content_markdown || "").trim();
    if (now !== content && now !== baseline) {
      console.warn(`[skip] ${slug}: DB 본문이 ${BASELINE_REF} 시점과 달라 수기 편집으로 보고 건너뜀 (updated_at=${current.updated_at})`);
      skipped += 1;
      continue;
    }
  }

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

// ── 새 글: pending-inserts.json → DRAFT 로 넣기 ──
const pending = existsSync(pendingInsertsPath) ? JSON.parse(readFileSync(pendingInsertsPath, "utf8")) : [];
const stillPending = [];
for (const record of pending) {
  const slug = record.slug;
  const devPath = join(devDir, `${slug}.md`);
  if (slugToRow.has(slug)) continue;
  if (!existsSync(devPath)) {
    console.warn(`[skip] new post without dev file: ${slug}`);
    stillPending.push(record);
    continue;
  }
  const content = readFileSync(devPath, "utf8").trim();
  const insert = { ...record, ...buildFields(slug, content, record), status: "DRAFT", published_at: null };
  console.log(`\n[new] ${slug}`);
  console.log(`   chars ${content.length}   read=${insert.read_time}   status=DRAFT`);
  console.log(`   excerpt: ${insert.excerpt.slice(0, 90)}...`);

  if (!WRITE) {
    stillPending.push(record);
    continue;
  }

  const { data: existing, error: existingError } = await supabase.from("blog_posts").select("id").eq("slug", slug).maybeSingle();
  if (existingError) {
    console.error(`   ! slug 확인 실패: ${existingError.message}`);
    stillPending.push(record);
    continue;
  }
  if (existing) {
    console.warn(`   ! 이미 같은 slug 행이 있어 넣지 않음 (id=${existing.id})`);
    stillPending.push(record);
    continue;
  }
  const { data: row, error } = await supabase.from("blog_posts").insert(insert).select("*").single();
  if (error) {
    console.error(`   ! insert failed: ${error.message}`);
    stillPending.push(record);
    continue;
  }
  console.log(`   + inserted id=${row.id} (DRAFT)`);
  manifest.push(row);
  inserted += 1;
}

if (WRITE && inserted > 0) {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  writeFileSync(pendingInsertsPath, `${JSON.stringify(stillPending, null, 2)}\n`);
}

console.log(`\n[summary] ${WRITE ? `applied=${applied} inserted=${inserted}` : "dry-run (no writes)"} skipped=${skipped}`);
if (!WRITE) console.log("Run with --write to apply.");
