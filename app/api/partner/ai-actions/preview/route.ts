import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { buildPartnerActionPreview } from "@/lib/partner-portal/ai/action-preview";
import type { PartnerAiActionPlan } from "@/lib/partner-portal/ai/types";

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
      plan?: PartnerAiActionPlan;
    };

    if (!body.plan) {
      return NextResponse.json({ error: "plan is required" }, { status: 400 });
    }

    const preview = await buildPartnerActionPreview(context, body.plan);

    return NextResponse.json({ preview });
  } catch (error) {
    console.error("[POST /api/partner/ai-actions/preview]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to preview AI action" },
      { status: 500 }
    );
  }
}
