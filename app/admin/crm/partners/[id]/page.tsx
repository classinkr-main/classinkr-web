import { notFound } from "next/navigation"

import CrmSubnav from "@/components/admin/crm/CrmSubnav"
import PartnerWorkspaceDetailClient from "@/components/admin/partners/PartnerWorkspaceDetailClient"
import { getPartnerWorkspaceData } from "@/lib/partners-data"

interface AdminCrmPartnerDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function AdminCrmPartnerDetailPage({
  params,
}: AdminCrmPartnerDetailPageProps) {
  const { id } = await params
  const { workspace, source, warning } = await getPartnerWorkspaceData(id)

  if (!workspace) {
    notFound()
  }

  return (
    <>
      <div className="px-4 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <CrmSubnav active="partners" />
      </div>
      <PartnerWorkspaceDetailClient
        initialWorkspace={workspace}
        initialSource={source}
        initialWarning={warning}
      />
    </>
  )
}
