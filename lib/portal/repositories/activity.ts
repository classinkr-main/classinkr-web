"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { InsertActivityLog } from "@/lib/supabase/database.types.v2";
import type { ActivityLog } from "@/lib/portal/types";

export const PUBLIC_QUOTE_VIEW_ACTION = "public_quote_view";
export const PUBLIC_QUOTE_REVIEW_ACTION = "public_quote_review_confirmed";
export const PUBLIC_QUOTE_ACCEPT_ACTION = "public_quote_accepted";

type QuoteInteractionRecord = {
  version_id?: string | null;
  share_id?: string | null;
  token?: string | null;
};

export type QuoteInteractionSummary = {
  viewCount: number;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  reviewConfirmedAt: string | null;
  acceptedAt: string | null;
  acceptedVersionId: string | null;
  acceptedShareId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function matchesInteractionTarget(
  log: ActivityLog,
  target: QuoteInteractionRecord
) {
  const payload = isRecord(log.after_json) ? log.after_json : {};
  const versionId = readString(payload.version_id);
  const shareId = readString(payload.share_id);
  const token = readString(payload.token);

  if (target.version_id && versionId !== target.version_id) return false;
  if (target.share_id && shareId !== target.share_id) return false;
  if (target.token && token !== target.token) return false;
  return true;
}

export async function logActivity(
  input: InsertActivityLog
): Promise<ActivityLog> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("activity_logs")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as ActivityLog;
}

export async function listQuoteInteractionLogs(input: {
  quote_document_id: string;
  limit?: number;
}): Promise<ActivityLog[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("target_type", "quote_document")
    .eq("target_id", input.quote_document_id)
    .in("action_type", [
      PUBLIC_QUOTE_VIEW_ACTION,
      PUBLIC_QUOTE_REVIEW_ACTION,
      PUBLIC_QUOTE_ACCEPT_ACTION,
    ])
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 200);

  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

export async function summarizeQuoteInteractions(input: {
  quote_document_id: string;
  version_id?: string | null;
  share_id?: string | null;
  token?: string | null;
}): Promise<QuoteInteractionSummary> {
  const logs = await listQuoteInteractionLogs({
    quote_document_id: input.quote_document_id,
  });
  const matchedLogs = logs.filter((log) =>
    matchesInteractionTarget(log, {
      version_id: input.version_id ?? null,
      share_id: input.share_id ?? null,
      token: input.token ?? null,
    })
  );

  const viewLogs = matchedLogs
    .filter((log) => log.action_type === PUBLIC_QUOTE_VIEW_ACTION)
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
  const reviewLog =
    matchedLogs.find((log) => log.action_type === PUBLIC_QUOTE_REVIEW_ACTION) ?? null;
  const acceptedLog =
    matchedLogs.find((log) => log.action_type === PUBLIC_QUOTE_ACCEPT_ACTION) ?? null;
  const acceptedPayload = isRecord(acceptedLog?.after_json) ? acceptedLog.after_json : {};

  return {
    viewCount: viewLogs.length,
    firstViewedAt: viewLogs[0]?.created_at ?? null,
    lastViewedAt: viewLogs.at(-1)?.created_at ?? null,
    reviewConfirmedAt: reviewLog?.created_at ?? null,
    acceptedAt: acceptedLog?.created_at ?? null,
    acceptedVersionId: readString(acceptedPayload.version_id),
    acceptedShareId: readString(acceptedPayload.share_id),
  };
}

export async function getLatestAcceptedQuoteInteraction(input: {
  quote_document_id: string;
}): Promise<{
  log: ActivityLog;
  version_id: string | null;
  share_id: string | null;
} | null> {
  const logs = await listQuoteInteractionLogs({
    quote_document_id: input.quote_document_id,
    limit: 50,
  });
  const acceptedLog =
    logs.find((log) => log.action_type === PUBLIC_QUOTE_ACCEPT_ACTION) ?? null;

  if (!acceptedLog) return null;
  const payload = isRecord(acceptedLog.after_json) ? acceptedLog.after_json : {};

  return {
    log: acceptedLog,
    version_id: readString(payload.version_id),
    share_id: readString(payload.share_id),
  };
}

export async function ensureQuoteInteractionLog(input: InsertActivityLog & {
  dedupeWindowMinutes?: number;
  dedupeByVersion?: string | null;
  dedupeByShare?: string | null;
  dedupeByToken?: string | null;
}): Promise<ActivityLog> {
  const dedupeWindowMinutes = input.dedupeWindowMinutes ?? 0;

  if (dedupeWindowMinutes > 0 && input.target_type === "quote_document" && input.target_id) {
    const recentLogs = await listQuoteInteractionLogs({
      quote_document_id: input.target_id,
      limit: 40,
    });
    const threshold = Date.now() - dedupeWindowMinutes * 60 * 1000;
    const duplicate = recentLogs.find((log) => {
      if (log.action_type !== input.action_type) return false;
      if (new Date(log.created_at).getTime() < threshold) return false;
      return matchesInteractionTarget(log, {
        version_id: input.dedupeByVersion ?? null,
        share_id: input.dedupeByShare ?? null,
        token: input.dedupeByToken ?? null,
      });
    });

    if (duplicate) return duplicate;
  }

  const activityInput = { ...input };
  delete activityInput.dedupeWindowMinutes;
  delete activityInput.dedupeByVersion;
  delete activityInput.dedupeByShare;
  delete activityInput.dedupeByToken;

  return logActivity(activityInput);
}
