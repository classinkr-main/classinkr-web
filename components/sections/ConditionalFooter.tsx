"use client";

import { usePathname } from "next/navigation";
import { isPartnerPortalPath } from "@/lib/partner-portal/pathname";
import { Footer } from "./Footer";

export function ConditionalFooter() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin") || pathname.startsWith("/checkout") || isPartnerPortalPath(pathname)) {
    return null;
  }

  return <Footer />;
}
