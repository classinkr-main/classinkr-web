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
} from "@/lib/partner-portal/types";

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

/* ─── Quote → Contract Conversion ───────────────────────── */

export async function convertQuoteToContract(
  quoteDocId: string,
  dealId: string,
  createdBy: string | null
): Promise<{ contractDocument: ContractDocument; version: ContractDocumentVersion }> {
  const supabase = createSupabaseAdminClient();

  // 견적 문서의 최신 버전 가져오기
  const { data: quoteDoc } = await supabase
    .from("quote_documents")
    .select("*, quote_document_versions(*)")
    .eq("id", quoteDocId)
    .single();

  if (!quoteDoc) throw new Error("견적 문서를 찾을 수 없습니다");

  const versions = (quoteDoc as Record<string, unknown>).quote_document_versions as Array<{
    version_number: number;
    title: string;
    content_html: string | null;
    structured_json: Record<string, unknown> | null;
    total_amount: number;
    valid_until: string | null;
  }>;

  const latestVersion = versions?.sort(
    (a, b) => (b.version_number ?? 0) - (a.version_number ?? 0)
  )[0];

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
    title: latestVersion?.title ?? "계약서",
    content_html: latestVersion?.content_html ?? null,
    structured_json: latestVersion?.structured_json ?? null,
    total_amount: latestVersion?.total_amount ?? 0,
    valid_from: null,
    valid_until: latestVersion?.valid_until ?? null,
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
