"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchAllSupabaseRows } from "@/lib/repositories/branch-hw";
import type {
  InsertContractDocument,
  UpdateContractDocument,
  InsertContractDocumentVersion,
} from "@/lib/supabase/database.types.v2";
import type {
  ContractDocument,
  ContractDocumentListItem,
  ContractDocumentVersion,
  ContractDocumentShare,
  QuoteDocument,
  QuoteDocumentVersion,
} from "@/lib/portal/types";
import {
  CONTRACT_NUMBER_INSERT_ATTEMPTS,
  generateContractNumber,
  isUniqueViolation,
} from "@/lib/contract-number";
import { getLatestAcceptedQuoteInteraction } from "@/lib/portal/repositories/activity";

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

/** 공유 토큰 기본 유효기간: 생성 시점으로부터 30일. */
const DEFAULT_SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function defaultShareExpiry(): string {
  return new Date(Date.now() + DEFAULT_SHARE_TTL_MS).toISOString();
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

/* ─── Document CRUD ─────────────────────────────────────── */

export async function createContractDocument(
  input: Omit<InsertContractDocument, "contract_number">
): Promise<ContractDocument> {
  const supabase = createSupabaseAdminClient();

  // 동시 생성으로 번호가 겹치면(유니크 위반) 새 번호로 몇 번 더 시도한다.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < CONTRACT_NUMBER_INSERT_ATTEMPTS; attempt++) {
    const contractNumber = await generateContractNumber();
    const { data, error } = await supabase
      .from("contract_documents")
      .insert({ ...input, contract_number: contractNumber })
      .select()
      .single();

    if (!error) return data as ContractDocument;
    if (!isUniqueViolation(error)) throw error;
    lastError = error;
  }
  throw lastError;
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

/* ─── 목록 (계약서 탭) ───────────────────────────────────── */

const LIST_IN_CHUNK = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

type ContractListVersionRow = Pick<
  ContractDocumentVersion,
  | "id"
  | "contract_document_id"
  | "version_number"
  | "title"
  | "total_amount"
  | "valid_from"
  | "valid_until"
  | "partner_signed_at"
  | "admin_signed_at"
> & { source_quote: unknown };

function readSourceQuote(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { id: null, number: null };
  }
  const source = value as Record<string, unknown>;
  return {
    id: typeof source.quote_document_id === "string" ? source.quote_document_id : null,
    number: typeof source.quote_number === "string" ? source.quote_number : null,
  };
}

/**
 * /admin/quotes 계약서 탭이 읽는 전환 계약 목록. 견적 "계약 전환"이 쓰는 contract_documents 가 원천이다.
 * 본문(content_html)과 견적 스냅샷 전체는 싣지 않고, 원본 견적 표식(sourceQuote)만 JSON 경로로 꺼낸다.
 */
export async function listContractDocumentsForAdmin(): Promise<ContractDocumentListItem[]> {
  const supabase = createSupabaseAdminClient();

  // PostgREST 기본 행 제한(1,000)에 잘리지 않게 id 키셋으로 끝까지 읽고, 최근 변경순으로 다시 세운다.
  const documentRows = (
    await fetchAllSupabaseRows<ContractDocument>((afterId, limit) => {
      let query = supabase
        .from("contract_documents")
        .select("*")
        .order("id", { ascending: true })
        .limit(limit);
      if (afterId) query = query.gt("id", afterId);
      return query;
    })
  ).sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  if (documentRows.length === 0) return [];

  const versionRows: ContractListVersionRow[] = [];
  for (const ids of chunk(documentRows.map((document) => document.id), LIST_IN_CHUNK)) {
    const { data, error } = await supabase
      .from("contract_document_versions")
      .select(
        "id, contract_document_id, version_number, title, total_amount, valid_from, valid_until, partner_signed_at, admin_signed_at, source_quote:structured_json->sourceQuote"
      )
      .in("contract_document_id", ids)
      .order("version_number", { ascending: false });
    if (error) throw error;
    versionRows.push(...((data ?? []) as unknown as ContractListVersionRow[]));
  }

  const dealRows: Array<{ id: string; title: string | null; customer_id: string | null }> = [];
  for (const ids of chunk([...new Set(documentRows.map((document) => document.deal_id))], LIST_IN_CHUNK)) {
    const { data, error } = await supabase.from("deals").select("id, title, customer_id").in("id", ids);
    if (error) throw error;
    dealRows.push(...(data ?? []));
  }

  const customerRows: Array<{ id: string; name: string | null }> = [];
  const customerIds = [
    ...new Set(dealRows.map((deal) => deal.customer_id).filter((id): id is string => Boolean(id))),
  ];
  for (const ids of chunk(customerIds, LIST_IN_CHUNK)) {
    const { data, error } = await supabase.from("customers").select("id, name").in("id", ids);
    if (error) throw error;
    customerRows.push(...(data ?? []));
  }

  const dealById = new Map(dealRows.map((deal) => [deal.id, deal]));
  const customerNameById = new Map(customerRows.map((customer) => [customer.id, customer.name]));
  const versionsByDocument = new Map<string, ContractListVersionRow[]>();
  for (const version of versionRows) {
    const list = versionsByDocument.get(version.contract_document_id);
    if (list) list.push(version);
    else versionsByDocument.set(version.contract_document_id, [version]);
  }

  return documentRows.map((document) => {
    const versions = (versionsByDocument.get(document.id) ?? []).sort(
      (left, right) => right.version_number - left.version_number
    );
    const version =
      versions.find((candidate) => candidate.id === document.current_version_id) ?? versions[0] ?? null;
    const deal = dealById.get(document.deal_id);
    const sourceQuote = readSourceQuote(version?.source_quote);

    return {
      id: document.id,
      deal_id: document.deal_id,
      contract_number: document.contract_number,
      status: document.status,
      created_at: document.created_at,
      updated_at: document.updated_at,
      deal_title: deal?.title ?? null,
      customer_name: deal?.customer_id ? customerNameById.get(deal.customer_id) ?? null : null,
      version_number: version?.version_number ?? null,
      title: version?.title ?? null,
      total_amount: Number(version?.total_amount ?? 0),
      valid_from: version?.valid_from ?? null,
      valid_until: version?.valid_until ?? null,
      partner_signed_at: version?.partner_signed_at ?? null,
      admin_signed_at: version?.admin_signed_at ?? null,
      source_quote_document_id: sourceQuote.id,
      source_quote_number: sourceQuote.number,
    };
  });
}

/** 이 견적에서 전환된 계약(가장 최근 것). 전환한 적이 없으면 null. */
export async function findContractDocumentBySourceQuote(
  quoteDocumentId: string
): Promise<ContractDocument | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("contract_document_versions")
    .select("contract_document_id")
    .eq("structured_json->sourceQuote->>quote_document_id", quoteDocumentId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;

  const contractDocumentId = (data ?? [])[0]?.contract_document_id;
  return contractDocumentId ? getContractDocument(contractDocumentId) : null;
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
  const { error: pointerError } = await supabase
    .from("contract_documents")
    .update({ current_version_id: version.id })
    .eq("id", input.contract_document_id);
  if (pointerError) throw pointerError;

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
  const signed = data as ContractDocumentVersion;

  // 양측 서명이 모두 있으면 서명 순서와 무관하게 completed. 아니면 방금 서명한 쪽 상태.
  if (signed.partner_signed_at && signed.admin_signed_at) {
    const { data: completed, error: completeError } = await supabase
      .from("contract_document_versions")
      .update({ sign_status: "completed" })
      .eq("id", versionId)
      .select()
      .single();
    if (completeError) throw completeError;
    return completed as ContractDocumentVersion;
  }
  return signed;
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
    // 토큰이 영구 유효해지지 않도록 기본 30일 TTL을 부여한다.
    expires_at: input.expires_at ?? defaultShareExpiry(),
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

  if (quoteDocError || !quoteDoc || quoteDoc.deleted_at) {
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
  // 이후 단계가 실패하면 방금 만든 계약 문서를 지워(버전은 cascade) 반쪽짜리 계약이 남지 않게 한다.
  const rollbackContract = async () => {
    const { error: rollbackError } = await supabase
      .from("contract_documents")
      .delete()
      .eq("id", contractDocument.id);
    if (rollbackError) {
      console.error("[convertQuoteToContract] rollback failed:", rollbackError);
    }
  };

  let version: ContractDocumentVersion;
  try {
    version = await createContractDocumentVersion({
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
  } catch (versionError) {
    await rollbackContract();
    throw versionError;
  }

  // 견적 상태 업데이트 — 실패하면 계약을 되돌린다(견적이 그대로면 다시 전환할 수 있어야 한다).
  const { error: archiveError } = await supabase
    .from("quote_documents")
    .update({ status: "archived" })
    .eq("id", quoteDocId);
  if (archiveError) {
    await rollbackContract();
    throw archiveError;
  }

  return { contractDocument, version };
}
