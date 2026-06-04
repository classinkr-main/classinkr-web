import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  getPartnerAccountFilter,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import {
  resolvePartnerAccountId,
  getActorInfo,
} from "@/lib/portal/portal-authorize";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  listCustomerListItems,
  listAllCustomerListItems,
  createCustomer,
} from "@/lib/portal/repositories/customers";
import { logActivity } from "@/lib/portal/repositories/activity";

const ADMIN_QUOTE_PARTNER_ACCOUNT_NAME = "Classin Direct Sales";

async function getOrCreateAdminQuotePartnerAccountId(createdBy?: string | null) {
  const supabase = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("partner_accounts")
    .select("id")
    .eq("name", ADMIN_QUOTE_PARTNER_ACCOUNT_NAME)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id as string;

  const { data: created, error: createError } = await supabase
    .from("partner_accounts")
    .insert({
      name: ADMIN_QUOTE_PARTNER_ACCOUNT_NAME,
      owner_name: "Classin Korea",
      status: "active",
      notes: "Auto-created for admin quick quotes without an existing customer.",
      created_by: createdBy ?? null,
    })
    .select("id")
    .single();

  if (createError) throw createError;
  return created.id as string;
}

async function resolveWritablePartnerAccountId(
  ctx: Awaited<ReturnType<typeof requirePortalContext>>,
  bodyPartnerAccountId?: unknown
) {
  if (isErrorResponse(ctx)) return null;

  const normalizedBodyPartnerAccountId =
    typeof bodyPartnerAccountId === "string" && bodyPartnerAccountId.trim()
      ? bodyPartnerAccountId.trim()
      : undefined;
  const partnerAccountId = resolvePartnerAccountId(
    ctx,
    normalizedBodyPartnerAccountId
  );

  if (partnerAccountId) return partnerAccountId;
  if (ctx.type === "admin") {
    return getOrCreateAdminQuotePartnerAccountId(ctx.userId ?? null);
  }

  return null;
}

export async function GET(req: NextRequest) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  try {
    const filter = getPartnerAccountFilter(ctx);
    const customers = filter
      ? await listCustomerListItems(filter)
      : await listAllCustomerListItems();

    return NextResponse.json({ customers });
  } catch (err) {
    console.error("[portal/customers] GET error:", err);
    return NextResponse.json(
      { error: "고객 목록 조회 실패" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "고객사 이름을 입력해 주세요." },
        { status: 400 }
      );
    }

    const partnerAccountId = await resolveWritablePartnerAccountId(
      ctx,
      body.partner_account_id
    );

    if (!partnerAccountId) {
      return NextResponse.json(
        { error: "partner_account_id 필수" },
        { status: 400 }
      );
    }

    const customer = await createCustomer({
      partner_account_id: partnerAccountId,
      name,
      contact_name: body.contact_name ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      address: body.address ?? null,
      business_number: body.business_number ?? null,
      campus_name: body.campus_name ?? null,
      region_label: body.region_label ?? null,
      notes: body.notes ?? null,
      created_by: ctx.userId ?? null,
    });

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: partnerAccountId,
      customer_id: customer.id,
      deal_id: null,
      ...actor,
      action_type: "create",
      target_type: "customer",
      target_id: customer.id,
      summary: `고객 "${customer.name}" 생성`,
      before_json: null,
      after_json: customer as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (err) {
    console.error("[portal/customers] POST error:", err);
    return NextResponse.json(
      { error: "고객 생성 실패" },
      { status: 500 }
    );
  }
}
