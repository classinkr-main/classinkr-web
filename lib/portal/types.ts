export type PartnerAccountStatus = "active" | "inactive" | "pending";

export type DealStage =
  | "contact"
  | "quote"
  | "contract"
  | "confirmed"
  | "installation"
  | "payment"
  | "closed"
  | "cancelled";

export type DealStatus = "active" | "paused" | "closed" | "cancelled";

export type CatalogCategory = "board" | "camera" | "mount" | "install_fee";

export type QuoteDocumentStatus =
  | "pending_approval"
  | "draft"
  | "shared"
  | "accepted"
  | "expired"
  | "archived";

export type ContractDocumentStatus =
  | "draft"
  | "shared"
  | "partner_signed"
  | "admin_signed"
  | "completed"
  | "cancelled";

export type ShareAccessMode = "view" | "sign";

export type InstallationStatus =
  | "planned"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "paused"
  | "cancelled";

export type CreatedByRole = "admin" | "partner";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export type CalendarSourceType =
  | "meeting"
  | "installation"
  | "document_due"
  | "internal";

export type PartnerDocumentKind = "quote" | "contract" | "receipt";

export interface PartnerAccount {
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

export interface PartnerAccountUser {
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

export interface Customer {
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

export interface ProductCatalogItem {
  id: string;
  sku: string;
  category: CatalogCategory;
  product_name: string;
  default_unit_price: number;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  partner_account_id: string;
  customer_id: string;
  deal_code: string;
  title: string;
  status: DealStatus;
  current_stage: DealStage;
  expected_amount: number;
  contracted_amount: number;
  installed_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: PaymentStatus;
  starts_at: string | null;
  closed_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealListItem extends Deal {
  customer_name: string | null;
  customer_contact_name: string | null;
  customer_region_label: string | null;
  customer_campus_name: string | null;
}

export interface DealLineItem {
  id: string;
  deal_id: string;
  sku: string | null;
  category: CatalogCategory;
  product_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteDocument {
  id: string;
  deal_id: string;
  quote_number: string;
  current_version_id: string | null;
  status: QuoteDocumentStatus;
  created_by: string | null;
  created_by_role: "admin" | "partner";
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteDocumentBundle extends QuoteDocument {
  versions: QuoteDocumentVersion[];
  shares: QuoteDocumentShare[];
}

export interface QuoteDocumentVersion {
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

export interface QuoteDocumentShare {
  id: string;
  quote_document_version_id: string;
  token: string;
  access_mode: ShareAccessMode;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ContractDocument {
  id: string;
  deal_id: string;
  contract_number: string;
  current_version_id: string | null;
  status: ContractDocumentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractDocumentBundle extends ContractDocument {
  versions: ContractDocumentVersion[];
  shares: ContractDocumentShare[];
}

export interface ContractDocumentVersion {
  id: string;
  contract_document_id: string;
  version_number: number;
  title: string;
  content_html: string | null;
  structured_json: Record<string, unknown> | null;
  total_amount: number;
  valid_from: string | null;
  valid_until: string | null;
  sign_status: ContractDocumentStatus;
  partner_signed_at: string | null;
  partner_signature_url: string | null;
  admin_signed_at: string | null;
  admin_signature_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ContractDocumentShare {
  id: string;
  contract_document_version_id: string;
  token: string;
  access_mode: ShareAccessMode;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface InstallationEvent {
  id: string;
  partner_account_id: string;
  customer_id: string;
  deal_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  timezone: string;
  location: string | null;
  assigned_team: string | null;
  status: InstallationStatus;
  created_by_role: CreatedByRole;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  partner_account_id: string;
  customer_id: string;
  deal_id: string;
  amount: number;
  paid_at: string;
  payment_method: "bank_transfer" | "card" | "cash";
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptRecord {
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

export interface ActivityLog {
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

export interface CalendarEvent {
  id: string;
  partner_account_id: string;
  customer_id: string | null;
  deal_id: string | null;
  source_type: CalendarSourceType;
  source_id: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  title: string;
  description: string | null;
  status: "active" | "cancelled" | "completed";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string | null;
  deal_title?: string | null;
  deal_stage?: DealStage | null;
}

export interface CustomerDealSummary {
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

export interface CustomerDealHistoryItem {
  customer_id: string;
  customer_name: string;
  deal_id: string;
  deal_code: string;
  deal_title: string;
  current_stage: DealStage;
  deal_status: DealStatus;
  expected_amount: number;
  contracted_amount: number;
  installed_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: PaymentStatus;
  deal_created_at: string;
  deal_updated_at: string;
  last_activity_at: string | null;
  next_installation_at: string | null;
  last_paid_at: string | null;
}

export interface CustomerDealPreview {
  deal_id: string;
  title: string;
  current_stage: DealStage;
  status: DealStatus;
  updated_at: string;
  next_event_at: string | null;
}

export interface CustomerInsight {
  primary_stage: DealStage | null;
  next_event_at: string | null;
  next_event_type: CalendarSourceType | null;
  recent_activity_at: string | null;
  attention_level: "high" | "medium" | "low";
}

export interface CustomerListItem {
  customer: Customer;
  summary: CustomerDealSummary | null;
  insight?: CustomerInsight | null;
  deal_previews?: CustomerDealPreview[];
}

export interface CustomerDetailPayload {
  customer: Customer;
  summary: CustomerDealSummary;
  deals: CustomerDealHistoryItem[];
  recent_activity: ActivityLog[];
  recent_calendar_events: CalendarEvent[];
}

export interface DealDetailPayload {
  deal: Deal;
  customer: Customer;
  line_items: DealLineItem[];
  quote_documents: QuoteDocumentBundle[];
  contract_documents: ContractDocumentBundle[];
  installations: InstallationEvent[];
  payments: PaymentRecord[];
  receipts: ReceiptRecord[];
  activity_logs: ActivityLog[];
  calendar_events: CalendarEvent[];
}

export interface PartnerDocumentListItem {
  id: string;
  kind: PartnerDocumentKind;
  deal_id: string;
  customer_id: string;
  customer_name: string | null;
  deal_title: string;
  document_number: string;
  title?: string;
  status: string;
  version_count: number;
  total_amount: number | null;
  updated_at: string;
  latest_version_number: number | null;
  share_count: number;
  latest_share_created_at?: string | null;
  view_count?: number;
  last_viewed_at?: string | null;
  review_confirmed_at?: string | null;
  accepted_at?: string | null;
  pdf_url: string | null;
}

export interface PartnerDocumentSummary {
  all: number;
  quote: number;
  contract: number;
  receipt: number;
}
