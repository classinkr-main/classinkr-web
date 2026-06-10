import { NextRequest, NextResponse } from "next/server";

import { requireVerifiedAdminContext, verifyAdmin } from "@/lib/admin-auth";
import { logActivity } from "@/lib/portal/repositories/activity";
import { getCustomer, getCustomerDetail, updateCustomer } from "@/lib/portal/repositories/customers";
import { getLegacyCustomerDetail } from "@/lib/portal/repositories/legacy";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(req: NextRequest, { params }: RouteContext) {
  const err = await verifyAdmin(req);
  if (err) return err;

  try {
    const { id } = await params;
    let customer = await getCustomerDetail(id, {
      includeCrmCoverage: true,
      crmCoverageDepth: "detail",
    });

    if (!customer) {
      customer = await getLegacyCustomerDetail(id);
    }

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({ customer });
  } catch (error) {
    console.warn("[GET /api/admin/customers/[id]] falling back to legacy model", error);
    try {
      const { id } = await params;
      const legacyCustomer = await getLegacyCustomerDetail(id);
      if (legacyCustomer) {
        return NextResponse.json({ customer: legacyCustomer, mode: "legacy" });
      }
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    } catch (legacyError) {
      console.error("[GET /api/admin/customers/[id]]", legacyError);
      return NextResponse.json(
        { error: "Failed to fetch customer detail" },
        { status: 500 }
      );
    }
  }
}

const CUSTOMER_PATCH_FIELDS = [
  "name",
  "contact_name",
  "email",
  "phone",
  "address",
  "business_number",
  "campus_name",
  "region_label",
  "notes",
] as const;

function pickCustomerPatch(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const body = value as Record<string, unknown>;
  const patch: Record<string, string | null> = {};

  for (const field of CUSTOMER_PATCH_FIELDS) {
    if (!(field in body)) continue;
    const nextValue = body[field];
    if (nextValue == null) {
      patch[field] = null;
    } else if (typeof nextValue === "string") {
      const trimmed = nextValue.trim();
      patch[field] = trimmed || null;
    }
  }

  return patch;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const admin = await requireVerifiedAdminContext(req);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const existing = await getCustomer(id);
    if (!existing) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const patch = pickCustomerPatch(body);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid customer fields." }, { status: 400 });
    }

    const customer = await updateCustomer(id, patch);
    await logActivity({
      partner_account_id: existing.partner_account_id,
      customer_id: id,
      deal_id: null,
      actor_user_id: admin.userId ?? null,
      actor_role: admin.role,
      action_type: "update",
      target_type: "customer",
      target_id: id,
      summary: "고객사 메모/정보 수정",
      before_json: existing as unknown as Record<string, unknown>,
      after_json: customer as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ customer });
  } catch (error) {
    console.error("[PATCH /api/admin/customers/[id]]", error);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}
