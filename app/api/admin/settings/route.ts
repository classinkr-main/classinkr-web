import { NextRequest, NextResponse } from "next/server"
import { STAFF_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import {
  getPublicResolvedSettings,
  getWebhookConfigMeta,
  updateSettings,
} from "@/lib/repositories/settings"
import { validateWebhookTarget } from "@/lib/server/post-json"
import type { SiteSettings } from "@/lib/site-settings-types"
import { WEBHOOK_SETTING_KEYS } from "@/lib/webhook-settings"

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

function maskWebhookValues(settings: SiteSettings) {
  const masked = { ...settings }
  for (const key of WEBHOOK_SETTING_KEYS) masked[key] = ""
  return masked
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, STAFF_ADMIN_API_ROLES)
  if (err) return err

  // 값은 마스킹하되 "설정됨 / env·DB / 켜짐"은 함께 내려보낸다. 이게 없으면
  // 새로고침 후 전부 빈 칸이라 뭐가 살아 있는지 화면에서 알 수 없다.
  const [settings, webhookMeta] = await Promise.all([
    getPublicResolvedSettings(),
    getWebhookConfigMeta(),
  ])

  return NextResponse.json({ ...settings, webhookMeta })
}

export async function PATCH(req: NextRequest) {
  const err = await verifyAdmin(req, STAFF_ADMIN_API_ROLES)
  if (err) return err
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Settings must be an object." }, { status: 400 })
  }
  const patch = body as Record<string, unknown>
  const validationError = await validateWebhookSettings(patch)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  // webhookMeta 는 읽기 전용 요약이라 되돌려 받아도 저장하지 않는다.
  delete patch.webhookMeta

  const next = await updateSettings(patch as Parameters<typeof updateSettings>[0])
  const webhookMeta = await getWebhookConfigMeta()

  return NextResponse.json({ ...maskWebhookValues(next), webhookMeta })
}
