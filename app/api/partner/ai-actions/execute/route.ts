import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { executePartnerAction } from "@/lib/partner-portal/ai/action-execute";
import type { PartnerAiIntent } from "@/lib/partner-portal/ai/types";

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
      request_id?: string;
      intent?: PartnerAiIntent;
      final_payload?: Record<string, unknown>;
      confirmation_token?: string;
    };

    if (
      !body.request_id ||
      !body.intent ||
      !body.final_payload ||
      !body.confirmation_token
    ) {
      return NextResponse.json(
        {
          error:
            "request_id, intent, final_payload, confirmation_token are required",
        },
        { status: 400 }
      );
    }

    const result = await executePartnerAction(context, {
      request_id: body.request_id,
      intent: body.intent,
      final_payload: body.final_payload,
      confirmation_token: body.confirmation_token,
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("[POST /api/partner/ai-actions/execute]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to execute AI action" },
      { status: 500 }
    );
  }
}
