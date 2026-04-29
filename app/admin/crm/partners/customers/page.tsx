import { PartnerCustomersPage } from "@/app/partner/(portal)/customers/page"

export default function AdminCrmPartnerCustomersPage() {
  return <PartnerCustomersPage allowCreate={false} allowEdit title="고객사" embedded />
}
