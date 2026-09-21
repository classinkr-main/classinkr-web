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

/** 대행 없이 읽는 클라이언트 — 개인별 공유 방식의 폴백 */
let sharedClient: Promise<calendar_v3.Calendar> | null = null

/** 위임이 거부된 뒤 이 시각까지는 대행을 아예 시도하지 않는다(실패한 토큰 교환 비용을 안 낸다) */
let delegationBlockedUntil = 0
const DELEGATION_BLOCK_MS = 60 * 60_000

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

/**
 * 대행 없이 읽는 클라이언트(읽기 범위만). 개인별 공유 방식이 이걸 쓴다.
 *
 * lib/google.ts 의 공용 클라이언트를 쓰지 않는 이유는 같다 — 그쪽은 쓰기·Gmail 범위를
 * 함께 들고 있다. 여기서는 읽기만 필요하다.
 */
export function calendarShared(): Promise<calendar_v3.Calendar> {
  if (sharedClient) return sharedClient
  sharedClient = (async () => {
    const { google } = await import("googleapis")
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: [READONLY_SCOPE],
    })
    return google.calendar({ version: "v3", auth })
  })()
  return sharedClient
}

/**
 * 위임 미부여로 읽히는 실패인가. Calendar API 가 아니라 **OAuth 토큰 교환**에서 터진다 —
 * 실측(2026-09-21) 숫자 code 는 401 이고 메시지가 `unauthorized_client: …` 다.
 * 403·404 도 400 도 아니라서 숫자로는 못 잡는다.
 */
export function isDelegationDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  return /unauthorized_client|access_denied|invalid_grant/i.test(message)
}

/** 위임이 거부됐다 — 한동안 대행을 건너뛰고 공유 방식으로만 읽는다 */
export function noteDelegationDenied(nowMs = Date.now()): void {
  delegationBlockedUntil = nowMs + DELEGATION_BLOCK_MS
}

/**
 * 이 팀원을 읽을 클라이언트.
 *
 * 위임이 걸려 있으면 대행으로 읽고, 거부된 적이 있으면 한 시간 동안은 공유 방식으로 읽는다.
 * **둘 다 살려 두는 게 핵심이다** — 조직이 위임을 못 열어 주면 팀원 개인 공유가 유일한 길인데,
 * 대행만 쓰면 토큰 교환에서 막혀 공유를 해줘도 호출이 안 나간다.
 * 차단은 시간이 지나면 저절로 풀린다(하드 비활성 금지 — 위임이 켜지면 재배포 없이 회복).
 */
export function calendarForMember(subject: string, nowMs = Date.now()): Promise<calendar_v3.Calendar> {
  if (delegationBlockedUntil > nowMs) return calendarShared()
  return calendarAs(subject)
}

/** 테스트 전용 — 모듈 전역 캐시를 비운다 */
export function resetDelegatedClients(): void {
  clients.clear()
  sharedClient = null
  delegationBlockedUntil = 0
}
