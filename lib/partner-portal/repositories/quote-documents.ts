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
} from "@/lib/partner-portal/types";

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

  // current_version_id 업데이트
  await supabase
    .from("quote_documents")
    .update({ current_version_id: version.id })
    .eq("id", input.quote_document_id);

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
