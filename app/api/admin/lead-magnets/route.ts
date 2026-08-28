import { revalidatePath } from "next/cache"
import { type NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import {
  createLeadMagnet,
  getLeadMagnetStoreSnapshot,
  isLeadMagnetStoreUnavailableError,
} from "@/lib/repositories/lead-magnets"

function revalidateLeadMagnetSurfaces(slug?: string) {
  revalidatePath("/resources")
  revalidatePath("/admin/lead-magnets")
  revalidatePath("/blog")
  if (slug) revalidatePath(`/resources/${slug}`)
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    return adminCachedJson(await getLeadMagnetStoreSnapshot())
  } catch {
    return NextResponse.json({ error: "Failed to read lead magnets" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const leadMagnet = await createLeadMagnet(body)
    revalidateLeadMagnetSurfaces(leadMagnet.slug)
    return NextResponse.json({ leadMagnet }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create lead magnet" },
      { status: isLeadMagnetStoreUnavailableError(error) ? 503 : 500 }
    )
  }
}
