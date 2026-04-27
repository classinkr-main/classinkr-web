import { PartnerPortalHome } from "@/components/partner-portal/home/PartnerPortalHome"

export default function AdminCrmPartnerPortalPage() {
  return (
    <PartnerPortalHome
      overviewEndpoint="/api/portal/overview?shape=partner"
      allowCreate={false}
      embedded
      linkTargets={{
        calendar: "/admin/calendar",
        documents: "/admin/quotes",
        workspace: "/admin/crm/partners",
      }}
    />
  )
}
