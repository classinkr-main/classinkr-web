/**
 * Blog Repository — Supabase 전용
 *
 * 2026-06 듀얼 모드(JSON 폴백) 제거: data/blog-posts.json 은 읽기 전용 백업,
 * lib/blog-data.ts 는 레거시 참조용으로만 남아 있다.
 * 기존 lib/blog-data.ts 의 함수 시그니처를 유지
 */

import "server-only";

import { cache } from "react";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BlogPost as SupaBlogPost, BlogPostInsert, BlogPostUpdate } from "@/lib/supabase/database.types";
import { sanitizePublicUrl } from "@/lib/safe-public-url";
import { formatBlogDisplayDate, resolveDisplayDateSource } from "@/lib/blog-display";
import type { OverviewBlogRecentPost, OverviewBlogSummary } from "@/lib/admin/overview/insights";

// 기존 타입 re-export
export type { BlogPost, BlogPostInput, BlogPostStatus } from "@/lib/blog-types";
export { CATEGORIES, BLOG_STATUS_OPTIONS, DEFAULT_BLOG_CTA } from "@/lib/blog-types";

import { DEFAULT_BLOG_CTA, type BlogPost, type BlogPostInput } from "@/lib/blog-types";

const BLOG_SLUG_CONFLICT_MESSAGE = "이미 사용 중인 블로그 URL 슬러그입니다.";
const PUBLISHED_STATUS_VALUES = ["PUBLISHED", "published"] as unknown as SupaBlogPost["status"][];
const PUBLIC_BLOG_QUERY_TIMEOUT_MS = 6_000;
type BlogSupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

export function isBlogSlugConflictError(error: unknown) {
  return error instanceof Error && error.message === BLOG_SLUG_CONFLICT_MESSAGE;
}

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
    date: formatDate(resolveDisplayDateSource(row)),
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
    relatedPostIds: (row.related_post_ids ?? []).map(hashUuidToNumber),
    leadMagnetSlug: row.lead_magnet_slug ?? undefined,
    pageLayout: (row.page_layout ?? "standard") as "standard" | "minimal",
    status: dbStatusToLegacy(row.status),
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
    status: legacyStatusToDb(data.status),
    seo_title: data.seoTitle ?? null,
    seo_description: data.seoDescription ?? null,
    benefit_items: data.benefitItems ?? [],
    target_reader: data.targetReader ?? null,
    cta_text: data.cta?.buttonLabel ?? null,
    cta_url: normalizeCtaHref(data.cta?.buttonHref),
    cta_style: "primary",
    related_post_ids: [],
    lead_magnet_slug: data.leadMagnetSlug?.trim() || null,
    page_layout: data.pageLayout ?? "standard",
    published_at:
      normalizePublishedAt(data.publishedAt) ??
      (data.status === "published" ? new Date().toISOString() : null),
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
  "cta_text", "cta_url", "page_layout", "lead_magnet_slug", "published_at", "updated_at", "created_at",
  "deleted_at",
].join(",")

export async function getAllPosts(): Promise<BlogPost[]> {

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(LIST_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`[blog] 조회 실패: ${error.message}`);
  return (data as unknown as SupaBlogPost[]).map(supabaseToLegacy);
}

// 카운트 소비자용(os-summary 등) — 전체 행 로드(getAllPosts) 없이 발행 글 수만 센다.
// 술어는 "getAllPosts() 후 status === 'published' 필터"와 동치다:
// deleted_at null + status ∈ PUBLISHED_STATUS_VALUES(레거시 매핑이 "published"로 접는 값 전부).
// getPublishedPosts의 publishedAtVisibleFilter(예약 발행 가시성)는 여기 적용하지 않는다 —
// 기존 os-summary 카운트도 status만 봤으므로 수치 동일성을 유지한다.
export async function countPublishedPosts(): Promise<number> {

  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("blog_posts")
    .select("id", { count: "exact", head: true })
    .in("status", PUBLISHED_STATUS_VALUES)
    .is("deleted_at", null);

  if (error) throw new Error(`[blog] 발행 글 수 조회 실패: ${error.message}`);
  return count ?? 0;
}

// /admin/overview 전용 요약 — 전 포스트(LIST_COLUMNS 24컬럼)를 내려받는 대신 head 카운트 4개 +
// 최근 수정 4건(7컬럼)만 받는다. 각 수치는 "getAllPosts() 후 JS 파생(deriveBlogInsights)"과 동치:
//   totalCount               = getAllPosts().length             (deleted_at null, status 무관 —
//                              overview "발행된 포스트" StatCard가 실제로 보여주던 값 그대로)
//   publishedCount           = status === "published" 수         (countPublishedPosts와 같은 술어)
//   draftCount               = status === "draft" 수              (dbStatusToLegacy가 draft로 접는 나머지 전부)
//   publishedWithoutCtaCount = 공개 글 중 cta.title/buttonLabel/buttonHref 중 하나라도 공백인 수.
//                              supabaseToLegacy는 cta_text→title·buttonLabel, cta_url→buttonHref로 매핑하고
//                              null이면 기본 문구/링크로 채우므로, "미완성"은 컬럼이 null이 아닌 공백 문자열일 때뿐이다.
//   recent                   = updated_at 내림차순 4건(nulls last, 동률은 created_at 내림차순)
const OVERVIEW_RECENT_COLUMNS = "id,title,status,category,author_name,updated_at,published_at,created_at";
const OVERVIEW_RECENT_LIMIT = 4;
const NON_DRAFT_STATUS_VALUES = "(IN_REVIEW,PUBLISHED,ARCHIVED,in_review,published,archived)";
const BLANK_CTA_FILTER = "cta_text.match.^\\s*$,cta_url.match.^\\s*$";

export async function getOverviewBlogSummary(): Promise<OverviewBlogSummary> {
  const supabase = createSupabaseAdminClient();
  const countQuery = () => supabase.from("blog_posts").select("id", { count: "exact", head: true });

  const [total, published, draft, publishedWithoutCta, recent] = await Promise.all([
    countQuery().is("deleted_at", null),
    countQuery().is("deleted_at", null).in("status", PUBLISHED_STATUS_VALUES),
    countQuery().is("deleted_at", null).not("status", "in", NON_DRAFT_STATUS_VALUES),
    countQuery().is("deleted_at", null).in("status", PUBLISHED_STATUS_VALUES).or(BLANK_CTA_FILTER),
    supabase
      .from("blog_posts")
      .select(OVERVIEW_RECENT_COLUMNS)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(OVERVIEW_RECENT_LIMIT),
  ]);

  const failed = [total, published, draft, publishedWithoutCta, recent].find((result) => result.error);
  if (failed?.error) throw new Error(`[blog] overview 요약 조회 실패: ${failed.error.message}`);

  return {
    totalCount: total.count ?? 0,
    publishedCount: published.count ?? 0,
    draftCount: draft.count ?? 0,
    publishedWithoutCtaCount: publishedWithoutCta.count ?? 0,
    recent: ((recent.data ?? []) as unknown as OverviewRecentRow[]).map(rowToOverviewRecentPost),
  };
}

type OverviewRecentRow = Pick<
  SupaBlogPost,
  "id" | "title" | "status" | "category" | "author_name" | "updated_at" | "published_at"
>;

// supabaseToLegacy와 같은 매핑 규칙(id 해시·status 변환·category/author 기본값)만 최소 컬럼에 적용한다.
function rowToOverviewRecentPost(row: OverviewRecentRow): OverviewBlogRecentPost {
  return {
    id: hashUuidToNumber(row.id),
    title: row.title,
    status: dbStatusToLegacy(row.status),
    category: row.category ?? "전체",
    author: row.author_name ?? "",
    updatedAt: row.updated_at ?? undefined,
    publishedAt: row.published_at ?? undefined,
  };
}

export async function getPublishedPosts(): Promise<BlogPost[]> {

  const supabase = await createSupabaseBlogReadClient();
  const timeout = createBlogQueryTimeout();
  try {
    const { data, error } = await supabase
      .from("blog_posts")
      .select(LIST_COLUMNS)
      .in("status", PUBLISHED_STATUS_VALUES)
      .is("deleted_at", null)
      .or(publishedAtVisibleFilter())
      // Postgres는 DESC에서 NULL을 맨 앞에 둔다 — published_at 없이 발행된 글이
      // 목록 최상단에 눌러앉는 걸 막는다. 동일 시각 글은 created_at으로 순서를 고정한다.
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .abortSignal(timeout.signal);

    if (error && isAbortError(error)) {
      console.warn(`[blog] 공개 글 조회 timeout after ${PUBLIC_BLOG_QUERY_TIMEOUT_MS}ms`);
      return [];
    }
    if (error) throw new Error(`[blog] 공개 글 조회 실패: ${error.message}`);
    return (data as unknown as SupaBlogPost[]).map(supabaseToLegacy);
  } finally {
    timeout.clear();
  }
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return supabaseToLegacy(data as SupaBlogPost);
}

// 조회 실패(timeout·5xx)와 "글이 없음"을 구분해서 던진다. 둘 다 null로 접으면
// 순간 장애가 notFound()로 렌더되고, revalidate 주기 동안 정상 글이 404로 캐시된다(soft-404 증폭).
// null은 진짜 미존재일 때만 반환하고, 실패는 throw해서 error 경계가 받게 한다.
// cache()로 감싸 같은 요청 안의 generateMetadata + page 중복 쿼리를 1회로 줄인다.
export const getPublishedPostBySlug = cache(async function getPublishedPostBySlug(
  slug: string,
): Promise<BlogPost | null> {
  const supabase = await createSupabaseBlogReadClient();
  const timeout = createBlogQueryTimeout();
  try {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .in("status", PUBLISHED_STATUS_VALUES)
      .is("deleted_at", null)
      .or(publishedAtVisibleFilter())
      .abortSignal(timeout.signal)
      .maybeSingle();

    if (error && isAbortError(error)) {
      throw new Error(
        `[blog] 공개 글 상세 조회 timeout after ${PUBLIC_BLOG_QUERY_TIMEOUT_MS}ms (${slug})`,
      );
    }
    if (error) throw new Error(`[blog] 공개 글 상세 조회 실패(${slug}): ${error.message}`);
    if (!data) return null;
    return supabaseToLegacy(data as SupaBlogPost);
  } finally {
    timeout.clear();
  }
});

export async function getPostById(id: number | string): Promise<BlogPost | null> {

  // Supabase에서는 UUID로 검색해야 하므로 uuid 목록만 받아 hash 매칭
  // (legacy number id = hashUuidToNumber(uuid) 호환 유지)
  const supabase = createSupabaseAdminClient();
  const uuid =
    typeof id === "string" && isUuidLike(id)
      ? id
      : await findUuidByLegacyId(Number(id), supabase);
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

  const supabase = createSupabaseAdminClient();
  const insert = legacyToSupabaseInsert(data);
  insert.related_post_ids = await resolveRelatedUuids(data.relatedPostIds, supabase);
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
  const supabase = createSupabaseAdminClient();
  const targetUuid = uuid ?? (await findUuidByLegacyId(id, supabase));
  if (!targetUuid) return null;

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
  if (data.leadMagnetSlug !== undefined) update.lead_magnet_slug = data.leadMagnetSlug?.trim() || null;
  if (data.relatedPostIds !== undefined) {
    update.related_post_ids = await resolveRelatedUuids(data.relatedPostIds, supabase);
  }
  if (data.publishedAt !== undefined) {
    update.published_at = normalizePublishedAt(data.publishedAt);
  }
  if (data.status !== undefined) {
    update.status = legacyStatusToDb(data.status);
    if (data.status === "published" && update.published_at === undefined) {
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

  const supabase = createSupabaseAdminClient();
  const targetUuid = uuid ?? (await findUuidByLegacyId(id, supabase));
  if (!targetUuid) return false;

  const { error } = await supabase
    .from("blog_posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", targetUuid);

  return !error;
}

export async function restorePost(id: number, uuid?: string): Promise<BlogPost | null> {

  const supabase = createSupabaseAdminClient();
  const targetUuid = uuid ?? (await findUuidByLegacyId(id, supabase));
  if (!targetUuid) return null;

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

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(LIST_COLUMNS)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) throw new Error(`[blog] 휴지통 조회 실패: ${error.message}`);
  return (data as unknown as SupaBlogPost[]).map(supabaseToLegacy);
}

export async function permanentDeletePost(id: number, uuid?: string): Promise<boolean> {

  const supabase = createSupabaseAdminClient();
  const targetUuid = uuid ?? (await findUuidByLegacyId(id, supabase));
  if (!targetUuid) return false;

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
    const supabase = createSupabaseAdminClient();
    const timeout = createBlogQueryTimeout();
    try {
      const { data } = await supabase
        .from("blog_posts")
        .select("slug")
        .in("status", PUBLISHED_STATUS_VALUES)
        .is("deleted_at", null)
        .or(publishedAtVisibleFilter())
        .abortSignal(timeout.signal);
      return (data ?? []).map((row) => ({ slug: row.slug as string }));
    } finally {
      timeout.clear();
    }
  } catch {
    return [];
  }
}

export async function getPublishedPostsForStaticSitemap(): Promise<BlogPost[]> {

  const supabase = createSupabaseAdminClient();
  const timeout = createBlogQueryTimeout();
  try {
    const { data, error } = await supabase
      .from("blog_posts")
      .select(LIST_COLUMNS)
      .in("status", PUBLISHED_STATUS_VALUES)
      .is("deleted_at", null)
      .or(publishedAtVisibleFilter())
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .abortSignal(timeout.signal);

    if (error) throw new Error(`[blog] sitemap query failed: ${error.message}`);
    return (data as unknown as SupaBlogPost[]).map(supabaseToLegacy);
  } finally {
    timeout.clear();
  }
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


// 레거시 status("review") ↔ DB enum("IN_REVIEW") 변환. 나머지는 대소문자만 다름.
function dbStatusToLegacy(status: SupaBlogPost["status"] | string | null | undefined): BlogPost["status"] {
  const normalized = String(status ?? "DRAFT").toUpperCase();
  if (normalized === "IN_REVIEW") return "review";
  if (normalized === "PUBLISHED") return "published";
  if (normalized === "ARCHIVED") return "archived";
  return "draft";
}

function legacyStatusToDb(status: BlogPost["status"] | undefined): SupaBlogPost["status"] {
  if (status === "review") return "IN_REVIEW";
  return (status?.toUpperCase() ?? "DRAFT") as SupaBlogPost["status"];
}

function normalizePublishedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// 어드민이 레거시 number id로 고른 관련 글을 DB 저장용 uuid 배열로 변환.
async function resolveRelatedUuids(
  legacyIds: number[] | undefined,
  supabase: BlogSupabaseClient
): Promise<string[]> {
  if (!legacyIds || legacyIds.length === 0) return [];
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id")
    .is("deleted_at", null);
  if (error || !data) return [];

  const byLegacyId = new Map(
    (data as { id: string }[]).map((row) => [hashUuidToNumber(row.id), row.id])
  );
  return legacyIds
    .map((id) => byLegacyId.get(id))
    .filter((uuid): uuid is string => Boolean(uuid));
}

// 예약 발행: published_at 이 미래인 글은 숨긴다. (published_at 이 null 인 기존 글은 그대로 노출)
function publishedAtVisibleFilter() {
  return `published_at.is.null,published_at.lte.${new Date().toISOString()}`;
}

function createBlogQueryTimeout() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLIC_BLOG_QUERY_TIMEOUT_MS);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

function isAbortError(error: { code?: string; message?: string } | null | undefined) {
  return /AbortError|aborted|timeout/i.test(error?.message ?? "") || error?.code === "ABORT_ERR";
}

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

const formatDate = formatBlogDisplayDate;

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
  supabase: BlogSupabaseClient,
  slug: string,
  exceptId?: string
): Promise<void> {
  let query = supabase.from("blog_posts").select("id").eq("slug", slug).limit(1);
  if (exceptId) query = query.neq("id", exceptId);

  const { data, error } = await query;
  if (error) throw error;
  if (data && data.length > 0) throw new Error(BLOG_SLUG_CONFLICT_MESSAGE);
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function findUuidByLegacyId(
  legacyId: number,
  supabase: BlogSupabaseClient = createSupabaseAdminClient()
): Promise<string | null> {
  if (!Number.isFinite(legacyId)) return null;
  // legacy number id = hashUuidToNumber(uuid) — id 컬럼만 받아 해시 매칭 (전체 글 로드 불필요)
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
  return createSupabaseAdminClient();
}
