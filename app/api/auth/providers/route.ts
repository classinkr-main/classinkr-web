import { NextResponse } from "next/server"

import { resolveProviderAvailability } from "@/lib/auth/providers"

export const dynamic = "force-dynamic"

export async function GET() {
  const availability = resolveProviderAvailability(process.env)
  return NextResponse.json(availability, {
    headers: { "Cache-Control": "no-store" },
  })
}
