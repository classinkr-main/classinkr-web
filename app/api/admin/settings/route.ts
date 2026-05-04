import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getPublicResolvedSettings, updateSettings } from "@/lib/repositories/settings"
import { validateWebhookTarget } from "@/lib/server/post-json"

const WEBHOOK_SETTING_KEYS = [
  "googleSheetWebhookUrl",
  "leadWebhookUrl",
  "channelTalkWebhookUrl",
  "emailWebhookUrl",
  "wecomOpsWebhookUrl",
  "wecomCriticalWebhookUrl",
  "kakaoAlimtalkWebhookUrl",
] as const

async function validateWebhookSettings(patch: Record<string, unknown>) {
  for (const key of WEBHOOK_SETTING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue

    const value = patch[key]
    if (value == null || value === "") continue
    if (typeof value !== "string") return `${key} must be a string.`

    const validationError = await validateWebhookTarget(value)
    if (validationError) return `${key}: ${validationError}`
  }

  return null
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  return NextResponse.json(await getPublicResolvedSettings())
}

export async function PATCH(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  const patch = (await req.json()) as Record<string, unknown>
  const validationError = await validateWebhookSettings(patch)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const next = await updateSettings(patch as Parameters<typeof updateSettings>[0])
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
