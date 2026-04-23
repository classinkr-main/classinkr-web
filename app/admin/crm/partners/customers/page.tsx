import { PartnerCustomersPage } from "@/app/partner/(portal)/customers/page"
import CrmSubnav from "@/components/admin/crm/CrmSubnav"

export default function AdminCrmPartnerCustomersPage() {
  return (
    <>
      <div className="px-4 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <CrmSubnav active="partnerCustomers" />
      </div>
      <PartnerCustomersPage allowCreate={false} />
    </>
  )
}
