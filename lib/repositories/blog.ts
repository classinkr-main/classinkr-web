/**
 * Blog Repository — JSON ↔ Supabase 듀얼 모드
 *
 * 환경변수 USE_SUPABASE_BLOG=true 로 Supabase 전환
 * 기존 lib/blog-data.ts 의 함수 시그니처를 유지
 */

import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BlogPost as SupaBlogPost, BlogPostInsert, BlogPostUpdate } from "@/lib/supabase/database.types";

// 기존 타입 re-export
export type { BlogPost, BlogPostInput, BlogPostStatus } from "@/lib/blog-types";
export { CATEGORIES, BLOG_STATUS_OPTIONS, DEFAULT_BLOG_CTA } from "@/lib/blog-types";

import type { BlogPost, BlogPostInput } from "@/lib/blog-types";

const USE_SUPABASE = process.env.USE_SUPABASE_BLOG === "true";

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
    status: row.status.toLowerCase() as BlogPost["status"],
    deletedAt: row.deleted_at ?? undefined,
    cta: {
      eyebrow: "도입 문의",
      title: row.cta_text ?? "우리 학원에 맞는 플랜이 궁금하다면?",
      description: "수업 만족도를 높이는 가장 빠른 방법, 지금 컨설팅을 받아보세요.",
      buttonLabel: row.cta_text ?? "무료 상담 신청하기",
      buttonHref: row.cta_url ?? "#demo",
    },
  };
}

function legacyToSupabaseInsert(data: Partial<BlogPostInput>): BlogPostInsert {
  return {
    title: data.title ?? "제목 없음",
    slug: data.slug ?? slugifyTitle(data.title ?? "untitled"),
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
    cta_url: data.cta?.buttonHref ?? null,
    cta_style: "primary",
    related_post_ids: [],
    published_at: data.status === "published" ? new Date().toISOString() : null,
    published_by: null,
    deleted_at: null,
  };
}

/* ─── READ ─── */

export async function getAllPosts(): Promise<BlogPost[]> {
  if (!USE_SUPABASE) {
    const mod = await import("@/lib/blog-data");
    return mod.getAllPosts();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`[blog] 조회 실패: ${error.message}`);
  return (data as SupaBlogPost[]).map(supabaseToLegacy);
}

export async function getPublishedPosts(): Promise<BlogPost[]> {
  if (!USE_SUPABASE) {
    const mod = await import("@/lib/blog-data");
    return mod.getPublishedPosts();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .order("published_at", { ascending: false });

  if (error) throw new Error(`[blog] 공개 글 조회 실패: ${error.message}`);
  return (data as SupaBlogPost[]).map(supabaseToLegacy);
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  if (!USE_SUPABASE) {
    const mod = await import("@/lib/blog-data");
    return (await mod.getPostBySlug(slug)) ?? null;
  }

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
  if (!USE_SUPABASE) {
    const mod = await import("@/lib/blog-data");
    return (await mod.getPublishedPostBySlug(slug)) ?? null;
  }

  const supabase = await createSupabaseServerClient();
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
  if (!USE_SUPABASE) {
    const mod = await import("@/lib/blog-data");
    return (await mod.getPostById(id)) ?? null;
  }

  // Supabase에서는 UUID로 검색해야 하므로 전체 검색 후 hash 매칭
  // 실제로는 _uuid를 사용해야 하지만 호환성을 위해 유지
  const posts = await getAllPosts();
  return posts.find((p) => p.id === id) ?? null;
}

/* ─── CREATE ─── */

export async function createPost(data: Partial<BlogPostInput>): Promise<BlogPost> {
  if (!USE_SUPABASE) {
    const mod = await import("@/lib/blog-data");
    return mod.createPost(data);
  }

  const supabase = await createSupabaseServerClient();
  const insert = legacyToSupabaseInsert(data);

  const { data: row, error } = await supabase
    .from("blog_posts")
    .insert(insert)
    .select()
    .single();

  if (error) throw new Error(`[blog] 생성 실패: ${error.message}`);
  return supabaseToLegacy(row as SupaBlogPost);
}

/* ─── UPDATE ─── */

export async function updatePost(
  id: number,
  data: Partial<BlogPostInput>,
  uuid?: string
): Promise<BlogPost | null> {
  if (!USE_SUPABASE) {
    const mod = await import("@/lib/blog-data");
    return mod.updatePost(id, data);
  }

  // Supabase에서는 UUID 사용
  const targetUuid = uuid ?? (await findUuidByLegacyId(id));
  if (!targetUuid) return null;

  const supabase = await createSupabaseServerClient();

  const update: BlogPostUpdate = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.slug !== undefined) update.slug = data.slug;
  if (data.excerpt !== undefined) update.excerpt = data.excerpt;
  if (data.contentMarkdown !== undefined) update.content_markdown = data.contentMarkdown;
  if (data.category !== undefined) update.category = data.category;
  if (data.tags !== undefined) update.tags = data.tags;
  if (data.author !== undefined) update.author_name = data.author;
  if (data.authorRole !== undefined) update.author_role = data.authorRole;
  if (data.featured !== undefined) update.featured = data.featured;
  if (data.imageUrl !== undefined) update.image_url = data.imageUrl;
  if (data.heroImageUrl !== undefined) update.hero_image_url = data.heroImageUrl;
  if (data.seoTitle !== undefined) update.seo_title = data.seoTitle;
  if (data.seoDescription !== undefined) update.seo_description = data.seoDescription;
  if (data.status !== undefined) {
    update.status = data.status.toUpperCase() as SupaBlogPost["status"];
    if (data.status === "published" && !update.published_at) {
      update.published_at = new Date().toISOString();
    }
  }

  const { data: row, error } = await supabase
    .from("blog_posts")
    .update(update)
    .eq("id", targetUuid)
    .select()
    .single();

  if (error || !row) return null;
  return supabaseToLegacy(row as SupaBlogPost);
}

/* ─── DELETE (소프트 삭제) ─── */

export async function trashPost(id: number, uuid?: string): Promise<boolean> {
  if (!USE_SUPABASE) {
    const mod = await import("@/lib/blog-data");
    return mod.trashPost(id);
  }

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
  if (!USE_SUPABASE) {
    const mod = await import("@/lib/blog-data");
    return mod.restorePost(id);
  }

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
  if (!USE_SUPABASE) {
    const mod = await import("@/lib/blog-data");
    return mod.getTrashedPosts();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) throw new Error(`[blog] 휴지통 조회 실패: ${error.message}`);
  return (data as SupaBlogPost[]).map(supabaseToLegacy);
}

export async function permanentDeletePost(id: number, uuid?: string): Promise<boolean> {
  if (!USE_SUPABASE) {
    const mod = await import("@/lib/blog-data");
    return mod.permanentDeletePost(id);
  }

  const targetUuid = uuid ?? (await findUuidByLegacyId(id));
  if (!targetUuid) return false;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("blog_posts")
    .delete()
    .eq("id", targetUuid);

  return !error;
}

export async function getRelatedPosts(post: BlogPost, limit = 3): Promise<BlogPost[]> {
  if (!USE_SUPABASE) {
    const mod = await import("@/lib/blog-data");
    return mod.getRelatedPosts(post, limit);
  }

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

async function findUuidByLegacyId(legacyId: number): Promise<string | null> {
  const posts = await getAllPosts();
  const found = posts.find((p) => p.id === legacyId);
  return (found as BlogPost & { _uuid?: string })?._uuid ?? null;
}
