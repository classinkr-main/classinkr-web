export type PartnerAiIntent =
  | "create_deal"
  | "create_meeting"
  | "create_installation"
  | "update_customer"
  | "unknown";

export type PartnerAiChannel = "text" | "voice";
export type PartnerAiScreen = "home" | "workspace" | "calendar";
export type PartnerAiTargetEntityType = "customer" | "deal" | null;

export type PartnerAiActionContext = {
  screen: PartnerAiScreen;
  selected_date: string | null;
  selected_customer_id: string | null;
  selected_deal_id: string | null;
  timezone: string;
};

export type PartnerAiTargetCandidate = {
  id: string;
  label: string;
  score: number;
  entity_type: Exclude<PartnerAiTargetEntityType, null>;
};

export type PartnerAiActionPlan = {
  request_id: string;
  channel: PartnerAiChannel;
  raw_input: string;
  context: PartnerAiActionContext;
  intent: PartnerAiIntent;
  confidence: number;
  target_entity_type: PartnerAiTargetEntityType;
  target_candidates: PartnerAiTargetCandidate[];
  proposed_fields: Record<string, unknown>;
  missing_fields: string[];
  warnings: string[];
  requires_confirmation: boolean;
};

export type PartnerAiActionPreview = {
  request_id: string;
  intent: PartnerAiIntent;
  summary: string;
  target_label: string | null;
  final_payload: Record<string, unknown>;
  diff: Array<{
    field: string;
    before: unknown;
    after: unknown;
  }>;
  missing_fields: string[];
  warnings: string[];
  can_execute: boolean;
  confirmation_token: string | null;
};

export type PartnerAiExecuteResult = {
  request_id: string;
  result_type: string;
  entity_ids: Record<string, string | null>;
  success_message: string;
  refresh_hints: string[];
};
