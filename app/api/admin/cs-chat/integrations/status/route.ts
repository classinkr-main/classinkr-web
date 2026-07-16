import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { INTERNAL_CS_BRIDGE_VERSION } from "@/lib/internal-cs-chat/bridge"
import { getInternalCsGeminiModels } from "@/lib/internal-cs-chat/gemini"
import { INTERNAL_CS_ASSET_MAX_BYTES } from "@/lib/storage/internal-cs-assets"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const inboundConfigured = Boolean(
    process.env.INTERNAL_CS_INGEST_SECRET?.trim() &&
    (process.env.INTERNAL_CS_INGEST_SECRET?.trim().length ?? 0) >= 32
  )
  const outboundConfigured = Boolean(
    process.env.INTERNAL_CS_OUTBOUND_WEBHOOK_URL?.trim() &&
    process.env.INTERNAL_CS_OUTBOUND_WEBHOOK_SECRET?.trim() &&
    (process.env.INTERNAL_CS_OUTBOUND_WEBHOOK_SECRET?.trim().length ?? 0) >= 32
  )

  return NextResponse.json({
    bridge: {
      configured: outboundConfigured,
      status: outboundConfigured ? "ready" : "unconfigured",
      label: "AI / MCP 브리지",
      message: outboundConfigured
        ? "고정된 내부 AI 분석 채널로 전송할 수 있습니다."
        : "outbound webhook 환경 설정이 필요합니다.",
    },
    version: INTERNAL_CS_BRIDGE_VERSION,
    inbound: {
      configured: inboundConfigured,
      endpoint: "/api/webhook/internal-cs",
      authentication: "hmac-sha256-raw-body",
      transports: ["webhook", "mcp"],
    },
    outbound: {
      configured: outboundConfigured,
      endpoint: "/api/admin/cs-chat/conversations/{conversationId}/dispatch",
      targetPolicy: "server_env_only",
    },
    images: {
      mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      maxBytes: INTERNAL_CS_ASSET_MAX_BYTES,
      remoteUrlsAccepted: false,
    },
    models: getInternalCsGeminiModels(),
    policy: {
      purpose: "internal_cs_only",
      customerDeliveryAllowed: false,
      csOwnerReviewRequired: true,
    },
  })
}
