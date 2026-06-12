import { PortalHome } from "@/components/portal/home/PortalHome"

export default function AdminCrmPartnerPortalPage() {
  return (
    <PortalHome
      overviewEndpoint="/api/portal/overview?shape=partner"
      allowCreate={false}
      adminView
      embedded
      linkTargets={{
        calendar: "/admin/calendar",
        documents: "/admin/quotes",
        workspace: "/admin/crm/deals/kpi",
      }}
    />
  )
}
