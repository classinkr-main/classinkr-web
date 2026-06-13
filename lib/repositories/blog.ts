/**
 * Blog Repository — Supabase 전용
 *
 * 2026-06 듀얼 모드(JSON 폴백) 제거: data/blog-posts.json 은 읽기 전용 백업,
 * lib/blog-data.ts 는 레거시 참조용으로만 남아 있다.
 * 기존 lib/blog-data.ts 의 함수 시그니처를 유지
 */

import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BlogPost as SupaBlogPost, BlogPostInsert, BlogPostUpdate } from "@/lib/supabase/database.types";
import { sanitizePublicUrl } from "@/lib/safe-public-url";

// 기존 타입 re-export
export type { BlogPost, BlogPostInput, BlogPostStatus } from "@/lib/blog-types";
export { CATEGORIES, BLOG_STATUS_OPTIONS, DEFAULT_BLOG_CTA } from "@/lib/blog-types";

import { DEFAULT_BLOG_CTA, type BlogPost, type BlogPostInput } from "@/lib/blog-types";

const BLOG_SLUG_CONFLICT_MESSAGE = "이미 사용 중인 블로그 URL 슬러그입니다.";

/* ─── Supabase Row ↔ 기존 BlogPost 변환 ─── */

function supabaseToLegacy(row: SupaBlogPost): BlogPost & { _uuid: string } {
  return {
    id: hashUuidToNumber(row.id),
    _uuid: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    category: row.category ?? "전체",
    tags: row.tags ?? [],
    tag: (row.tags ?? [])[0] ?? "",
    date: formatDate(row.created_at),
    publishedAt: row.published_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    author: row.author_name ?? "",
    authorRole: row.author_role ?? "",
    authorBio: row.author_bio ?? "",
    authorAvatarUrl: row.author_avatar_url ?? "",
    readTime: row.read_time ?? "",
    imageUrl: row.image_url ?? "",
    thumbnailAlt: row.title ?? "",
    heroImageUrl: row.hero_image_url ?? "",
    heroImageAlt: row.title ?? "",
    featured: row.featured,
    benefitItems: row.benefit_items ?? [],
    targetReader: row.target_reader ?? "",
    contentMarkdown: row.content_markdown ?? "",
    seoTitle: row.seo_title ?? "",
    seoDescription: row.seo_description ?? "",
    relatedPostIds: [],
    pageLayout: (row.page_layout ?? "standard") as "standard" | "minimal",
    status: row.status.toLowerCase() as BlogPost["status"],
    deletedAt: row.deleted_at ?? undefined,
    cta: {
      eyebrow: "도입 문의",
      title: row.cta_text ?? "우리 학원에 맞는 플랜이 궁금하다면?",
      description: "수업 만족도를 높이는 가장 빠른 방법, 지금 컨설팅을 받아보세요.",
      buttonLabel: row.cta_text ?? "무료 상담 신청하기",
      buttonHref: row.cta_url ?? DEFAULT_BLOG_CTA.buttonHref,
    },
  };
}

function legacyToSupabaseInsert(data: Partial<BlogPostInput>): BlogPostInsert {
  return {
    title: data.title ?? "제목 없음",
    slug: resolveBlogSlug(data.slug, data.title),
    excerpt: data.excerpt ?? null,
    content_markdown: data.contentMarkdown ?? null,
    content_html: null,
    category: data.category ?? null,
    tags: data.tags ?? [],
    author_name: data.author ?? null,
    author_role: data.authorRole ?? null,
    author_bio: data.authorBio ?? null,
    author_avatar_url: data.authorAvatarUrl ?? null,
    author_user_id: null,
    read_time: data.readTime ?? null,
    image_url: data.imageUrl ?? null,
    hero_image_url: data.heroImageUrl ?? null,
    featured: data.featured ?? false,
    status: (data.status?.toUpperCase() ?? "DRAFT") as SupaBlogPost["status"],
    seo_title: data.seoTitle ?? null,
    seo_description: data.seoDescription ?? null,
    benefit_items: data.benefitItems ?? [],
    target_reader: data.targetReader ?? null,
    cta_text: data.cta?.buttonLabel ?? null,
    cta_url: normalizeCtaHref(data.cta?.buttonHref),
    cta_style: "primary",
    related_post_ids: [],
    page_layout: data.pageLayout ?? "standard",
    published_at: data.status === "published" ? new Date().toISOString() : null,
    published_by: null,
    deleted_at: null,
  };
}

/* ─── READ ─── */

// 목록 조회 시 필요한 컬럼만 (content_markdown 등 무거운 필드 제외)
const LIST_COLUMNS = [
  "id", "slug", "title", "excerpt", "category", "tags",
  "author_name", "author_role", "author_bio", "author_avatar_url",
  "read_time", "image_url", "hero_image_url", "featured", "status",
  "seo_title", "seo_description", "benefit_items", "target_reader",
  "cta_text", "cta_url", "page_layout", "published_at", "updated_at", "created_at",
  "deleted_at",
].join(",")

export async function getAllPosts(): Promise<BlogPost[]> {

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(LIST_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`[blog] 조회 실패: ${error.message}`);
  return (data as unknown as SupaBlogPost[]).map(supabaseToLegacy);
}

export async function getPublishedPosts(): Promise<BlogPost[]> {

  const supabase = await createSupabaseBlogReadClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(LIST_COLUMNS)
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .order("published_at", { ascending: false });

  if (error) throw new Error(`[blog] 공개 글 조회 실패: ${error.message}`);
  return (data as unknown as SupaBlogPost[]).map(supabaseToLegacy);
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return supabaseToLegacy(data as SupaBlogPost);
}

export async function getPublishedPostBySlug(slug: string): Promise<BlogPost | null> {

  const supabase = await createSupabaseBlogReadClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .single();

  if (error || !data) return null;
  return supabaseToLegacy(data as SupaBlogPost);
}

export async function getPostById(id: number): Promise<BlogPost | null> {

  // Supabase에서는 UUID로 검색해야 하므로 uuid 목록만 받아 hash 매칭
  // (legacy number id = hashUuidToNumber(uuid) 호환 유지)
  const supabase = await createSupabaseServerClient();
  const { data: idRows, error: idError } = await supabase
    .from("blog_posts")
    .select("id")
    .is("deleted_at", null);
  if (idError || !idRows) return null;

  const uuid = (idRows as { id: string }[]).find(
    (row) => hashUuidToNumber(row.id) === id
  )?.id;
  if (!uuid) return null;

  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("id", uuid)
    .single();

  if (error || !data) return null;
  return supabaseToLegacy(data as SupaBlogPost);
}

/* ─── CREATE ─── */

export async function createPost(data: Partial<BlogPostInput>): Promise<BlogPost> {

  const supabase = await createSupabaseServerClient();
  const insert = legacyToSupabaseInsert(data);
  await assertBlogSlugAvailable(supabase, insert.slug);

  const { data: row, error } = await supabase
    .from("blog_posts")
    .insert(insert)
    .select()
    .single();

  if (error && isUniqueViolation(error)) throw new Error(BLOG_SLUG_CONFLICT_MESSAGE);

  if (error) throw new Error(`[blog] 생성 실패: ${error.message}`);
  return supabaseToLegacy(row as SupaBlogPost);
}

/* ─── UPDATE ─── */

export async function updatePost(
  id: number,
  data: Partial<BlogPostInput>,
  uuid?: string
): Promise<BlogPost | null> {

  // Supabase에서는 UUID 사용
  const targetUuid = uuid ?? (await findUuidByLegacyId(id));
  if (!targetUuid) return null;

  const supabase = await createSupabaseServerClient();

  const update: BlogPostUpdate = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.slug !== undefined) update.slug = resolveBlogSlug(data.slug, data.title);
  if (data.excerpt !== undefined) update.excerpt = data.excerpt;
  if (data.contentMarkdown !== undefined) update.content_markdown = data.contentMarkdown;
  if (data.category !== undefined) update.category = data.category;
  if (data.tags !== undefined) update.tags = data.tags;
  if (data.author !== undefined) update.author_name = data.author;
  if (data.authorRole !== undefined) update.author_role = data.authorRole;
  if (data.authorBio !== undefined) update.author_bio = data.authorBio;
  if (data.authorAvatarUrl !== undefined) update.author_avatar_url = data.authorAvatarUrl;
  if (data.featured !== undefined) update.featured = data.featured;
  if (data.imageUrl !== undefined) update.image_url = data.imageUrl;
  if (data.heroImageUrl !== undefined) update.hero_image_url = data.heroImageUrl;
  if (data.readTime !== undefined) update.read_time = data.readTime;
  if (data.seoTitle !== undefined) update.seo_title = data.seoTitle;
  if (data.seoDescription !== undefined) update.seo_description = data.seoDescription;
  if (data.benefitItems !== undefined) update.benefit_items = data.benefitItems;
  if (data.targetReader !== undefined) update.target_reader = data.targetReader;
  if (data.cta !== undefined) {
    update.cta_text = data.cta.buttonLabel ?? null;
    update.cta_url = normalizeCtaHref(data.cta.buttonHref);
  }
  if (data.pageLayout !== undefined) update.page_layout = data.pageLayout;
  if (data.status !== undefined) {
    update.status = data.status.toUpperCase() as SupaBlogPost["status"];
    if (data.status === "published" && !update.published_at) {
      update.published_at = new Date().toISOString();
    }
  }

  if (update.slug) {
    await assertBlogSlugAvailable(supabase, update.slug, targetUuid);
  }

  const { data: row, error } = await supabase
    .from("blog_posts")
    .update(update)
    .eq("id", targetUuid)
    .select()
    .single();

  if (error && isUniqueViolation(error)) throw new Error(BLOG_SLUG_CONFLICT_MESSAGE);
  if (error || !row) return null;
  return supabaseToLegacy(row as SupaBlogPost);
}

/* ─── DELETE (소프트 삭제) ─── */

export async function trashPost(id: number, uuid?: string): Promise<boolean> {

  const targetUuid = uuid ?? (await findUuidByLegacyId(id));
  if (!targetUuid) return false;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("blog_posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", targetUuid);

  return !error;
}

export async function restorePost(id: number, uuid?: string): Promise<BlogPost | null> {

  const targetUuid = uuid ?? (await findUuidByLegacyId(id));
  if (!targetUuid) return null;

  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("blog_posts")
    .update({ deleted_at: null })
    .eq("id", targetUuid)
    .select()
    .single();

  if (error || !row) return null;
  return supabaseToLegacy(row as SupaBlogPost);
}

export async function getTrashedPosts(): Promise<BlogPost[]> {

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(LIST_COLUMNS)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) throw new Error(`[blog] 휴지통 조회 실패: ${error.message}`);
  return (data as unknown as SupaBlogPost[]).map(supabaseToLegacy);
}

export async function permanentDeletePost(id: number, uuid?: string): Promise<boolean> {

  const targetUuid = uuid ?? (await findUuidByLegacyId(id));
  if (!targetUuid) return false;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("blog_posts")
    .delete()
    .eq("id", targetUuid);

  return !error;
}

/**
 * generateStaticParams 전용: cookies() 없이 admin client로 published slug 목록 반환
 * 일반 서버 컴포넌트는 getPublishedPosts() 사용
 */
export async function getPublishedSlugsForStaticParams(): Promise<{ slug: string }[]> {
  try {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("blog_posts")
      .select("slug")
      .eq("status", "PUBLISHED")
      .is("deleted_at", null);
    return (data ?? []).map((row) => ({ slug: row.slug as string }));
  } catch {
    return [];
  }
}

export async function getPublishedPostsForStaticSitemap(): Promise<BlogPost[]> {

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(LIST_COLUMNS)
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .order("published_at", { ascending: false });

  if (error) throw new Error(`[blog] sitemap query failed: ${error.message}`);
  return (data as unknown as SupaBlogPost[]).map(supabaseToLegacy);
}

export async function getRelatedPosts(post: BlogPost, limit = 3): Promise<BlogPost[]> {

  const posts = await getPublishedPosts();
  const selectedByIds = posts.filter(
    (candidate) => candidate.id !== post.id && post.relatedPostIds.includes(candidate.id)
  );

  const fallback = posts.filter(
    (candidate) => candidate.id !== post.id && candidate.category === post.category
  );

  return [...selectedByIds, ...fallback]
    .filter((candidate, index, array) => array.findIndex((item) => item.id === candidate.id) === index)
    .slice(0, limit);
}

/* ─── Helpers ─── */


function hashUuidToNumber(uuid: string): number {
  // UUID → 안정적인 number ID (기존 UI 호환용)
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function formatDate(isoString: string): string {
  return new Date(isoString)
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\./g, ". ")
    .trim();
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function resolveBlogSlug(slug: string | null | undefined, title: string | null | undefined): string {
  const source = slug?.trim() || title?.trim() || "untitled";
  return slugifyTitle(source) || "untitled";
}

function normalizeCtaHref(value: string | null | undefined): string | null {
  const safe = sanitizePublicUrl(value, "");
  return safe || null;
}

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

async function assertBlogSlugAvailable(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  slug: string,
  exceptId?: string
): Promise<void> {
  let query = supabase.from("blog_posts").select("id").eq("slug", slug).limit(1);
  if (exceptId) query = query.neq("id", exceptId);

  const { data, error } = await query;
  if (error) throw error;
  if (data && data.length > 0) throw new Error(BLOG_SLUG_CONFLICT_MESSAGE);
}

async function findUuidByLegacyId(legacyId: number): Promise<string | null> {
  // legacy number id = hashUuidToNumber(uuid) — id 컬럼만 받아 해시 매칭 (전체 글 로드 불필요)
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id")
    .is("deleted_at", null);
  if (error || !data) return null;

  return (
    (data as { id: string }[]).find((row) => hashUuidToNumber(row.id) === legacyId)?.id ??
    null
  );
}

async function createSupabaseBlogReadClient() {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  return createSupabaseAdminClient();
}
