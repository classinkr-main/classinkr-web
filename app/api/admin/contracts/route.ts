import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { adminCachedJson } from "@/lib/admin-api-response";
import { listContracts, createContract, generateContractNumber } from "@/lib/repositories/contracts";

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const partnerId = req.nextUrl.searchParams.get("partner_id") ?? undefined;
    const contracts = await listContracts(partnerId);
    return adminCachedJson({ contracts });
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
