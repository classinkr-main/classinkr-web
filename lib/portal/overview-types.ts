import type { DealStage } from "@/lib/portal/types";

export type CommercialOverviewRange = "today" | "week" | "month" | "quarter";

export interface CommercialOverviewMetrics {
  customer_count: number;
  active_deal_count: number;
  quote_count: number;
  contract_count: number;
  confirmed_count: number;
  scheduled_installation_count: number;
  outstanding_amount: number;
  outstanding_customer_count: number;
}

export interface CommercialOverviewStageCount {
  stage: DealStage;
  label: string;
  count: number;
}

export type CommercialOverviewAlertKind =
  | "outstanding"
  | "installation"
  | "document"
  | "attention";

export type CommercialOverviewAlertTone = "neutral" | "warning" | "accent";

export interface CommercialOverviewAlert {
  id: string;
  kind: CommercialOverviewAlertKind;
  tone: CommercialOverviewAlertTone;
  title: string;
  description: string;
  customer_id: string | null;
  deal_id: string | null;
}

export interface CommercialOverviewAgendaItem {
  id: string;
  kind: "installation" | "meeting" | "document_due" | "internal";
  title: string;
  description: string | null;
  customer_id: string | null;
  customer_name: string | null;
  deal_id: string | null;
  deal_title: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
}

export interface CommercialOverviewPayload {
  metrics: CommercialOverviewMetrics;
  stage_counts: CommercialOverviewStageCount[];
  alerts: CommercialOverviewAlert[];
  agenda: CommercialOverviewAgendaItem[];
  updated_at: string;
}
