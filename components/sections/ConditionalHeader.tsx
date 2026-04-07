"use client";

import { usePathname } from "next/navigation";
import { isPartnerPortalPath } from "@/lib/partner-portal/pathname";
import { Header } from "./Header";

export function ConditionalHeader() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin") || isPartnerPortalPath(pathname)) {
    return null;
  }

  return <Header />;
}
