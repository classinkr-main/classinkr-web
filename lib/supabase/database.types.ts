/**
 * Supabase Database Types
 *
 * 수동 정의 — Supabase 연결 후 아래 명령으로 자동 생성 가능:
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
 *
 * 현재는 Phase 1 테이블 4개 기준으로 수동 정의
 */

/* ─── Enum Types ─── */

export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "VIEWER" | "PARTNER" | "BRANCH";
export type AdminStatus = "INVITED" | "ACTIVE" | "SUSPENDED";
export type AdminCrmTeamRole = "branch_director" | "manager" | "admin" | "ops";

export type BlogPostStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "ARCHIVED";

export type LeadStatus = "new" | "contacted" | "converted" | "closed";
export type LeadSource =
  | "demo_modal"
  | "contact_page"
  | "newsletter"
  | "manual"
  | "meta_lead_ads";

/* ─── Table Row Types ─── */

export interface AdminProfile {
  user_id: string;
  display_name: string;
  role: AdminRole;
  status: AdminStatus;
  invited_by: string | null;
  last_login_at: string | null;
  branch_name: string | null;
  crm_team_role: AdminCrmTeamRole;
  crm_assignable: boolean;
  crm_owner_key: string | null;
  crm_owner_aliases: string[];
  neo_owner_id: string | null;
  crm_sort_order: number;
  capabilities: string[];
  /** 사이드바 프리셋 키. NULL이면 기존 role 기반 동작(무변화) — 20260729_admin_nav_access.sql */
  nav_preset: string | null;
  /** 프리셋 대비 사람별 예외. {"/admin/crm":"primary"} — 값 검증은 normalizeNavOverrides가 한다. */
  nav_overrides: Record<string, string>;
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
  lead_magnet_slug: string | null;
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
  source_detail: string | null;
  lead_magnet: string | null;
  follow_up_at: string | null;
  assigned_to: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  ttclid: string | null;
  landing_page: string | null;
  current_page: string | null;
  referrer: string | null;
  user_id: string | null;
  // 리드 제출 시점의 익명 식별자(cln_aid). 제출 전후의 client_events·material_downloads를
  // 이 리드에 귀속하는 결합 키 — lib/server/lead-identity-stitch.ts 참조.
  anonymous_id: string | null;
  // 공개 채널(문의/데모/뉴스레터/Meta 리드애즈 등) 리드는 null로 생성되며,
  // 관리자 확인(확인 버튼) 또는 상태가 new에서 벗어날 때 채워진다.
  // admin_manual(어드민 수기 등록) 소스는 즉시 채워져 게이트 대상에서 제외된다.
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MaterialGateType = "open" | "email" | "login";

export interface UserProfile {
  id: string;
  email: string | null;
  name: string | null;
  org: string | null;
  role: string | null;
  phone: string | null;
  provider: string | null;
  provider_id: string | null;
  marketing_consent: boolean;
  lead_id: string | null;
  account_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialDownload {
  id: string;
  material_slug: string;
  user_id: string | null;
  lead_id: string | null;
  anonymous_id: string | null;
  gate_type: MaterialGateType;
  source: string | null;
  post_slug: string | null;
  destination_url: string | null;
  created_at: string;
}

export interface ClientEvent {
  id: string;
  event_name: string;
  button: string | null;
  page: string | null;
  params: Record<string, unknown>;
  referrer: string | null;
  user_agent: string | null;
  anonymous_id: string | null;
  lead_id: string | null;
  user_id: string | null;
  session_id: string | null;
  created_at: string;
}

export interface IdentityStitchLog {
  id: string;
  user_id: string | null;
  email: string | null;
  anonymous_id: string | null;
  lead_ids: string[] | null;
  action: string | null;
  email_verified: boolean | null;
  created_at: string;
}

export type IdentityStitchLogInsert = Omit<IdentityStitchLog, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type IdentityStitchLogUpdate = Partial<Omit<IdentityStitchLog, "id" | "created_at">>;

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

export type CrmCustomerEventTargetType = "lead" | "neo_account" | "customer" | "deal" | "unknown";
export type CrmCustomerEventSourceType =
  | "manual_note"
  | "meeting_minutes"
  | "recording"
  | "calendar_event"
  | "lead_contact_log"
  | "external_crm"
  | "sheet"
  | "call"
  | "sms"
  | "site_inflow";
export type CrmCustomerEventSentiment = "positive" | "neutral" | "risk";
export type CrmNeoServiceRiskLevel = "urgent" | "soon" | "watch" | "normal";
export type CrmNeoServiceRiskConfidence = "high" | "medium" | "low";

// 행사 참석자 출신(origin) — 확정 시점 스냅샷.
// 설계: docs/active/event-attendee-tracking-plan-2026-06-29.md
export type AttendeeOrigin =
  | "ad_lead"
  | "site_lead"
  | "kr_team_lead"
  | "new_lead"
  | "existing_customer"
  | "partner_customer"
  | "unknown";

export interface CrmCustomerEvent {
  id: string;
  target_type: CrmCustomerEventTargetType;
  target_id: string | null;
  target_label: string | null;
  source_type: CrmCustomerEventSourceType;
  source_id: string | null;
  occurred_at: string;
  title: string;
  summary: string | null;
  body: string | null;
  meeting_purpose: string | null;
  owner_name: string | null;
  attendees: Record<string, unknown>[];
  decisions: Record<string, unknown>[];
  blockers: Record<string, unknown>[];
  next_actions: Record<string, unknown>[];
  sentiment: CrmCustomerEventSentiment;
  stage_signal: string | null;
  tags: string[];
  public_event_id: string | null;
  attendee_origin: AttendeeOrigin | null;
  recording_storage_path: string | null;
  recording_file_name: string | null;
  recording_mime_type: string | null;
  recording_size_bytes: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CrmTaskTargetType = "lead" | "neo_account" | "customer" | "deal" | "unknown";
export type CrmTaskType =
  | "call"
  | "kakao"
  | "email"
  | "meeting"
  | "quote"
  | "demo"
  | "install"
  | "renewal"
  | "cs_checkin"
  | "data_fix"
  | "other";
export type CrmTaskPriority = "low" | "normal" | "high" | "urgent";
export type CrmTaskStatus = "open" | "done" | "snoozed" | "canceled";

export interface CrmTask {
  id: string;
  target_type: CrmTaskTargetType;
  target_id: string | null;
  target_label: string | null;
  owner_key: string | null;
  owner_name_snapshot: string | null;
  task_type: CrmTaskType;
  title: string;
  detail: string | null;
  due_at: string | null;
  snoozed_until: string | null;
  priority: CrmTaskPriority;
  status: CrmTaskStatus;
  source_event_id: string | null;
  created_by: string | null;
  assigned_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
}

export type CrmTaskInsert = Omit<CrmTask, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};
export type CrmTaskUpdate = Partial<Omit<CrmTask, "id" | "created_at">>;

export interface CrmNeoCustomerSnapshot {
  source_system: string;
  account_id: string;
  account_name: string;
  owner_id: string | null;
  owner_name: string;
  phone: string | null;
  uid: string | null;
  region_label: string | null;
  balance: number | null;
  expire_at: string | null;
  last_class_at: string | null;
  order_amount: number;
  order_count: number;
  has_eeo: boolean;
  risk_level: CrmNeoServiceRiskLevel;
  risk_reasons: Record<string, unknown>[];
  expire_in_days: number | null;
  risk_confidence: CrmNeoServiceRiskConfidence;
  freshness_label: string | null;
  account_synced_at: string | null;
  shroff_synced_at: string | null;
  opportunity_synced_at: string | null;
  source_synced_at: string | null;
  source_run_ids: Record<string, unknown>;
  source_refs: Record<string, unknown>;
  is_partial: boolean;
  partial_reason: string | null;
  is_stale: boolean;
  stale_at: string | null;
  calculated_at: string;
  created_at: string;
  updated_at: string;
}

export type CrmNeoCustomerSnapshotInsert = Omit<
  CrmNeoCustomerSnapshot,
  "created_at" | "updated_at"
> & {
  created_at?: string;
  updated_at?: string;
};
export type CrmNeoCustomerSnapshotUpdate = Partial<
  Omit<CrmNeoCustomerSnapshot, "source_system" | "account_id" | "created_at">
>;

export type CrmDealStage = "consult" | "demo" | "quote" | "decision" | "order" | "won" | "lost";
export type CrmDealStatus = "open" | "won" | "lost";

export interface CrmDeal {
  id: string;
  target_type: CrmTaskTargetType;
  target_id: string | null;
  target_label: string | null;
  owner_key: string | null;
  owner_name_snapshot: string | null;
  title: string;
  stage: CrmDealStage;
  status: CrmDealStatus;
  expected_amount: number | null;
  expected_close_at: string | null;
  next_task_id: string | null;
  quote_ref: string | null;
  order_ref: string | null;
  risk_note: string | null;
  created_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CrmDealInsert = Omit<CrmDeal, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};
export type CrmDealUpdate = Partial<Omit<CrmDeal, "id" | "created_at">>;

export type CrmCaptureSourceType = "pasted_table" | "pasted_text" | "public_event" | "single";
export type CrmCaptureBatchStatus = "draft" | "parsed" | "reviewed" | "applied" | "partial_failed" | "canceled";
export type CrmCaptureActivityType =
  | "event_attended"
  | "visit"
  | "demo_call"
  | "check_in_call"
  | "installation"
  | "consultation"
  | "quote_sent"
  | "onboarding"
  | "cs_issue"
  | "memo";
export type CrmCaptureMatchStatus =
  | "confirmed_customer"
  | "confirmed_lead"
  | "multiple_candidates"
  | "new_lead_candidate"
  | "needs_review"
  | "duplicate_in_batch";
export type CrmCaptureApplyStatus = "pending" | "applied" | "skipped" | "failed";

export interface CrmCaptureBatch {
  id: string;
  source_type: CrmCaptureSourceType;
  source_id: string | null;
  source_label: string | null;
  public_event_id: string | null;
  default_activity_type: CrmCaptureActivityType;
  default_task_enabled: boolean;
  default_task_offset_days: number;
  raw_input_storage_path: string | null;
  status: CrmCaptureBatchStatus;
  row_count: number;
  event_created_count: number;
  task_created_count: number;
  lead_created_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CrmCaptureBatchInsert = Omit<CrmCaptureBatch, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};
export type CrmCaptureBatchUpdate = Partial<Omit<CrmCaptureBatch, "id" | "created_at">>;

export interface CrmCaptureRow {
  id: string;
  batch_id: string;
  row_index: number;
  raw_text: string;
  organization_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  region_label: string | null;
  activity_type: CrmCaptureActivityType;
  memo: string | null;
  match_status: CrmCaptureMatchStatus;
  matched_target_type: "lead" | "neo_account" | "customer" | "deal" | null;
  matched_target_id: string | null;
  matched_target_label: string | null;
  match_candidates: Record<string, unknown>[];
  attendee_origin: AttendeeOrigin | null;
  selected: boolean;
  create_task: boolean;
  task_due_at: string | null;
  apply_status: CrmCaptureApplyStatus;
  created_event_id: string | null;
  created_task_id: string | null;
  created_lead_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type CrmCaptureRowInsert = Omit<CrmCaptureRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};
export type CrmCaptureRowUpdate = Partial<Omit<CrmCaptureRow, "id" | "created_at">>;

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
  actor_display_name: string | null;
  actor_role: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

/* ─── Partner Portal Types ─── */

// 20260727_partners_status_text_check.sql 이후 partners.status 는 TEXT+CHECK.
// 값 집합의 단일 진실원은 lib/partners-data.ts PARTNER_STATUSES.
export type PartnerStatus = "lead" | "active" | "paused" | "churn_risk";
export type PipelineStage = "prospect" | "quoting" | "contracted" | "installing" | "completed" | "cancelled";

export interface PartnerUser {
  id: string;
  user_id: string;        // Supabase auth.users.id
  partner_id: string;     // FK → partners.id
  display_name: string | null;
  role: "admin" | "member"; // admin = 파트너(대표, 서명권 보유) / member = 고객(매니저 등, 조회·변경요청만)
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
  pipeline_stage: PipelineStage;
  deal_amount: number | null;
  installation_date: string | null;
  installation_sub_dates: string[] | null; // 교실별 설치일이 다를 경우 보조 날짜 목록
  installation_address: string | null;
  installer_name: string | null;
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
  version: number; // 수정 버전. quote_number는 동일하게 유지되고 version만 증가 (v1→v2→v3)
  partner_id: string;
  lead_id: string | null;
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
  sku: string | null;
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
  version: number; // 수정 재발행 버전. 재서명 필요 시 버전 증가
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

/* ─── HW Sales Types ─── */

export type HwSaleStatus = "pending" | "shipped" | "delivered" | "cancelled";

export interface HwSale {
  id: string;
  sale_number: string;
  contract_id: string | null;
  partner_id: string;
  status: HwSaleStatus;
  delivery_date: string | null;
  delivered_at: string | null;
  installer: string | null;
  delivery_address: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HwSaleItem {
  id: string;
  sale_id: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  serial_notes: string | null;
  sort_order: number;
}

export type HwSaleInsert = Omit<HwSale, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
export type HwSaleUpdate = Partial<Omit<HwSale, "id" | "created_at">>;
export type HwSaleItemInsert = Omit<HwSaleItem, "id"> & { id?: string };
export type HwSaleItemUpdate = Partial<Omit<HwSaleItem, "id">>;

/* ─── Insert Types (id, created_at 등 자동 생성 필드 제외) ─── */

export type AdminProfileInsert = Omit<
  AdminProfile,
  | "created_at"
  | "updated_at"
  | "branch_name"
  | "crm_team_role"
  | "crm_assignable"
  | "crm_owner_key"
  | "crm_owner_aliases"
  | "neo_owner_id"
  | "crm_sort_order"
  | "capabilities"
> & {
  branch_name?: string | null;
  crm_team_role?: AdminCrmTeamRole;
  crm_assignable?: boolean;
  crm_owner_key?: string | null;
  crm_owner_aliases?: string[];
  neo_owner_id?: string | null;
  crm_sort_order?: number;
  capabilities?: string[];
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

export type LeadInsert = Omit<Lead, "id" | "created_at" | "updated_at" | "user_id"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string | null;
};

export type UserProfileInsert = Omit<UserProfile, "created_at" | "updated_at"> & {
  created_at?: string;
  updated_at?: string;
};

export type MaterialDownloadInsert = Omit<MaterialDownload, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type ClientEventInsert = Omit<ClientEvent, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
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
export type UserProfileUpdate = Partial<Omit<UserProfile, "id" | "created_at">>;
export type MaterialDownloadUpdate = Partial<Omit<MaterialDownload, "id" | "created_at">>;
export type ClientEventUpdate = Partial<Omit<ClientEvent, "id" | "created_at">>;

export type LeadContactLogInsert = Omit<LeadContactLog, "id"> & { id?: string };
export type LeadContactLogUpdate = Partial<Omit<LeadContactLog, "id">>;

export type CrmCustomerEventInsert = Omit<CrmCustomerEvent, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};
export type CrmCustomerEventUpdate = Partial<Omit<CrmCustomerEvent, "id" | "created_at">>;

export interface CrmCustomerTag {
  id: string;
  target_type: CrmCustomerEventTargetType;
  target_id: string;
  tag: string;
  created_at: string;
  created_by: string | null;
}
export type CrmCustomerTagInsert = Omit<CrmCustomerTag, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};
export type CrmCustomerTagUpdate = Partial<Omit<CrmCustomerTag, "id" | "created_at">>;

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
      user_profiles: {
        Row: UserProfile;
        Insert: UserProfileInsert;
        Update: UserProfileUpdate;
      };
      material_downloads: {
        Row: MaterialDownload;
        Insert: MaterialDownloadInsert;
        Update: MaterialDownloadUpdate;
      };
      client_events: {
        Row: ClientEvent;
        Insert: ClientEventInsert;
        Update: ClientEventUpdate;
      };
      identity_stitch_logs: {
        Row: IdentityStitchLog;
        Insert: IdentityStitchLogInsert;
        Update: IdentityStitchLogUpdate;
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
      crm_customer_events: {
        Row: CrmCustomerEvent;
        Insert: CrmCustomerEventInsert;
        Update: CrmCustomerEventUpdate;
      };
      crm_customer_tags: {
        Row: CrmCustomerTag;
        Insert: CrmCustomerTagInsert;
        Update: CrmCustomerTagUpdate;
      };
      crm_tasks: {
        Row: CrmTask;
        Insert: CrmTaskInsert;
        Update: CrmTaskUpdate;
      };
      crm_neo_customer_snapshots: {
        Row: CrmNeoCustomerSnapshot;
        Insert: CrmNeoCustomerSnapshotInsert;
        Update: CrmNeoCustomerSnapshotUpdate;
      };
      crm_deals: {
        Row: CrmDeal;
        Insert: CrmDealInsert;
        Update: CrmDealUpdate;
      };
      crm_capture_batches: {
        Row: CrmCaptureBatch;
        Insert: CrmCaptureBatchInsert;
        Update: CrmCaptureBatchUpdate;
      };
      crm_capture_rows: {
        Row: CrmCaptureRow;
        Insert: CrmCaptureRowInsert;
        Update: CrmCaptureRowUpdate;
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
      hw_sales: {
        Row: HwSale;
        Insert: HwSaleInsert;
        Update: HwSaleUpdate;
      };
      hw_sale_items: {
        Row: HwSaleItem;
        Insert: HwSaleItemInsert;
        Update: HwSaleItemUpdate;
      };
      partner_users: {
        Row: PartnerUser;
        Insert: PartnerUserInsert;
        Update: PartnerUserUpdate;
      };
      teams: {
        Row: Team;
        Insert: TeamInsert;
        Update: TeamUpdate;
      };
      install_schedules: {
        Row: InstallSchedule;
        Insert: InstallScheduleInsert;
        Update: InstallScheduleUpdate;
      };
    };
  };
}

/* ─── Install Schedule Types ─── */

export interface Team {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type TeamInsert = Omit<Team, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
export type TeamUpdate = Partial<Omit<Team, "id" | "created_at">>;

export type InstallStatus = "requested" | "confirmed" | "completed" | "cancelled";
export type RequestedBy = "admin" | "partner";

export interface InstallSchedule {
  id: string;
  contract_id: string;
  quote_item_id: string | null;
  partner_id: string;
  manager_id: string | null;
  team_id: string | null;
  scheduled_date: string;
  location: string | null;
  status: InstallStatus;
  requested_by: RequestedBy;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type InstallScheduleInsert = Omit<InstallSchedule, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
export type InstallScheduleUpdate = Partial<Omit<InstallSchedule, "id" | "created_at">>;

/* ─── Product Catalog Types ─── */

export type MountType = "stand" | "wall" | "embed";

export interface ProductCatalogItem {
  sku: string;
  product_name: string;
  description: string;
  unit_price: number;
  category: "board" | "camera" | "mount";
}

/* ─── Audit Log for Partner Changes ─── */

export interface PartnerChangeLog {
  id: string;
  partner_id: string;
  actor_user_id: string | null;
  actor_role: "admin" | "member" | "classin_admin";
  action_type: string;        // e.g. "quote_item_update", "delivery_request"
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
}
