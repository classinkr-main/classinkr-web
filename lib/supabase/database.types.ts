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
  page_layout: "standard" | "minimal";
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
  follow_up_at: string | null;
  assigned_to: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
  updated_at: string;
}

export type ContactLogType = "call" | "sms" | "kakao" | "email";
export type ContactLogResult = "answered" | "no_answer" | "callback" | "meeting_set";

export interface LeadContactLog {
  id: string;
  lead_id: string;
  type: ContactLogType;
  result: ContactLogResult | null;
  notes: string | null;
  contacted_at: string;
  contacted_by: string | null;
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

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

export type AutomationStatus = "draft" | "active" | "paused";
export type TriggerType = "on_submit" | "scheduled" | "delay";
export type AutomationLogStatus = "pending" | "sent" | "failed";

export interface AutomationRule {
  id: string;
  name: string;
  status: AutomationStatus;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  segment_config: Record<string, unknown>;
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  id: string;
  rule_id: string | null;
  triggered_at: string;
  recipient_count: number;
  status: AutomationLogStatus;
  error_message: string | null;
  recipient_emails: string[];
  created_at: string;
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

/* ─── Partner Portal Types ─── */

export type PartnerStatus = "active" | "inactive" | "pending";

export interface PartnerUser {
  id: string;
  user_id: string;        // Supabase auth.users.id
  partner_id: string;     // FK → partners.id
  display_name: string | null;
  role: "admin" | "member"; // 파트너사 내 역할
  status: "invited" | "active" | "suspended";
  invited_by: string | null; // admin user_id
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PartnerUserInsert = Omit<PartnerUser, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
export type PartnerUserUpdate = Partial<Omit<PartnerUser, "id" | "created_at">>;

export interface Partner {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  business_number: string | null;
  status: PartnerStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type QuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired"
  | "converted";

export interface Quote {
  id: string;
  quote_number: string;
  partner_id: string;
  title: string;
  status: QuoteStatus;
  valid_until: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  created_by: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  converted_to_contract_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  product_name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_rate: number;
  amount: number;
  sort_order: number;
}

export type ContractStatus =
  | "draft"
  | "sent"
  | "partner_signed"
  | "admin_signed"
  | "completed"
  | "cancelled";

export interface Contract {
  id: string;
  contract_number: string;
  quote_id: string | null;
  partner_id: string;
  title: string;
  status: ContractStatus;
  total_amount: number;
  content_html: string | null;
  notes: string | null;
  valid_from: string | null;
  valid_until: string | null;
  sign_token: string | null;
  partner_signed_at: string | null;
  partner_signature_url: string | null;
  partner_signed_ip: string | null;
  admin_signed_at: string | null;
  admin_signature_url: string | null;
  admin_signed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractVersion {
  id: string;
  contract_id: string;
  version_number: number;
  content_html: string;
  changed_by: string | null;
  change_reason: string | null;
  created_at: string;
}

export type PaymentMethod = "bank_transfer" | "card" | "cash";
export type CashReceiptType = "personal" | "business";

export interface Receipt {
  id: string;
  receipt_number: string;
  contract_id: string;
  partner_id: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  payment_method: PaymentMethod;
  cash_receipt_requested: boolean;
  cash_receipt_type: CashReceiptType | null;
  cash_receipt_number: string | null;
  pdf_url: string | null;
  emailed_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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

export type LeadContactLogInsert = Omit<LeadContactLog, "id"> & { id?: string };
export type LeadContactLogUpdate = Partial<Omit<LeadContactLog, "id">>;

export type PartnerInsert = Omit<Partner, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
export type PartnerUpdate = Partial<Omit<Partner, "id" | "created_at">>;

export type QuoteInsert = Omit<Quote, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
export type QuoteUpdate = Partial<Omit<Quote, "id" | "created_at">>;

export type QuoteItemInsert = Omit<QuoteItem, "id"> & { id?: string };
export type QuoteItemUpdate = Partial<Omit<QuoteItem, "id">>;

export type ContractInsert = Omit<Contract, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
export type ContractUpdate = Partial<Omit<Contract, "id" | "created_at">>;

export type ContractVersionInsert = Omit<ContractVersion, "id" | "created_at"> & { id?: string; created_at?: string };

export type ReceiptInsert = Omit<Receipt, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
export type ReceiptUpdate = Partial<Omit<Receipt, "id" | "created_at">>;

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
      email_templates: {
        Row: EmailTemplate;
        Insert: Omit<EmailTemplate, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<EmailTemplate, "id" | "created_at">>;
      };
      automation_rules: {
        Row: AutomationRule;
        Insert: Omit<AutomationRule, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<AutomationRule, "id" | "created_at">>;
      };
      automation_logs: {
        Row: AutomationLog;
        Insert: Omit<AutomationLog, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<AutomationLog, "id" | "created_at">>;
      };
      lead_contact_logs: {
        Row: LeadContactLog;
        Insert: LeadContactLogInsert;
        Update: LeadContactLogUpdate;
      };
      partners: {
        Row: Partner;
        Insert: PartnerInsert;
        Update: PartnerUpdate;
      };
      quotes: {
        Row: Quote;
        Insert: QuoteInsert;
        Update: QuoteUpdate;
      };
      quote_items: {
        Row: QuoteItem;
        Insert: QuoteItemInsert;
        Update: QuoteItemUpdate;
      };
      contracts: {
        Row: Contract;
        Insert: ContractInsert;
        Update: ContractUpdate;
      };
      contract_versions: {
        Row: ContractVersion;
        Insert: ContractVersionInsert;
        Update: never;
      };
      receipts: {
        Row: Receipt;
        Insert: ReceiptInsert;
        Update: ReceiptUpdate;
      };
      partner_users: {
        Row: PartnerUser;
        Insert: PartnerUserInsert;
        Update: PartnerUserUpdate;
      };
    };
  };
}
