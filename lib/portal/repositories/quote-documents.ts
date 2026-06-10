"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  InsertQuoteDocument,
  UpdateQuoteDocument,
  InsertQuoteDocumentVersion,
} from "@/lib/supabase/database.types.v2";
import type {
  QuoteDocument,
  QuoteDocumentVersion,
  QuoteDocumentShare,
} from "@/lib/portal/types";

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

/* ─── Number Generation ─────────────────────────────────── */

async function generateQuoteNumber(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;

  const { count } = await supabase
    .from("quote_documents")
    .select("*", { count: "exact", head: true })
    .like("quote_number", `${prefix}%`);

  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

/* ─── Document CRUD ─────────────────────────────────────── */

export async function createQuoteDocument(
  input: Omit<InsertQuoteDocument, "quote_number">
): Promise<QuoteDocument> {
  const supabase = createSupabaseAdminClient();
  const quoteNumber = await generateQuoteNumber();

  const { data, error } = await supabase
    .from("quote_documents")
    .insert({ ...input, quote_number: quoteNumber })
    .select()
    .single();

  if (error) throw error;
  return data as QuoteDocument;
}

export async function updateQuoteDocument(
  id: string,
  input: UpdateQuoteDocument
): Promise<QuoteDocument> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("quote_documents")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as QuoteDocument;
}

export async function getQuoteDocument(
  id: string
): Promise<QuoteDocument | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("quote_documents")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as QuoteDocument;
}

/* ─── Version CRUD ──────────────────────────────────────── */

export async function createQuoteDocumentVersion(
  input: InsertQuoteDocumentVersion
): Promise<QuoteDocumentVersion> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("quote_document_versions")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  const version = data as QuoteDocumentVersion;

  const { error: updateError } = await supabase
    .from("quote_documents")
    .update({ current_version_id: version.id })
    .eq("id", input.quote_document_id);

  if (updateError) throw updateError;

  return version;
}

/* ─── Share ─────────────────────────────────────────────── */

export async function createQuoteDocumentShare(input: {
  quote_document_version_id: string;
  access_mode: "view" | "sign";
  expires_at?: string | null;
  created_by?: string | null;
}): Promise<QuoteDocumentShare> {
  const supabase = createSupabaseAdminClient();
  const token = crypto.randomUUID();

  const { data, error } = await supabase
    .from("quote_document_shares")
    .insert({ ...input, token })
    .select()
    .single();

  if (error) throw error;
  return data as QuoteDocumentShare;
}

export async function getResolvableQuoteVersion(document: QuoteDocument): Promise<QuoteDocumentVersion | null> {
  const supabase = createSupabaseAdminClient();

  if (document.current_version_id) {
    const { data, error } = await supabase
      .from("quote_document_versions")
      .select("*")
      .eq("id", document.current_version_id)
      .maybeSingle();

    if (!error && data) return data as QuoteDocumentVersion;
  }

  const { data, error } = await supabase
    .from("quote_document_versions")
    .select("*")
    .eq("quote_document_id", document.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as QuoteDocumentVersion;
}

export async function getLatestQuoteDocumentShare(
  versionId: string
): Promise<QuoteDocumentShare | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("quote_document_shares")
    .select("*")
    .eq("quote_document_version_id", versionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as QuoteDocumentShare;
}

export async function ensureQuoteDocumentShare(input: {
  quote_document_id: string;
  access_mode?: "view" | "sign";
  expires_at?: string | null;
  created_by?: string | null;
}): Promise<{
  document: QuoteDocument;
  version: QuoteDocumentVersion;
  share: QuoteDocumentShare;
}> {
  const supabase = createSupabaseAdminClient();
  const document = await getQuoteDocument(input.quote_document_id);
  if (!document) {
    throw new Error("견적서를 찾을 수 없습니다.");
  }

  const version = await getResolvableQuoteVersion(document);
  if (!version) {
    throw new Error("공유할 견적 버전이 없습니다.");
  }

  const accessMode = input.access_mode ?? "view";
  const { data: existingShares, error: shareError } = await supabase
    .from("quote_document_shares")
    .select("*")
    .eq("quote_document_version_id", version.id)
    .eq("access_mode", accessMode)
    .order("created_at", { ascending: false })
    .limit(20);

  if (shareError) throw shareError;
  const existingShare = (existingShares as QuoteDocumentShare[] | null)?.find(
    (candidate) => !isExpired(candidate.expires_at)
  );
  if (existingShare) {
    return {
      document,
      version,
      share: existingShare,
    };
  }

  const share = await createQuoteDocumentShare({
    quote_document_version_id: version.id,
    access_mode: accessMode,
    expires_at: input.expires_at ?? null,
    created_by: input.created_by ?? null,
  });

  return { document, version, share };
}

export type PublicQuoteLookup =
  | {
      status: "ok";
      share: QuoteDocumentShare;
      document: QuoteDocument;
      version: QuoteDocumentVersion;
      customer_name: string | null;
    }
  | { status: "expired"; expires_at: string | null }
  | { status: "not_found" };

export async function getPublicQuoteByToken(token: string): Promise<PublicQuoteLookup> {
  const supabase = createSupabaseAdminClient();

  const { data: shareData, error: shareError } = await supabase
    .from("quote_document_shares")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (shareError || !shareData) return { status: "not_found" };

  const share = shareData as QuoteDocumentShare;
  if (isExpired(share.expires_at)) {
    return { status: "expired", expires_at: share.expires_at };
  }

  const { data: versionData, error: versionError } = await supabase
    .from("quote_document_versions")
    .select("*")
    .eq("id", share.quote_document_version_id)
    .maybeSingle();

  if (versionError || !versionData) return { status: "not_found" };
  const version = versionData as QuoteDocumentVersion;

  const document = await getQuoteDocument(version.quote_document_id);
  if (!document) return { status: "not_found" };

  const { data: dealData } = await supabase
    .from("deals")
    .select("customers(name)")
    .eq("id", document.deal_id)
    .maybeSingle();

  const customerName =
    (dealData as { customers?: { name?: string | null } | null } | null)?.customers?.name ?? null;

  return {
    status: "ok",
    share,
    document,
    version,
    customer_name: customerName,
  };
}
