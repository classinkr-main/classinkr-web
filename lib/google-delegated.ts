/**
 * google-delegated.ts — 팀원 개인 캘린더 읽기 전용 "대행(도메인 전체 위임)" 클라이언트.
 *
 * 왜 lib/google.ts 가 아니라 별도 모듈인가:
 *  1) vitest 가 "@/lib/google" 를 통째로 스텁으로 바꿔치기한다(vitest.config.ts:17
 *     → tests/__mocks__/lib-google.ts). 거기 새 export 를 두면 모든 테스트에서
 *     undefined 가 되고, 실패가 "x is not a function"으로 엉뚱한 곳에서 터진다.
 *  2) 그 파일의 공용 GoogleAuth 는 **범위가 넓다** — spreadsheets, calendar(쓰기),
 *     gmail.send, drive.metadata.readonly 를 한 객체가 들고 있고 시트·메일·운영
 *     캘린더 쓰기가 전부 그걸 쓴다. 거기에 subject 를 붙이면 서비스 계정이 전 직원의
 *     캘린더를 **쓰고** 메일을 **보낼** 수 있게 된다. 폭발 반경이 너무 넓다.
 *
 * 선행 작업(코드로 못 한다): Workspace 최고관리자가 관리 콘솔에서
 *   보안 → 액세스 및 데이터 제어 → API 제어 → 도메인 전체 위임 관리
 * 에 서비스 계정의 **클라이언트 ID**(GOOGLE_SERVICE_ACCOUNT_EMAIL 이 아니라 숫자 21자리
 * 고유 ID)와 범위 https://www.googleapis.com/auth/calendar.readonly 를 등록해야 한다.
 *
 * 위임 전에도 배포는 안전하다 — 토큰 교환이 `unauthorized_client` 로 실패하고,
 * team-member-calendars.ts 의 네거티브 캐시가 그걸 접근 거부로 분류해 재시도를 억제한다.
 */
import "server-only"

import type { calendar_v3 } from "googleapis"

/** 읽기만. 쓰기 범위를 절대 같이 넣지 않는다 — 위임은 전사에 걸린다 */
const READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"

/** subject 당 한 번만 만든다. 명부가 9명 고정이라 크기가 묶여 있다 */
const clients = new Map<string, Promise<calendar_v3.Calendar>>()

export function hasDelegationCredentials(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
}

/** subject(팀원 이메일)를 대행해 읽는 캘린더 클라이언트 */
export function calendarAs(subject: string): Promise<calendar_v3.Calendar> {
  const hit = clients.get(subject)
  if (hit) return hit

  const made = (async () => {
    // googleapis 는 번들이 커서 top-level import 하지 않는다(lib/google.ts 와 같은 이유)
    const { google } = await import("googleapis")
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: [READONLY_SCOPE],
      clientOptions: { subject },
    })
    return google.calendar({ version: "v3", auth })
  })()

  clients.set(subject, made)
  return made
}

/** 테스트 전용 — 모듈 전역 캐시를 비운다 */
export function resetDelegatedClients(): void {
  clients.clear()
}
