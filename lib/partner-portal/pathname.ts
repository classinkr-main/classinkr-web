export function isPartnerPortalPath(pathname: string | null | undefined) {
  if (!pathname) return false

  return (
    pathname === "/partner" ||
    pathname.startsWith("/partner/workspace") ||
    pathname.startsWith("/partner/calendar") ||
    pathname.startsWith("/partner/documents")
  )
}
