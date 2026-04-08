export function isAdminAuthBypassEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_SKIP_ADMIN_AUTH === "true"
  )
}
