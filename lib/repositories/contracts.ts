"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Contract, ContractInsert, ContractUpdate,
  ContractVersion, ContractVersionInsert,
} from "@/lib/supabase/database.types";

/* ─── 채번 ─────────────────────────────────────────────── */

export async function generateContractNumber(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("contracts")
    .select("*", { count: "exact", head: true })
    .like("contract_number", `C-${year}-%`);
  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `C-${year}-${seq}`;
}

/* ─── Contracts CRUD ─────────────────────────────────────── */

export async function listContracts(partnerId?: string): Promise<Contract[]> {
  const supabase = createSupabaseAdminClient();
  let q = supabase.from("contracts").select("*").order("created_at", { ascending: false });
  if (partnerId) q = q.eq("partner_id", partnerId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getContract(id: string): Promise<Contract | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

export async function getContractByToken(token: string): Promise<Contract | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("sign_token", token)
    .single();
  if (error) return null;
  return data;
}

export async function createContract(input: ContractInsert): Promise<Contract> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("contracts")
    .insert(input)
    .select()
    .single();
  if (error) throw error;

  // 최초 버전 스냅샷
  if (input.content_html) {
    await saveContractVersion(data.id, {
      contract_id: data.id,
      version_number: 1,
      content_html: input.content_html,
      changed_by: input.created_by ?? null,
      change_reason: "최초 작성",
    });
  }

  return data;
}

export async function updateContract(
  id: string,
  input: ContractUpdate,
  changeReason?: string
): Promise<Contract> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("contracts")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  // content 변경 시 버전 스냅샷
  if (input.content_html) {
    const { count } = await supabase
      .from("contract_versions")
      .select("*", { count: "exact", head: true })
      .eq("contract_id", id);
    await saveContractVersion(id, {
      contract_id: id,
      version_number: (count ?? 0) + 1,
      content_html: input.content_html,
      changed_by: null,
      change_reason: changeReason ?? null,
    });
  }

  return data;
}

export async function deleteContract(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("contracts").delete().eq("id", id);
  if (error) throw error;
}

/* ─── 서명 ───────────────────────────────────────────────── */

export async function applyPartnerSignature(
  contractId: string,
  signatureUrl: string,
  ip: string
): Promise<Contract> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("contracts")
    .update({
      status: "partner_signed",
      partner_signed_at: new Date().toISOString(),
      partner_signature_url: signatureUrl,
      partner_signed_ip: ip,
    })
    .eq("id", contractId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function applyAdminSignature(
  contractId: string,
  signatureUrl: string,
  adminUserId: string
): Promise<Contract> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("contracts")
    .update({
      status: "completed",
      admin_signed_at: new Date().toISOString(),
      admin_signature_url: signatureUrl,
      admin_signed_by: adminUserId,
    })
    .eq("id", contractId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ─── 버전 이력 ──────────────────────────────────────────── */

async function saveContractVersion(
  contractId: string,
  input: ContractVersionInsert
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase.from("contract_versions").insert(input);
}

export async function listContractVersions(contractId: string): Promise<ContractVersion[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("contract_versions")
    .select("*")
    .eq("contract_id", contractId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
