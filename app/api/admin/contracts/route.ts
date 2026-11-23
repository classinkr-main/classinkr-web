import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { adminCachedJson } from "@/lib/admin-api-response";
import { listContracts, createContract, generateContractNumber } from "@/lib/repositories/contracts";
import { listContractDocumentsForAdmin } from "@/lib/portal/repositories/contract-documents";
import type { ContractDocumentListItem } from "@/lib/portal/types";

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const partnerId = req.nextUrl.searchParams.get("partner_id") ?? undefined;
    const contracts = await listContracts(partnerId);

    // 견적에서 전환한 계약(contract_documents)도 계약서 탭 목록에 함께 싣는다.
    // 딜·고객 기준이라 partner_id 가 없다 — V1 파트너로 좁힌 조회에는 넣지 않는다.
    // 이쪽 조회가 실패해도 직접 작성 계약 목록은 그대로 주고, 실패 사실을 응답에 남긴다.
    let convertedContracts: ContractDocumentListItem[] = [];
    let convertedContractsError: string | null = null;
    if (!partnerId) {
      try {
        convertedContracts = await listContractDocumentsForAdmin();
      } catch (convertedError) {
        console.error("[GET /api/admin/contracts] converted contracts", convertedError);
        convertedContractsError = "견적에서 전환한 계약을 불러오지 못했습니다.";
      }
    }

    return adminCachedJson({ contracts, convertedContracts, convertedContractsError });
  } catch (e) {
    console.error("[GET /api/admin/contracts]", e);
    return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const body = await req.json();
    if (!body.contract_number) {
      body.contract_number = await generateContractNumber();
    }
    const contract = await createContract(body);
    return NextResponse.json({ contract }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/contracts]", e);
    return NextResponse.json({ error: "Failed to create contract" }, { status: 500 });
  }
}
