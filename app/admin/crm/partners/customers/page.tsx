import { PartnerCustomersPage } from "@/components/admin/customers/PartnerCustomersPage"

export default function AdminCrmPartnerCustomersPage() {
  return <PartnerCustomersPage allowCreate={false} allowEdit title="고객사" embedded />
}
