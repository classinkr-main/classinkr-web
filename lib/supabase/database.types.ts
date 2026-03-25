/**
 * Supabase Database Types
 *
 * 수동 정의 — Supabase 연결 후 아래 명령으로 자동 생성 가능:
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
 *
 * 현재는 Phase 1 테이블 4개 기준으로 수동 정의
 */

/* ─── Enum Types ─── */

export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "VIEWER";
export type AdminStatus = "INVITED" | "ACTIVE" | "SUSPENDED";

export type BlogPostStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "ARCHIVED";

export type LeadStatus = "new" | "contacted" | "converted" | "closed";
export type LeadSource =
  | "demo_modal"
  | "contact_page"
  | "newsletter"
  | "manual";

/* ─── Table Row Types ─── */

export interface AdminProfile {
  user_id: string;
  display_name: string;
  role: AdminRole;
  status: AdminStatus;
  invited_by: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content_markdown: string | null;
  content_html: string | null;
  category: string | null;
  tags: string[];
  author_name: string | null;
  author_role: string | null;
  author_bio: string | null;
  author_avatar_url: string | null;
  author_user_id: string | null;
  read_time: string | null;
  image_url: string | null;
  hero_image_url: string | null;
  featured: boolean;
  status: BlogPostStatus;
  seo_title: string | null;
  seo_description: string | null;
  benefit_items: string[];
  target_reader: string | null;
  cta_text: string | null;
  cta_url: string | null;
  cta_style: string;
  related_post_ids: string[];
  published_at: string | null;
  published_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  source: string;
  name: string | null;
  org: string | null;
  role: string | null;
  size: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  branch: string | null;
  status: LeadStatus;
  notes: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
  updated_at: string;
}

export type NewsletterStatus = "active" | "unsubscribed";

export interface NewsletterSubscriber {
  id: string;
  email: string;
  name: string | null;
  tags: string[];
  source: string;
  status: NewsletterStatus;
  opt_in_at: string;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

/* ─── Insert Types (id, created_at 등 자동 생성 필드 제외) ─── */

export type AdminProfileInsert = Omit<
  AdminProfile,
  "created_at" | "updated_at"
> & {
  created_at?: string;
  updated_at?: string;
};

export type BlogPostInsert = Omit<
  BlogPost,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type LeadInsert = Omit<Lead, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type AuditLogInsert = Omit<AuditLog, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

/* ─── Update Types (모든 필드 optional) ─── */

export type AdminProfileUpdate = Partial<
  Omit<AdminProfile, "user_id" | "created_at">
>;
export type BlogPostUpdate = Partial<
  Omit<BlogPost, "id" | "created_at">
>;
export type LeadUpdate = Partial<Omit<Lead, "id" | "created_at">>;

export type NewsletterSubscriberInsert = Omit<
  NewsletterSubscriber,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type NewsletterSubscriberUpdate = Partial<
  Omit<NewsletterSubscriber, "id" | "created_at">
>;

/* ─── Database Schema (Supabase 클라이언트 제네릭용) ─── */

export interface Database {
  public: {
    Tables: {
      admin_profiles: {
        Row: AdminProfile;
        Insert: AdminProfileInsert;
        Update: AdminProfileUpdate;
      };
      blog_posts: {
        Row: BlogPost;
        Insert: BlogPostInsert;
        Update: BlogPostUpdate;
      };
      leads: {
        Row: Lead;
        Insert: LeadInsert;
        Update: LeadUpdate;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: AuditLogInsert;
        Update: never;
      };
      newsletter_subscribers: {
        Row: NewsletterSubscriber;
        Insert: NewsletterSubscriberInsert;
        Update: NewsletterSubscriberUpdate;
      };
    };
  };
}
