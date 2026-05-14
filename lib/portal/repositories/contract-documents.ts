"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  InsertContractDocument,
  UpdateContractDocument,
  InsertContractDocumentVersion,
} from "@/lib/supabase/database.types.v2";
import type {
  ContractDocument,
  ContractDocumentVersion,
  ContractDocumentShare,
  QuoteDocument,
  QuoteDocumentVersion,
} from "@/lib/portal/types";
import { getLatestAcceptedQuoteInteraction } from "@/lib/portal/repositories/activity";

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

type QuoteVersionCandidate = Pick<
  QuoteDocumentVersion,
  | "id"
  | "quote_document_id"
  | "version_number"
  | "title"
  | "content_html"
  | "structured_json"
  | "subtotal"
  | "discount_amount"
  | "tax_amount"
  | "total_amount"
  | "valid_until"
  | "created_by"
  | "created_at"
>;

function buildContractSourceQuoteJson(input: {
  quoteDocument: QuoteDocument;
  version: QuoteVersionCandidate;
  acceptedInteraction: {
    log_id: string;
    share_id: string | null;
  } | null;
  sourceSelection: "accepted" | "current_version" | "latest";
}) {
  const sourceQuote = {
    quote_document_id: input.quoteDocument.id,
    quote_number: input.quoteDocument.quote_number,
    quote_status: input.quoteDocument.status,
    quote_version_id: input.version.id,
    quote_version_number: input.version.version_number,
    quote_interaction_log_id: input.acceptedInteraction?.log_id ?? null,
    quote_interaction_share_id: input.acceptedInteraction?.share_id ?? null,
    source_selection: input.sourceSelection,
  };

  return sourceQuote;
}

function resolveQuoteVersionForConversion(input: {
  quoteDocument: QuoteDocument;
  versions: QuoteVersionCandidate[];
  acceptedInteraction: {
    log_id: string;
    share_id: string | null;
    version_id: string | null;
  } | null;
}) {
  if (input.acceptedInteraction?.version_id) {
    const acceptedVersion = input.versions.find(
      (version) => version.id === input.acceptedInteraction?.version_id
    );
    if (acceptedVersion) {
      return {
        version: acceptedVersion,
        acceptedInteraction: {
          log_id: input.acceptedInteraction.log_id,
          share_id: input.acceptedInteraction.share_id,
        },
        sourceSelection: "accepted" as const,
      };
    }
  }

  if (input.quoteDocument.current_version_id) {
    const currentVersion = input.versions.find(
      (version) => version.id === input.quoteDocument.current_version_id
    );
    if (currentVersion) {
      return {
        version: currentVersion,
        acceptedInteraction: input.acceptedInteraction
          ? {
              log_id: input.acceptedInteraction.log_id,
              share_id: input.acceptedInteraction.share_id,
            }
          : null,
        sourceSelection: "current_version" as const,
      };
    }
  }

  const latestVersion = input.versions[0];

  if (!latestVersion) {
    return null;
  }

  return {
    version: latestVersion,
    acceptedInteraction: input.acceptedInteraction
      ? {
          log_id: input.acceptedInteraction.log_id,
          share_id: input.acceptedInteraction.share_id,
        }
      : null,
    sourceSelection: "latest" as const,
  };
}

/* ─── Number Generation ─────────────────────────────────── */

async function generateContractNumber(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getFullYear();
  const prefix = `C-${year}-`;

  const { count } = await supabase
    .from("contract_documents")
    .select("*", { count: "exact", head: true })
    .like("contract_number", `${prefix}%`);

  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

/* ─── Document CRUD ─────────────────────────────────────── */

export async function createContractDocument(
  input: Omit<InsertContractDocument, "contract_number">
): Promise<ContractDocument> {
  const supabase = createSupabaseAdminClient();
  const contractNumber = await generateContractNumber();

  const { data, error } = await supabase
    .from("contract_documents")
    .insert({ ...input, contract_number: contractNumber })
    .select()
    .single();

  if (error) throw error;
  return data as ContractDocument;
}

export async function updateContractDocument(
  id: string,
  input: UpdateContractDocument
): Promise<ContractDocument> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("contract_documents")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ContractDocument;
}

export async function getContractDocument(
  id: string
): Promise<ContractDocument | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("contract_documents")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as ContractDocument;
}

/* ─── Version CRUD ──────────────────────────────────────── */

export async function createContractDocumentVersion(
  input: InsertContractDocumentVersion
): Promise<ContractDocumentVersion> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("contract_document_versions")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  const version = data as ContractDocumentVersion;

  // current_version_id 업데이트
  await supabase
    .from("contract_documents")
    .update({ current_version_id: version.id })
    .eq("id", input.contract_document_id);

  return version;
}

/* ─── Signature ─────────────────────────────────────────── */

export async function applySignature(
  versionId: string,
  signatureUrl: string,
  signerType: "partner" | "admin"
): Promise<ContractDocumentVersion> {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const updateFields =
    signerType === "partner"
      ? {
          partner_signed_at: now,
          partner_signature_url: signatureUrl,
          sign_status: "partner_signed" as const,
        }
      : {
          admin_signed_at: now,
          admin_signature_url: signatureUrl,
          sign_status: "admin_signed" as const,
        };

  const { data, error } = await supabase
    .from("contract_document_versions")
    .update(updateFields)
    .eq("id", versionId)
    .select()
    .single();

  if (error) throw error;
  return data as ContractDocumentVersion;
}

/* ─── Share ─────────────────────────────────────────────── */

export async function createContractDocumentShare(input: {
  contract_document_version_id: string;
  access_mode: "view" | "sign";
  expires_at?: string | null;
  created_by?: string | null;
}): Promise<ContractDocumentShare> {
  const supabase = createSupabaseAdminClient();
  const token = crypto.randomUUID();

  const { data, error } = await supabase
    .from("contract_document_shares")
    .insert({ ...input, token })
    .select()
    .single();

  if (error) throw error;
  return data as ContractDocumentShare;
}

async function getResolvableContractVersion(document: ContractDocument): Promise<ContractDocumentVersion | null> {
  const supabase = createSupabaseAdminClient();

  if (document.current_version_id) {
    const { data, error } = await supabase
      .from("contract_document_versions")
      .select("*")
      .eq("id", document.current_version_id)
      .maybeSingle();

    if (!error && data) return data as ContractDocumentVersion;
  }

  const { data, error } = await supabase
    .from("contract_document_versions")
    .select("*")
    .eq("contract_document_id", document.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as ContractDocumentVersion;
}

export async function ensureContractDocumentShare(input: {
  contract_document_id: string;
  access_mode?: "view" | "sign";
  expires_at?: string | null;
  created_by?: string | null;
}): Promise<{
  document: ContractDocument;
  version: ContractDocumentVersion;
  share: ContractDocumentShare;
}> {
  const supabase = createSupabaseAdminClient();
  const document = await getContractDocument(input.contract_document_id);
  if (!document) {
    throw new Error("계약서를 찾을 수 없습니다.");
  }

  const version = await getResolvableContractVersion(document);
  if (!version) {
    throw new Error("공유할 계약 버전이 없습니다.");
  }

  const accessMode = input.access_mode ?? "sign";
  const { data: existingShares, error: shareError } = await supabase
    .from("contract_document_shares")
    .select("*")
    .eq("contract_document_version_id", version.id)
    .eq("access_mode", accessMode)
    .order("created_at", { ascending: false })
    .limit(20);

  if (shareError) throw shareError;
  const existingShare = (existingShares as ContractDocumentShare[] | null)?.find(
    (candidate) => !isExpired(candidate.expires_at)
  );
  if (existingShare) {
    return {
      document,
      version,
      share: existingShare,
    };
  }

  const share = await createContractDocumentShare({
    contract_document_version_id: version.id,
    access_mode: accessMode,
    expires_at: input.expires_at ?? null,
    created_by: input.created_by ?? null,
  });

  return { document, version, share };
}

/* ─── Quote → Contract Conversion ───────────────────────── */

export async function convertQuoteToContract(
  quoteDocId: string,
  dealId: string,
  createdBy: string | null
): Promise<{ contractDocument: ContractDocument; version: ContractDocumentVersion }> {
  const supabase = createSupabaseAdminClient();

  const { data: quoteDoc, error: quoteDocError } = await supabase
    .from("quote_documents")
    .select("*")
    .eq("id", quoteDocId)
    .single();

  if (quoteDocError || !quoteDoc) {
    throw new Error("견적 문서를 찾을 수 없습니다");
  }

  const { data: versions, error: versionsError } = await supabase
    .from("quote_document_versions")
    .select("*")
    .eq("quote_document_id", quoteDocId)
    .order("version_number", { ascending: false });

  if (versionsError) throw versionsError;

  const quoteVersions = (versions ?? []) as QuoteVersionCandidate[];
  if (quoteVersions.length === 0) {
    throw new Error("견적 버전을 찾을 수 없습니다");
  }

  const quoteDocument = quoteDoc as QuoteDocument;
  const acceptedInteraction = await getLatestAcceptedQuoteInteraction({
    quote_document_id: quoteDocId,
  });
  const normalizedAcceptedInteraction = acceptedInteraction
    ? {
        log_id: acceptedInteraction.log.id,
        version_id: acceptedInteraction.version_id,
        share_id: acceptedInteraction.share_id,
      }
    : null;

  const resolvedQuote = resolveQuoteVersionForConversion({
    quoteDocument,
    versions: quoteVersions,
    acceptedInteraction: normalizedAcceptedInteraction,
  });

  if (!resolvedQuote) {
    throw new Error("견적 버전을 찾을 수 없습니다");
  }

  const sourceStructuredJson =
    resolvedQuote.version.structured_json && typeof resolvedQuote.version.structured_json === "object"
        ? {
          ...resolvedQuote.version.structured_json,
          sourceQuote: buildContractSourceQuoteJson({
            quoteDocument,
            version: resolvedQuote.version,
            acceptedInteraction: resolvedQuote.acceptedInteraction,
            sourceSelection: resolvedQuote.sourceSelection,
          }),
        }
      : {
          sourceQuote: buildContractSourceQuoteJson({
            quoteDocument,
            version: resolvedQuote.version,
            acceptedInteraction: resolvedQuote.acceptedInteraction,
            sourceSelection: resolvedQuote.sourceSelection,
          }),
        };

  // 계약 문서 생성
  const contractDocument = await createContractDocument({
    deal_id: dealId,
    status: "draft",
    current_version_id: null,
    created_by: createdBy,
  });

  // 계약 버전 생성 (견적 내용 복사)
  const version = await createContractDocumentVersion({
    contract_document_id: contractDocument.id,
    version_number: 1,
    title: resolvedQuote.version.title ?? "계약서",
    content_html: resolvedQuote.version.content_html ?? null,
    structured_json: sourceStructuredJson,
    total_amount: resolvedQuote.version.total_amount ?? 0,
    valid_from: null,
    valid_until: resolvedQuote.version.valid_until ?? null,
    sign_status: "draft",
    partner_signed_at: null,
    partner_signature_url: null,
    admin_signed_at: null,
    admin_signature_url: null,
    created_by: createdBy,
  });

  // 견적 상태 업데이트
  await supabase
    .from("quote_documents")
    .update({ status: "archived" })
    .eq("id", quoteDocId);

  return { contractDocument, version };
}
