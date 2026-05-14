import type { VerifiedAdminContext } from "@/lib/admin-auth"
import type { PartnerAccountContext } from "@/lib/portal/context"
import type { NotificationRecipientTarget } from "@/lib/notifications/types"

function normalizeAdminRole(role: string) {
  const normalized = role.trim().toUpperCase()

  if (normalized === "ADMIN") return "ADMIN"
  if (normalized === "BRANCH") return "ADMIN"
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN"
  if (normalized === "EDITOR") return "EDITOR"
  if (normalized === "VIEWER") return "VIEWER"
  if (normalized === "PARTNER") return "PARTNER"

  return "ADMIN"
}

export function getAdminRecipientSelectors(
  admin: VerifiedAdminContext
): NotificationRecipientTarget[] {
  const role = normalizeAdminRole(admin.role)
  const selectors: NotificationRecipientTarget[] = [
    { recipientType: "admin_role", recipientId: role },
  ]

  if (role === "SUPER_ADMIN") {
    selectors.push({ recipientType: "admin_role", recipientId: "ADMIN" })
  }

  if (admin.userId) {
    selectors.push({
      recipientType: "admin_user",
      recipientId: admin.userId,
    })
  }

  return selectors
}

export function getPartnerRecipientSelectors(
  context: PartnerAccountContext
): NotificationRecipientTarget[] {
  const selectors: NotificationRecipientTarget[] = [
    {
      recipientType: "partner_user",
      recipientId: context.userId,
    },
  ]

  const accountId =
    context.partnerAccountId ?? context.legacyPartnerId ?? context.customerId

  if (accountId) {
    selectors.push({
      recipientType: "partner_account",
      recipientId: accountId,
    })
  }

  return selectors
}
