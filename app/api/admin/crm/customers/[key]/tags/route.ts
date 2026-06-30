import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { parseUnifiedCustomerKey } from "@/lib/repositories/crm-customer-360"
import { addCustomerTag, getCustomerTags, removeCustomerTag } from "@/lib/repositories/crm-customer-tags"

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { key } = await params
  const parsed = parseUnifiedCustomerKey(key)
  if (!parsed) return NextResponse.json({ error: "Invalid customer key" }, { status: 400 })

  try {
    return NextResponse.json({ tags: await getCustomerTags(parsed.targetType, parsed.entityId) })
  } catch (error) {
    console.error(`[GET /api/admin/crm/customers/${key}/tags]`, error)
    return NextResponse.json({ error: "Failed to load tags" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { key } = await params
  const parsed = parseUnifiedCustomerKey(key)
  if (!parsed) return NextResponse.json({ error: "Invalid customer key" }, { status: 400 })

  const body = (await req.json().catch(() => null)) as { tag?: unknown } | null
  const tag = typeof body?.tag === "string" ? body.tag : ""
  if (!tag.trim()) return NextResponse.json({ error: "태그를 입력하세요." }, { status: 400 })

  try {
    const tags = await addCustomerTag(parsed.targetType, parsed.entityId, tag, admin.name)
    return NextResponse.json({ tags })
  } catch (error) {
    console.error(`[POST /api/admin/crm/customers/${key}/tags]`, error)
    return NextResponse.json({ error: "태그 추가에 실패했습니다." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { key } = await params
  const parsed = parseUnifiedCustomerKey(key)
  if (!parsed) return NextResponse.json({ error: "Invalid customer key" }, { status: 400 })

  const tag = new URL(req.url).searchParams.get("tag") ?? ""
  if (!tag.trim()) return NextResponse.json({ error: "삭제할 태그가 필요합니다." }, { status: 400 })

  try {
    const tags = await removeCustomerTag(parsed.targetType, parsed.entityId, tag)
    return NextResponse.json({ tags })
  } catch (error) {
    console.error(`[DELETE /api/admin/crm/customers/${key}/tags]`, error)
    return NextResponse.json({ error: "태그 삭제에 실패했습니다." }, { status: 500 })
  }
}
