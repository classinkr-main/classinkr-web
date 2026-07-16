import "server-only"

export function isLocalJsonWriteAllowed() {
  return process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1"
}

export function assertLocalJsonWriteAllowed(storeName: string) {
  if (isLocalJsonWriteAllowed()) return
  throw new Error(
    `[${storeName}] 운영 환경에서는 로컬 JSON 파일에 저장할 수 없습니다. Supabase 저장소를 먼저 구성해 주세요.`
  )
}
