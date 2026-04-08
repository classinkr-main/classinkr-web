import { NextRequest, NextResponse } from "next/server"

import {
  hasField,
  readOptionalString,
  readRequestBody,
  readRequiredEmail,
  readRequiredString,
  toErrorResponse,
  PartnerApiValidationError,
} from "@/app/api/admin/partners/_validation"
import { verifyAdmin } from "@/lib/admin-auth"
import * as partnersData from "@/lib/partners-data"
import type { PartnerContactInput, PartnerDataSource } from "@/lib/partners-types"

type PartnerContactMutationResult = {
  workspace: unknown | null
  source: PartnerDataSource
  warning?: string
}

const upsertPartnerContact = (partnersData as {
  upsertPartnerContact?: (
    partnerId: string,
    input: PartnerContactInput
  ) => Promise<PartnerContactMutationResult>
}).upsertPartnerContact

function readOptionalEmail(body: Record<string, unknown>, key: string, label: string) {
  if (!hasField(body, key) || body[key] == null) return undefined
  if (typeof body[key] !== "string") {
    throw new PartnerApiValidationError(`${label}은(는) 문자열이어야 합니다.`)
  }

  const value = body[key].trim()
  if (!value) return undefined

  return readRequiredEmail({ [key]: value }, key, label)
}

function readOptionalBoolean(body: Record<string, unknown>, key: string) {
  if (!hasField(body, key) || body[key] == null) return undefined
  if (typeof body[key] === "boolean") return body[key]
  if (typeof body[key] === "string") {
    const normalized = body[key].trim().toLowerCase()
    if (normalized === "true") return true
    if (normalized === "false") return false
  }

  throw new PartnerApiValidationError(`${key} 값이 올바르지 않습니다.`)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    const { workspace, source, warning } = await partnersData.getPartnerWorkspaceData(id)

    if (!workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ items: workspace.contacts, source, warning })
  } catch {
    return NextResponse.json({ error: "Failed to read contacts" }, { status: 500 })
  }
}

async function handleUpsert(req: NextRequest, id: string) {
  const body = await readRequestBody(req)

  if (!upsertPartnerContact) {
    return NextResponse.json(
      { error: "Contact write support is not wired yet." },
      { status: 501 }
    )
  }

  const result = await upsertPartnerContact(id, {
    id: readOptionalString(body, "id", "연락처 ID"),
    name: readRequiredString(body, "name", "연락처명"),
    role: readOptionalString(body, "role", "직책", { emptyAsUndefined: false }),
    email: readOptionalEmail(body, "email", "이메일"),
    phone: readOptionalString(body, "phone", "전화번호", { emptyAsUndefined: false }),
    isPrimary: readOptionalBoolean(body, "isPrimary") ?? false,
  })

  if (!result.workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(result)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    return await handleUpsert(req, id)
  } catch (error) {
    return toErrorResponse(error, "Failed to save contact")
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    return await handleUpsert(req, id)
  } catch (error) {
    return toErrorResponse(error, "Failed to update contact")
  }
}
