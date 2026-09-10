import type { LeadRecord } from "@/lib/repositories/leads"

export interface LeadAssignmentProfile {
  total: number
  confirmed: number
  unconfirmed: number
  ageBands: {
    under24h: number
    from24To48h: number
    from2To7d: number
    from7To30d: number
    over30d: number
    unknown: number
  }
  duplicateClusters: number
  duplicateRows: number
}

function phoneKey(value: string | undefined) {
  const digits = value?.replace(/\D/g, "") ?? ""
  return digits.length >= 8 ? `phone:${digits}` : null
}

function emailKey(value: string | undefined) {
  const email = value?.trim().toLowerCase() ?? ""
  return email ? `email:${email}` : null
}

/** 선택한 리드를 실제 배정하기 전에 보여줄 PII 없는 구성·중복 요약. */
export function buildLeadAssignmentProfile(
  leads: LeadRecord[],
  nowMs = Date.now()
): LeadAssignmentProfile {
  const profile: LeadAssignmentProfile = {
    total: leads.length,
    confirmed: 0,
    unconfirmed: 0,
    ageBands: {
      under24h: 0,
      from24To48h: 0,
      from2To7d: 0,
      from7To30d: 0,
      over30d: 0,
      unknown: 0,
    },
    duplicateClusters: 0,
    duplicateRows: 0,
  }

  const parents = leads.map((_, index) => index)
  const find = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]]
      index = parents[index]
    }
    return index
  }
  const union = (left: number, right: number) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }
  const firstByContact = new Map<string, number>()

  leads.forEach((lead, index) => {
    if (lead.confirmed_at) profile.confirmed += 1
    else profile.unconfirmed += 1

    const timestamp = new Date(lead.timestamp).getTime()
    if (!Number.isFinite(timestamp)) profile.ageBands.unknown += 1
    else {
      const ageHours = Math.max(0, (nowMs - timestamp) / 3_600_000)
      if (ageHours < 24) profile.ageBands.under24h += 1
      else if (ageHours < 48) profile.ageBands.from24To48h += 1
      else if (ageHours < 24 * 7) profile.ageBands.from2To7d += 1
      else if (ageHours < 24 * 30) profile.ageBands.from7To30d += 1
      else profile.ageBands.over30d += 1
    }

    for (const key of [phoneKey(lead.phone), emailKey(lead.email)].filter(
      (value): value is string => Boolean(value)
    )) {
      const first = firstByContact.get(key)
      if (first === undefined) firstByContact.set(key, index)
      else union(first, index)
    }
  })

  const componentSizes = new Map<number, number>()
  leads.forEach((_, index) => {
    const root = find(index)
    componentSizes.set(root, (componentSizes.get(root) ?? 0) + 1)
  })
  for (const size of componentSizes.values()) {
    if (size <= 1) continue
    profile.duplicateClusters += 1
    profile.duplicateRows += size
  }

  return profile
}

export function formatLeadAssignmentProfile(profile: LeadAssignmentProfile) {
  const age = profile.ageBands
  const ageParts = [
    age.from24To48h > 0 ? `24–48h ${age.from24To48h}` : null,
    age.from2To7d > 0 ? `2–7일 ${age.from2To7d}` : null,
    age.from7To30d > 0 ? `7–30일 ${age.from7To30d}` : null,
    age.over30d > 0 ? `30일+ ${age.over30d}` : null,
    age.under24h > 0 ? `24h 미만 ${age.under24h}` : null,
    age.unknown > 0 ? `시각 미상 ${age.unknown}` : null,
  ].filter(Boolean)

  return [
    `확인 ${profile.confirmed} · 미확인 ${profile.unconfirmed}`,
    ageParts.join(" · "),
    profile.duplicateClusters > 0
      ? `연락처 중복 ${profile.duplicateClusters}묶음 · ${profile.duplicateRows}행`
      : "연락처 중복 없음",
  ]
    .filter(Boolean)
    .join(" · ")
}
