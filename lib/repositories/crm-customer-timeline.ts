import "server-only"

import { getNeoCrmCustomerDetail } from "@/lib/admin-crm-customers-neo"
import { getCompassActivityPage, getCompassLeadsByPhoneKeys } from "@/lib/compass/bridge"
import { compassLeadUrl, normalizePhoneKey } from "@/lib/compass/normalize"
import { pickRepresentativeCompassRow } from "@/lib/compass/overlay"
import { toCompassTimelineEntries } from "@/lib/crm/compass-timeline"
import type { Customer360Compass, ParsedCustomerKey } from "./crm-customer-360"
import { listCrmCustomerEvents, type ListCrmCustomerEventsResult } from "./crm-events"
import { getLeadById } from "./leads"

export interface CustomerTimelinePage {
  activity: ListCrmCustomerEventsResult
  compass: Customer360Compass
}

export async function getCrmCustomerTimeline(
  customer: ParsedCustomerKey,
  options: { crmOffset: number; compassOffset: number; before?: string },
): Promise<CustomerTimelinePage | null> {
  let phone: string | null
  if (customer.source === "lead") {
    const lead = await getLeadById(customer.entityId)
    if (!lead) return null
    phone = lead.phone ?? null
  } else {
    const detail = await getNeoCrmCustomerDetail(customer.entityId)
    if (!detail.ok) throw new Error("고객 원천을 확인하지 못했습니다.")
    if (!detail.account) return null
    phone = detail.account.phone
  }

  const loadCompass = async (): Promise<Customer360Compass> => {
    const empty: Customer360Compass = { leadIds: [], href: null, entries: [], down: false }
    const key = normalizePhoneKey(phone)
    if (!key) return empty
    const leads = await getCompassLeadsByPhoneKeys([key])
    if (leads.down || leads.truncated) return { ...empty, down: true }
    const ids = leads.rows.map((row) => row.id)
    if (!ids.length) return empty
    const activities = await getCompassActivityPage(ids, { offset: options.compassOffset, limit: 50, before: options.before })
    // 대표 행 — 360 첫 창(loadCompassActivity)과 같은 규칙(최근성 → id). 정렬 없는 ids[0] 은 같은 전화의 다른 리드를 열 수 있다.
    const representative = pickRepresentativeCompassRow(leads.rows)
    return {
      leadIds: ids,
      href: compassLeadUrl(representative?.id ?? ids[0]),
      entries: toCompassTimelineEntries(activities.rows),
      down: activities.down,
      pagination: {
        total: activities.total ?? 0,
        offset: options.compassOffset,
        nextOffset: activities.truncated ? options.compassOffset + activities.rows.length : null,
        hasMore: activities.truncated === true,
      },
    }
  }
  const [activity, compass] = await Promise.all([
    listCrmCustomerEvents({ targetType: customer.targetType, targetId: customer.entityId, limit: 50, offset: options.crmOffset, to: options.before }),
    loadCompass(),
  ])
  return { activity, compass }
}
