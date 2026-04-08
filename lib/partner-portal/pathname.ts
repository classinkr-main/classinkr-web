export function isPartnerPortalPath(pathname: string | null | undefined) {
  if (!pathname) return false

  return pathname === "/partner" || pathname.startsWith("/partner/")
}
