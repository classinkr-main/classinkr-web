// 공개 크롬(.site) 밖 경로 판정. AppChrome·토스트가 함께 쓴다.
export function isInternalPath(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/receipt")
  )
}
