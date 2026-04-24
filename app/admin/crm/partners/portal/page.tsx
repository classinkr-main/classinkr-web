import CrmSubnav from "@/components/admin/crm/CrmSubnav"
import { PartnerPortalHome } from "@/components/partner-portal/home/PartnerPortalHome"

export default function AdminCrmPartnerPortalPage() {
  return (
    <>
      <div className="px-4 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <CrmSubnav active="partnerPortal" />
      </div>
      <PartnerPortalHome
        overviewEndpoint="/api/portal/overview?shape=partner"
        allowCreate={false}
        linkTargets={{
          calendar: "/admin/calendar",
          documents: "/admin/quotes",
          workspace: "/admin/crm/partners",
        }}
      />
    </>
  )
}
