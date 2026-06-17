import { revalidatePath } from "next/cache"
import { type NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { deleteLeadMagnet, updateLeadMagnet } from "@/lib/repositories/lead-magnets"

interface RouteContext {
  params: Promise<{ slug: string }>
}

function revalidateLeadMagnetSurfaces(previousSlug: string, nextSlug?: string) {
  revalidatePath("/resources")
  revalidatePath("/admin/lead-magnets")
  revalidatePath("/blog")
  revalidatePath(`/resources/${previousSlug}`)
  if (nextSlug && nextSlug !== previousSlug) revalidatePath(`/resources/${nextSlug}`)
}

function decodeSlug(raw: string) {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const { slug: rawSlug } = await params
    const slug = decodeSlug(rawSlug)
    const body = await req.json()
    const leadMagnet = await updateLeadMagnet(slug, body)

    if (!leadMagnet) {
      return NextResponse.json({ error: "Lead magnet not found" }, { status: 404 })
    }

    revalidateLeadMagnetSurfaces(slug, leadMagnet.slug)
    return NextResponse.json({ leadMagnet })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update lead magnet" },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const { slug: rawSlug } = await params
    const slug = decodeSlug(rawSlug)
    const ok = await deleteLeadMagnet(slug)

    if (!ok) {
      return NextResponse.json({ error: "Lead magnet not found" }, { status: 404 })
    }

    revalidateLeadMagnetSurfaces(slug)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete lead magnet" }, { status: 500 })
  }
}
