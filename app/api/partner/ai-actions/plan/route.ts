import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { buildPartnerActionPlan } from "@/lib/partner-portal/ai/action-plan";
import type { PartnerAiActionContext } from "@/lib/partner-portal/ai/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const context = await resolvePartnerAccountContext(req);
  if (!context?.partnerAccountId) {
    return NextResponse.json(
      { error: "Partner V2 account is required" },
      { status: 409 }
    );
  }

  try {
    const body = (await req.json()) as {
      raw_input?: string;
      channel?: "text" | "voice";
      context?: Partial<PartnerAiActionContext>;
    };

    if (!body.raw_input?.trim()) {
      return NextResponse.json({ error: "raw_input is required" }, { status: 400 });
    }

    const plan = await buildPartnerActionPlan(context, {
      raw_input: body.raw_input.trim(),
      channel: body.channel ?? "text",
      context: {
        screen: body.context?.screen ?? "home",
        selected_date: body.context?.selected_date ?? null,
        selected_customer_id: body.context?.selected_customer_id ?? null,
        selected_deal_id: body.context?.selected_deal_id ?? null,
        timezone: body.context?.timezone ?? "Asia/Seoul",
      },
    });

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("[POST /api/partner/ai-actions/plan]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to plan AI action" },
      { status: 500 }
    );
  }
}
