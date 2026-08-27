import { cookies } from "next/headers"
import { NextRequest } from "next/server"
import { getVerifiedAdminContext, type VerifiedAdminContext } from "@/lib/admin-auth"

/**
 * 서버 컴포넌트(페이지)에서 API 라우트와 동일한 어드민 검증을 수행한다.
 * admin-auth 검증 경로는 req.cookies(get/getAll)만 읽으므로, RSC cookie store를
 * NextRequest에 옮겨 담아 같은 함수를 태운다 — 검증 로직을 복제하지 않는 것이
 * 이 모듈의 존재 이유다. 페이지 프리페치는 이 컨텍스트가 null이면 데이터를
 * 내려보내지 말고 클라이언트 페치(API가 401로 차단)로 폴백해야 한다.
 */
export async function getVerifiedAdminContextForPage(): Promise<VerifiedAdminContext | null> {
  const store = await cookies()
  const req = new NextRequest("http://internal.admin.page/")
  for (const cookie of store.getAll()) {
    req.cookies.set(cookie.name, cookie.value)
  }
  return getVerifiedAdminContext(req)
}
