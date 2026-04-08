import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getPublicResolvedSettings, updateSettings } from "@/lib/repositories/settings"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  return NextResponse.json(await getPublicResolvedSettings())
}

export async function PATCH(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  const patch = await req.json()
  const next = await updateSettings(patch)
  return NextResponse.json({
    ...next,
    googleSheetWebhookUrl: "",
    leadWebhookUrl: "",
    channelTalkWebhookUrl: "",
    emailWebhookUrl: "",
    wecomOpsWebhookUrl: "",
    wecomCriticalWebhookUrl: "",
    kakaoAlimtalkWebhookUrl: "",
  })
}
