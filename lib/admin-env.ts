export function isAdminAuthBypassEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_SKIP_ADMIN_AUTH === "true" &&
    !process.env.VERCEL // Vercel 배포 환경에서는 절대 우회 불가
  )
}
