import { PartnerPortalHome } from "@/components/portal/home/PartnerPortalHome"

export default function AdminCrmPartnerPortalPage() {
  return (
    <PartnerPortalHome
      overviewEndpoint="/api/portal/overview?shape=partner"
      allowCreate={false}
      adminView
      embedded
      linkTargets={{
        calendar: "/admin/calendar",
        documents: "/admin/quotes",
        workspace: "/admin/crm/partners",
      }}
    />
  )
}
