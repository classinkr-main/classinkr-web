import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { adminCachedJson } from "@/lib/admin-api-response";
import { createReceipt, generateReceiptNumber } from "@/lib/repositories/receipts";
import { CONTRACT_NUMBER_INSERT_ATTEMPTS, isUniqueViolation } from "@/lib/contract-number";
import { ADMIN_RECEIPTS_CACHE_TAG, getCachedReceipts } from "./_cache";

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const contractId = req.nextUrl.searchParams.get("contract_id") ?? undefined;
    const partnerId = req.nextUrl.searchParams.get("partner_id") ?? undefined;
    const receipts = await getCachedReceipts(contractId, partnerId);
    return adminCachedJson({ receipts });
  } catch (e) {
    console.error("[GET /api/admin/receipts]", e);
    return NextResponse.json({ error: "Failed to fetch receipts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const body = await req.json();
    let receipt;
    if (body.receipt_number) {
      receipt = await createReceipt(body);
    } else {
      // 자동 채번은 동시 요청과 겹치면 유니크 위반이 날 수 있어, 새 번호로 몇 번 더 시도한다.
      let lastError: unknown = null;
      for (let attempt = 0; attempt < CONTRACT_NUMBER_INSERT_ATTEMPTS; attempt++) {
        body.receipt_number = await generateReceiptNumber();
        try {
          receipt = await createReceipt(body);
          break;
        } catch (createError) {
          if (!isUniqueViolation(createError)) throw createError;
          lastError = createError;
        }
      }
      if (!receipt) throw lastError;
    }
    // admin-performance-round3-2026-09-10.md §3.3 — 생성 직후 같은 화면이 목록을 다시
    // 그린다. {expire:0}으로 다음 조회가 반드시 새 영수증을 보게 한다.
    revalidateTag(ADMIN_RECEIPTS_CACHE_TAG, { expire: 0 });
    return NextResponse.json({ receipt }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/receipts]", e);
    return NextResponse.json({ error: "Failed to create receipt" }, { status: 500 });
  }
}
