/**
 * Supabase Database Types — Partner Portal V2 Domain
 *
 * 수동 정의 (20260404_partner_portal_v2_domain.sql 기반)
 * Supabase 연결 후 아래 명령으로 자동 생성 가능:
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
 */

/* ─── Enum Types ──────────────────────────────────────── */

export type PartnerAccountStatus = "active" | "inactive" | "pending";

export type DealStageV2 =
  | "contact"
  | "quote"
  | "contract"
  | "confirmed"
  | "installation"
  | "payment"
  | "closed"
  | "cancelled";

export type DealStatusV2 = "active" | "paused" | "closed" | "cancelled";

export type CatalogCategoryV2 = "board" | "camera" | "mount" | "install_fee";

export type QuoteDocumentStatusV2 =
  | "pending_approval"
  | "draft"
  | "shared"
  | "accepted"
  | "expired"
  | "archived";

export type ContractDocumentStatusV2 =
  | "draft"
  | "shared"
  | "partner_signed"
  | "admin_signed"
  | "completed"
  | "cancelled";

export type ShareAccessModeV2 = "view" | "sign";

export type InstallationStatusV2 =
  | "planned"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "paused"
  | "cancelled";

export type CreatedByRoleV2 = "admin" | "partner";

export type PaymentStatusV2 = "unpaid" | "partial" | "paid";

export type CalendarSourceTypeV2 =
  | "meeting"
  | "installation"
  | "document_due"
  | "internal";

export type PaymentMethodV2 = "bank_transfer" | "card" | "cash";

export type CalendarEventStatus = "active" | "cancelled" | "completed";

/* ─── Table Row Types ─────────────────────────────────── */

export interface PartnerAccountRow {
  id: string;
  name: string;
  owner_name: string | null;
  email: string | null;
  phone: string | null;
  business_number: string | null;
  address: string | null;
  status: PartnerAccountStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerAccountUserRow {
  id: string;
  partner_account_id: string;
  user_id: string;
  role: "owner";
  status: "invited" | "active" | "suspended";
  invited_by: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerRow {
  id: string;
  partner_account_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  business_number: string | null;
  campus_name: string | null;
  region_label: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCatalogItemRow {
  id: string;
  sku: string;
  category: CatalogCategoryV2;
  product_name: string;
  default_unit_price: number;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DealRow {
  id: string;
  partner_account_id: string;
  customer_id: string;
  deal_code: string;
  title: string;
  status: DealStatusV2;
  current_stage: DealStageV2;
  expected_amount: number;
  contracted_amount: number;
  installed_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: PaymentStatusV2;
  starts_at: string | null;
  closed_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealLineItemRow {
  id: string;
  deal_id: string;
  sku: string | null;
  category: CatalogCategoryV2;
  product_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteDocumentRow {
  id: string;
  deal_id: string;
  quote_number: string;
  current_version_id: string | null;
  status: QuoteDocumentStatusV2;
  created_by: string | null;
  created_by_role: CreatedByRoleV2;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteDocumentVersionRow {
  id: string;
  quote_document_id: string;
  version_number: number;
  title: string;
  content_html: string | null;
  structured_json: Record<string, unknown> | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  valid_until: string | null;
  created_by: string | null;
  created_at: string;
}

export interface QuoteDocumentShareRow {
  id: string;
  quote_document_version_id: string;
  token: string;
  access_mode: ShareAccessModeV2;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ContractDocumentRow {
  id: string;
  deal_id: string;
  contract_number: string;
  current_version_id: string | null;
  status: ContractDocumentStatusV2;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractDocumentVersionRow {
  id: string;
  contract_document_id: string;
  version_number: number;
  title: string;
  content_html: string | null;
  structured_json: Record<string, unknown> | null;
  total_amount: number;
  valid_from: string | null;
  valid_until: string | null;
  sign_status: ContractDocumentStatusV2;
  partner_signed_at: string | null;
  partner_signature_url: string | null;
  admin_signed_at: string | null;
  admin_signature_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ContractDocumentShareRow {
  id: string;
  contract_document_version_id: string;
  token: string;
  access_mode: ShareAccessModeV2;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface InstallationEventRow {
  id: string;
  partner_account_id: string;
  customer_id: string;
  deal_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  timezone: string;
  location: string | null;
  assigned_team: string | null;
  status: InstallationStatusV2;
  created_by_role: CreatedByRoleV2;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentV2Row {
  id: string;
  partner_account_id: string;
  customer_id: string;
  deal_id: string;
  amount: number;
  paid_at: string;
  payment_method: PaymentMethodV2;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptV2Row {
  id: string;
  partner_account_id: string;
  customer_id: string;
  deal_id: string;
  payment_id: string | null;
  receipt_number: string;
  total_amount: number;
  pdf_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLogRow {
  id: string;
  partner_account_id: string;
  customer_id: string | null;
  deal_id: string | null;
  actor_user_id: string | null;
  actor_role: string;
  action_type: string;
  target_type: string;
  target_id: string | null;
  summary: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
}

export interface CalendarEventRow {
  id: string;
  partner_account_id: string;
  customer_id: string | null;
  deal_id: string | null;
  source_type: CalendarSourceTypeV2;
  source_id: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  title: string;
  description: string | null;
  status: CalendarEventStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ─── View Row Types ──────────────────────────────────── */

export interface CustomerDealSummaryRow {
  customer_id: string;
  partner_account_id: string;
  customer_name: string;
  total_deals: number;
  active_deals: number;
  installation_deals: number;
  unpaid_deals: number;
  contracted_amount: number;
  installed_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  last_deal_updated_at: string | null;
}

export interface CustomerDealHistoryRow {
  customer_id: string;
  customer_name: string;
  deal_id: string;
  deal_code: string;
  deal_title: string;
  current_stage: DealStageV2;
  deal_status: DealStatusV2;
  expected_amount: number;
  contracted_amount: number;
  installed_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: PaymentStatusV2;
  deal_created_at: string;
  deal_updated_at: string;
  last_activity_at: string | null;
  next_installation_at: string | null;
  last_paid_at: string | null;
}

/* ─── Insert / Update Helpers ─────────────────────────── */

export type InsertPartnerAccount = Omit<PartnerAccountRow, "id" | "created_at" | "updated_at">;
export type UpdatePartnerAccount = Partial<Omit<PartnerAccountRow, "id" | "created_at" | "updated_at">>;

export type InsertCustomer = Omit<CustomerRow, "id" | "created_at" | "updated_at">;
export type UpdateCustomer = Partial<Omit<CustomerRow, "id" | "created_at" | "updated_at">>;

export type InsertDeal = Omit<DealRow, "id" | "created_at" | "updated_at">;
export type UpdateDeal = Partial<Omit<DealRow, "id" | "created_at" | "updated_at">>;

export type InsertDealLineItem = Omit<DealLineItemRow, "id" | "created_at" | "updated_at">;
export type UpdateDealLineItem = Partial<Omit<DealLineItemRow, "id" | "created_at" | "updated_at">>;

export type InsertQuoteDocument = Omit<QuoteDocumentRow, "id" | "created_at" | "updated_at">;
export type UpdateQuoteDocument = Partial<Omit<QuoteDocumentRow, "id" | "created_at" | "updated_at">>;

export type InsertQuoteDocumentVersion = Omit<QuoteDocumentVersionRow, "id" | "created_at">;

export type InsertContractDocument = Omit<ContractDocumentRow, "id" | "created_at" | "updated_at">;
export type UpdateContractDocument = Partial<Omit<ContractDocumentRow, "id" | "created_at" | "updated_at">>;

export type InsertContractDocumentVersion = Omit<ContractDocumentVersionRow, "id" | "created_at">;

export type InsertInstallationEvent = Omit<InstallationEventRow, "id" | "created_at" | "updated_at">;
export type UpdateInstallationEvent = Partial<Omit<InstallationEventRow, "id" | "created_at" | "updated_at">>;

export type InsertPaymentV2 = Omit<PaymentV2Row, "id" | "created_at" | "updated_at">;

export type InsertReceiptV2 = Omit<ReceiptV2Row, "id" | "created_at" | "updated_at">;

export type InsertActivityLog = Omit<ActivityLogRow, "id" | "created_at">;

export type InsertCalendarEvent = Omit<CalendarEventRow, "id" | "created_at" | "updated_at">;
export type UpdateCalendarEvent = Partial<Omit<CalendarEventRow, "id" | "created_at" | "updated_at">>;
