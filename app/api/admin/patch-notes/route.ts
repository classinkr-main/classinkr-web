import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllPatchNotes, createPatchNote } from "@/lib/patch-notes-data"

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  return NextResponse.json(getAllPatchNotes())
}

export async function POST(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  const body = await req.json()
  if (!body.version || !body.title || !body.date) {
    return NextResponse.json({ error: "version, title, date는 필수입니다." }, { status: 400 })
  }
  const note = createPatchNote({
    version: body.version,
    title: body.title,
    date: body.date,
    status: body.status ?? "draft",
    changes: body.changes ?? [],
  })
  return NextResponse.json(note, { status: 201 })
}
