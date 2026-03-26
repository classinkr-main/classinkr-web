/**
 * seed-blog-posts.mjs
 * data/blog-posts.json → Supabase blog_posts 테이블 이관
 *
 * 실행:
 *   node --env-file=.env.local scripts/seed-blog-posts.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "../data/blog-posts.json");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SECRET_KEY 누락");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^\w가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/-$/, "");
}

function normalizeTags(tag, tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (typeof tags === "string" && tags.trim()) return [tags.trim()];
  if (typeof tag === "string" && tag.trim()) return [tag.trim()];
  return [];
}

async function run() {
  const raw = JSON.parse(readFileSync(dataPath, "utf-8"));
  console.log(`📄 JSON에서 ${raw.length}개 포스트 발견`);

  // 기존 slug 목록 가져와서 중복 방지
  const { data: existing } = await supabase.from("blog_posts").select("slug");
  const existingSlugs = new Set((existing ?? []).map((r) => r.slug));

  const rows = [];
  const slugCount = {};

  for (const post of raw) {
    let slug = slugify(post.slug ?? post.title ?? "post");

    // 중복 slug 처리
    if (existingSlugs.has(slug) || slugCount[slug]) {
      const base = slug;
      let n = 2;
      while (existingSlugs.has(`${base}-${n}`) || slugCount[`${base}-${n}`]) n++;
      slug = `${base}-${n}`;
    }
    slugCount[slug] = true;

    rows.push({
      title: post.title ?? "제목 없음",
      slug,
      excerpt: post.excerpt ?? null,
      content_markdown: post.contentMarkdown ?? null,
      content_html: null,
      category: post.category ?? null,
      tags: normalizeTags(post.tag, post.tags),
      author_name: post.author ?? null,
      author_role: post.authorRole ?? null,
      author_bio: post.authorBio ?? null,
      author_avatar_url: post.authorAvatarUrl ?? null,
      author_user_id: null,
      read_time: post.readTime ?? null,
      image_url: post.imageUrl ?? null,
      hero_image_url: post.heroImageUrl ?? post.imageUrl ?? null,
      featured: post.featured ?? false,
      status: post.status?.toUpperCase() ?? "PUBLISHED",
      seo_title: post.seoTitle ?? null,
      seo_description: post.seoDescription ?? null,
      benefit_items: post.benefitItems ?? [],
      target_reader: post.targetReader ?? null,
      cta_text: post.cta?.buttonLabel ?? null,
      cta_url: post.cta?.buttonHref ?? null,
      cta_style: "primary",
      related_post_ids: [],
      published_at: new Date().toISOString(),
      published_by: null,
      deleted_at: post.deletedAt ?? null,
    });
  }

  if (rows.length === 0) {
    console.log("⏩ 삽입할 새 포스트 없음");
    return;
  }

  const { data, error } = await supabase
    .from("blog_posts")
    .insert(rows)
    .select("id, slug, title");

  if (error) {
    console.error("❌ 삽입 실패:", error.message);
    process.exit(1);
  }

  console.log(`✅ ${data.length}개 포스트 Supabase 삽입 완료`);
  data.forEach((p) => console.log(`  - [${p.id.slice(0, 8)}...] ${p.slug}`));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
