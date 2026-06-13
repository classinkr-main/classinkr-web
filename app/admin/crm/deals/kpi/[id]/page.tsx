import { notFound } from "next/navigation"

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
    <PartnerWorkspaceDetailClient
      initialWorkspace={workspace}
      initialSource={source}
      initialWarning={warning}
    />
  )
}
