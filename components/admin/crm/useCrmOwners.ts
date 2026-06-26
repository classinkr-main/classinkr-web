"use client"

import { useEffect, useMemo, useState } from "react"

import { adminFetchJsonCached } from "@/lib/admin-client"

export interface CrmOwnerOption {
  userId: string | null
  displayName: string
  teamRoleLabel: string
  branchName: string | null
  ownerKey: string
  ownerAliases: string[]
  neoOwnerId: string | null
}

interface CrmOwnersResponse {
  generatedAt: string
  health: {
    ok: boolean
    message: string | null
  }
  owners: CrmOwnerOption[]
  summary: {
    total: number
    branchDirectors: number
    managers: number
  }
}

export interface CountedOwnerOption {
  ownerName: string
  label: string
  count: number
  teamRoleLabel: string | null
  branchName: string | null
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

export function buildOwnerSelectOptions(
  dataOwners: Array<{ ownerName: string; count: number }> | undefined,
  crmOwners: CrmOwnerOption[]
): CountedOwnerOption[] {
  const counts = new Map((dataOwners ?? []).map((owner) => [normalize(owner.ownerName), owner.count]))
  const used = new Set<string>()
  const options: CountedOwnerOption[] = []

  for (const owner of crmOwners) {
    const keys = [...new Set([owner.ownerKey, owner.displayName, ...owner.ownerAliases, owner.neoOwnerId].map(normalize).filter(Boolean))]
    const count = keys.reduce((sum, key) => sum + (counts.get(key) ?? 0), 0)
    for (const key of keys) used.add(key)
    options.push({
      ownerName: owner.ownerKey,
      label: owner.displayName,
      count,
      teamRoleLabel: owner.teamRoleLabel,
      branchName: owner.branchName,
    })
  }

  for (const owner of dataOwners ?? []) {
    const key = normalize(owner.ownerName)
    if (!key || used.has(key)) continue
    options.push({
      ownerName: owner.ownerName,
      label: owner.ownerName,
      count: owner.count,
      teamRoleLabel: null,
      branchName: null,
    })
  }

  return options
}

export function useCrmOwners() {
  const [data, setData] = useState<CrmOwnersResponse | null>(null)

  useEffect(() => {
    let mounted = true
    adminFetchJsonCached<CrmOwnersResponse>("/api/admin/crm/owners", undefined, {
      cacheKey: "/api/admin/crm/owners",
      ttlMs: 120_000,
      staleWhileRevalidateMs: 5 * 60_000,
    })
      .then((response) => {
        if (mounted) setData(response)
      })
      .catch(() => {
        if (mounted) setData(null)
      })

    return () => {
      mounted = false
    }
  }, [])

  return useMemo(
    () => ({
      owners: data?.owners ?? [],
      health: data?.health ?? null,
      summary: data?.summary ?? null,
    }),
    [data]
  )
}
