import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { deleteReceipt } from "@/lib/repositories/receipts";
import { ADMIN_RECEIPTS_CACHE_TAG } from "../_cache";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    await deleteReceipt(id);
    // admin-performance-round3-2026-09-10.md §3.3 — 삭제 직후 같은 화면이 목록을 다시
    // 그린다. {expire:0}으로 다음 조회가 반드시 삭제 반영된 목록을 보게 한다.
    revalidateTag(ADMIN_RECEIPTS_CACHE_TAG, { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/admin/receipts/[id]]", e);
    return NextResponse.json({ error: "Failed to delete receipt" }, { status: 500 });
  }
}
