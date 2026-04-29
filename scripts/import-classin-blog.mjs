/**
 * import-classin-blog.mjs
 *
 * classin.com/kr/blog (WordPress) → Supabase blog_posts 일괄 임포트
 *
 * 실행:
 *   node --env-file=.env.local scripts/import-classin-blog.mjs --dry
 *   node --env-file=.env.local scripts/import-classin-blog.mjs --only=<slug>
 *   node --env-file=.env.local scripts/import-classin-blog.mjs           (실삽입)
 *
 * 동작:
 *  1) https://www.classin.com/kr/wp-json/wp/v2/posts?per_page=100&_embed=1 조회
 *  2) 각 글의 컨텐츠 내 <img> 다운로드 → public/images/blog/imported/{slug}/
 *  3) HTML → 사이트 자체 마크다운 (BlogMarkdownRenderer 호환) 변환
 *  4) Supabase blog_posts INSERT
 *      - status: PUBLISHED
 *      - published_at: 원본 발행일 보존
 *      - author_name: 원본 작성자 보존
 *      - 중복 slug 발견 시 skip
 */

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, extname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const imageRootRel = "public/images/blog/imported";
const imageRootAbs = join(projectRoot, imageRootRel);
const imagePublicPrefix = "/images/blog/imported";

const args = new Set(process.argv.slice(2));
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY_SLUG = onlyArg ? onlyArg.slice("--only=".length) : null;
const DRY_RUN = args.has("--dry");
const UPDATE_EXISTING = args.has("--update");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("[err] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 누락");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ─── HTML 엔티티 디코드 ─── */
const ENTITY_MAP = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  hellip: "…", mdash: "—", ndash: "–", middot: "·",
};
function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (ENTITY_MAP[name] !== undefined ? ENTITY_MAP[name] : m));
}

/* ─── 카테고리 매핑 (원본 → 사이트 enum) ─── */
const CATEGORY_MAP = {
  "성공 사례": "성공 사례",
  "교육 인사이트": "교육 트렌드",
  "사용 가이드": "인사이트",
  "업데이트 소식": "제품 업데이트",
  "클래스인 뉴스": "인사이트",
};

/* ─── slug 정리 (URL 인코딩된 한글 → 그대로 보존) ─── */
function cleanSlug(rawSlug) {
  try {
    const decoded = decodeURIComponent(rawSlug);
    return decoded.replace(/^-|-$/g, "").slice(0, 200);
  } catch {
    return rawSlug;
  }
}

/* ─── 이미지 다운로드 ─── */
async function downloadImage(url, destPath, referer) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  };
  if (referer) headers.Referer = referer;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
}

function normalizeImageUrl(url) {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/st2.classin.com")) return `https:/${url}`;
  if (url.startsWith("/")) return `https://www.classin.com${url}`;
  return url;
}

function extToFilename(url, fallbackIdx) {
  const cleaned = url.split("?")[0].split("#")[0];
  const base = cleaned.split("/").pop() || `image-${fallbackIdx}`;
  let safe = base.replace(/[^\w.\-]/g, "_");
  if (!extname(safe)) safe += ".jpg";
  return safe;
}

async function processImages(html, slug, referer) {
  const imgRegex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  const seen = new Map(); // url → localPath
  const matches = [...html.matchAll(imgRegex)];

  if (matches.length === 0) return { html, firstLocalUrl: null };

  const slugDir = join(imageRootAbs, slug);
  if (!DRY_RUN) {
    mkdirSync(slugDir, { recursive: true });
  }

  let firstLocalUrl = null;
  let counter = 0;

  for (const m of matches) {
    const rawUrl = m[1];
    const url = normalizeImageUrl(rawUrl);
    if (!url || seen.has(rawUrl)) continue;

    counter += 1;
    let filename = extToFilename(url, counter);
    let dest = join(slugDir, filename);
    let suffix = 1;
    while (existsSync(dest)) {
      const dot = filename.lastIndexOf(".");
      const stem = dot === -1 ? filename : filename.slice(0, dot);
      const ext = dot === -1 ? "" : filename.slice(dot);
      filename = `${stem}_${suffix}${ext}`;
      dest = join(slugDir, filename);
      suffix += 1;
    }

    const localUrl = `${imagePublicPrefix}/${slug}/${filename}`;
    seen.set(rawUrl, localUrl);
    if (!firstLocalUrl) firstLocalUrl = localUrl;

    if (DRY_RUN) {
      console.log(`   [dry] would download ${url} → ${localUrl}`);
    } else {
      try {
        await downloadImage(url, dest, referer);
        console.log(`   ✓ ${url} → ${localUrl}`);
      } catch (e) {
        console.warn(`   ! 이미지 실패 ${url}: ${e.message}`);
        seen.delete(rawUrl);
        if (firstLocalUrl === localUrl) firstLocalUrl = null;
      }
    }
  }

  let nextHtml = html;
  for (const [orig, local] of seen.entries()) {
    nextHtml = nextHtml.replaceAll(orig, local);
  }
  return { html: nextHtml, firstLocalUrl };
}

/* ─── HTML → 사이트 마크다운 변환 ─── */
function htmlToMarkdown(rawHtml) {
  let s = rawHtml;

  // 주석 제거
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  // script/style 제거
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  // <br> → 줄바꿈
  s = s.replace(/<br\s*\/?>/gi, "\n");
  // <hr>
  s = s.replace(/<hr[^>]*>/gi, "\n\n---\n\n");

  // 이미지 (블록)
  s = s.replace(
    /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*>/gi,
    (_m, src, alt) => `\n\n![${(alt || "").replace(/[\[\]]/g, "")}](${src})\n\n`
  );
  // alt 가 src 앞에 있는 케이스
  s = s.replace(
    /<img\b[^>]*?\balt=["']([^"']*)["'][^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi,
    (_m, alt, src) => `\n\n![${(alt || "").replace(/[\[\]]/g, "")}](${src})\n\n`
  );

  // figure / figcaption 처리: 그냥 안쪽 보존
  s = s.replace(/<figure[^>]*>/gi, "\n\n").replace(/<\/figure>/gi, "\n\n");
  s = s.replace(/<figcaption[^>]*>/gi, "\n_").replace(/<\/figcaption>/gi, "_\n");

  // 헤딩
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, c) => `\n\n## ${stripInline(c)}\n\n`);
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, c) => `\n\n## ${stripInline(c)}\n\n`);
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, c) => `\n\n### ${stripInline(c)}\n\n`);
  s = s.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_m, c) => `\n\n### ${stripInline(c)}\n\n`);

  // blockquote
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, c) => {
    const text = stripInline(c).replace(/\n+/g, " ").trim();
    return text ? `\n\n> ${text}\n\n` : "";
  });

  // 리스트
  s = s.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, c) => {
    const items = [...c.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((it) => `- ${stripInline(it[1]).replace(/\n+/g, " ").trim()}`)
      .filter((line) => line !== "- ")
      .join("\n");
    return items ? `\n\n${items}\n\n` : "";
  });
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, c) => {
    let i = 0;
    const items = [...c.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((it) => {
        i += 1;
        return `${i}. ${stripInline(it[1]).replace(/\n+/g, " ").trim()}`;
      })
      .filter((line) => !/^\d+\. $/.test(line))
      .join("\n");
    return items ? `\n\n${items}\n\n` : "";
  });

  // 단락
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, c) => {
    const text = stripInline(c);
    return text.trim() ? `\n\n${text}\n\n` : "\n\n";
  });

  // div는 그냥 줄바꿈으로
  s = s.replace(/<\/?(div|section|article|main|header|footer|aside)[^>]*>/gi, "\n\n");

  // 잔여 인라인 처리 + 모든 태그 제거
  s = stripInline(s);

  // 정리
  s = decodeEntities(s);
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/^\s+|\s+$/g, "");
  return s;
}

function stripInline(html) {
  let s = html;
  // 강조
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, c) => {
    const inner = stripInline(c).trim();
    return inner ? `**${inner}**` : "";
  });
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, c) => {
    const inner = stripInline(c).trim();
    return inner ? `*${inner}*` : "";
  });
  // 링크
  s = s.replace(/<a\b[^>]*?\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, c) => {
    const label = stripInline(c).trim();
    if (!label) return "";
    if (!/^https?:\/\//i.test(href) && !href.startsWith("/")) return label;
    return `[${label}](${href})`;
  });
  // 코드
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, c) => {
    const inner = c.replace(/<[^>]+>/g, "").trim();
    return inner ? `\`${inner}\`` : "";
  });
  // span 등 인라인은 내용만 보존
  s = s.replace(/<\/?(span|font|small|big|sub|sup|u|s|strike|mark)\b[^>]*>/gi, "");
  // 잔여 태그 제거
  s = s.replace(/<[^>]+>/g, "");
  return s;
}

/* ─── excerpt 정리 ─── */
function cleanExcerpt(html) {
  const text = decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return text.replace(/ /g, " ").slice(0, 240);
}

/* ─── read time 추정 ─── */
function estimateReadTime(markdown) {
  const text = markdown.replace(/[#*_`>!\[\]()-]/g, " ").replace(/\s+/g, " ");
  const words = text ? text.split(" ").length : 0;
  const minutes = Math.max(1, Math.ceil(words / 220));
  return `${minutes}분`;
}

/* ─── main ─── */
async function run() {
  console.log(
    `[mode] ${DRY_RUN ? "DRY-RUN" : "WRITE"}${UPDATE_EXISTING ? " UPDATE-EXISTING" : ""}${
      ONLY_SLUG ? ` only=${ONLY_SLUG}` : ""
    }`
  );

  const apiUrl = "https://www.classin.com/kr/wp-json/wp/v2/posts?per_page=100&_embed=1";
  console.log(`[fetch] ${apiUrl}`);
  const res = await fetch(apiUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) {
    console.error(`[err] WP API HTTP ${res.status}`);
    process.exit(1);
  }
  const posts = await res.json();
  console.log(`[fetch] ${posts.length}개 글 수신`);

  // 기존 slug → uuid 매핑
  const { data: existing } = await supabase.from("blog_posts").select("id, slug");
  const slugToId = new Map((existing ?? []).map((r) => [r.slug, r.id]));
  console.log(`[db] 기존 글 ${slugToId.size}개`);

  const inserts = [];
  const updates = []; // { id, record }
  let skipped = 0;

  for (const p of posts) {
    const slug = cleanSlug(p.slug);
    if (ONLY_SLUG && slug !== ONLY_SLUG) continue;

    const existsId = slugToId.get(slug);
    if (existsId && !UPDATE_EXISTING) {
      console.log(`[skip] ${slug} (이미 존재, --update 로 강제 갱신)`);
      skipped += 1;
      continue;
    }

    const title = decodeEntities(p.title?.rendered ?? "").replace(/<[^>]+>/g, "").trim();
    const author = p._embedded?.author?.[0]?.name?.trim() || "ClassIn";
    const rawCategory = (p._embedded?.["wp:term"] ?? [])
      .flat()
      .find((t) => t.taxonomy === "category")?.name;
    const mappedCategory = CATEGORY_MAP[rawCategory] ?? "인사이트";
    const tags = rawCategory && rawCategory !== mappedCategory ? [rawCategory] : [];

    const publishedAt = p.date ? new Date(p.date).toISOString() : new Date().toISOString();

    console.log(`\n[post] ${title}`);
    console.log(`   slug=${slug}`);
    console.log(`   date=${publishedAt}  author=${author}  cat=${rawCategory} → ${mappedCategory}`);

    // 이미지 처리 + URL 치환 (Referer 헤더로 hotlink 차단 우회)
    const referer = p.link || `https://www.classin.com/kr/blog/${p.slug}/`;
    const { html: rewrittenHtml, firstLocalUrl } = await processImages(
      p.content?.rendered ?? "",
      slug,
      referer
    );

    const markdown = htmlToMarkdown(rewrittenHtml);
    const excerpt = cleanExcerpt(p.excerpt?.rendered ?? p.content?.rendered ?? "");
    const readTime = estimateReadTime(markdown);

    const record = {
      title,
      slug,
      excerpt,
      content_markdown: markdown,
      content_html: null,
      category: mappedCategory,
      tags,
      author_name: author,
      author_role: "",
      author_bio: "",
      author_avatar_url: null,
      author_user_id: null,
      read_time: readTime,
      image_url: firstLocalUrl,
      hero_image_url: firstLocalUrl,
      featured: false,
      status: "PUBLISHED",
      seo_title: title,
      seo_description: excerpt,
      benefit_items: [],
      target_reader: null,
      cta_text: null,
      cta_url: null,
      cta_style: "primary",
      related_post_ids: [],
      page_layout: "standard",
      published_at: publishedAt,
      // created_at 도 원본 발행일로 동기화 (BlogPost.date 표시 기준)
      created_at: publishedAt,
      published_by: null,
      deleted_at: null,
    };

    if (existsId) {
      updates.push({ id: existsId, record });
    } else {
      inserts.push(record);
    }

    if (DRY_RUN) {
      console.log(`   [dry] markdown ${markdown.length}자, 발췌 "${excerpt.slice(0, 80)}…"`);
      console.log(`   [dry] thumbnail: ${firstLocalUrl ?? "(없음)"}`);
    }
  }

  console.log(`\n[summary] insert ${inserts.length}, update ${updates.length}, skip ${skipped}`);

  if (DRY_RUN) {
    console.log("[dry] DB 변경 없음. 확인 후 --dry 빼고 다시 실행하세요.");
    return;
  }

  if (inserts.length > 0) {
    const { data, error } = await supabase
      .from("blog_posts")
      .insert(inserts)
      .select("id, slug, published_at");
    if (error) {
      console.error("[err] insert 실패:", error.message);
      process.exit(1);
    }
    console.log(`\n[insert] ${data.length}개 삽입 완료`);
    data.forEach((r) => console.log(`  + ${r.slug} (${r.published_at?.slice(0, 10)})`));
  }

  for (const u of updates) {
    const { id, record } = u;
    // UPDATE 시 created_at 등 보존, slug/published_at 등 메타는 덮어씀
    const { error } = await supabase.from("blog_posts").update(record).eq("id", id);
    if (error) {
      console.error(`[err] update 실패 ${record.slug}:`, error.message);
      continue;
    }
    console.log(`  ~ ${record.slug} (${record.published_at?.slice(0, 10)})`);
  }
  if (updates.length > 0) console.log(`\n[update] ${updates.length}개 갱신 완료`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
