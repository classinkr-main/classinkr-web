/** Pages that can contain customer identifiers, credentials, or private tokens. */
export function isSensitiveTrackingPath(pathname: string): boolean {
  return ["/admin", "/checkout", "/receipt", "/share", "/unsubscribe", "/account", "/auth", "/login", "/signup", "/forgot-password"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
