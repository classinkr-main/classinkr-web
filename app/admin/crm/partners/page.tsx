import CrmSubnav from "@/components/admin/crm/CrmSubnav"
import PartnerWorkspacePageClient from "@/components/admin/partners/PartnerWorkspacePageClient"
import { listPartnerWorkspacesData } from "@/lib/partners-data"

export default async function AdminCrmPartnersPage() {
  const { workspaces, source, warning } = await listPartnerWorkspacesData()

  return (
    <>
      <div className="px-4 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <CrmSubnav active="partners" />
      </div>
      <PartnerWorkspacePageClient
        initialWorkspaces={workspaces}
        initialSource={source}
        initialWarning={warning}
      />
    </>
  )
}
