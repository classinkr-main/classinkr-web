// REV 시트 쓰기(장부 반영 → '2. REV') 설정 — 순수 모듈.
//
// 쓰는 대상은 이 상수 한 벌뿐이다. sheets-client.ts 는 spreadsheetId 가 이 값과 env
// GOOGLE_BRANCH_DASHBOARD_SHEET_ID 둘 다와 같을 때만 쓰고, plan.ts 는 다시 읽은 탭의
// title·sheetId 가 이 값과 다르면 전부 거절한다(not_allowed).
//
// 스위치는 기본 꺼짐이다. env BRANCH_REV_SHEET_WRITE_ENABLED 가 글자 그대로 "1" 이고
// VERCEL_ENV 가 글자 그대로 "production" 일 때만 켜진다 — Preview·로컬에서는 어떤 값을
// 넣어도 원본 시트에 쓰지 않는다. 꺼져 있으면 반영은 지금과 똑같이 장부(DB)에만 남는다.

export const REV_WRITE_TARGET = {
  spreadsheetId: "1vBYyKc_pd5Kb2xyhDWG8lWMAd7fGsRcBoF_wK1wUc7Q",
  tabTitle: "2. REV",
  sheetId: 957802439,
} as const

export const REV_ROW_ID_HEADER = "Row ID"
export const REV_WRITE_READ_RANGE = "'2. REV'!A1:CZ1000"
/** 한 번에 시트로 보내는 초안 수. 넘는 몫은 400 으로 돌려주고 클라이언트가 나눠 보낸다. */
export const REV_WRITE_MAX_DRAFTS = 50
/** 시트 호출 하나의 마감. 읽기 8s + 쓰기 8s(+ 되돌리기 8s) + DB 가 라우트 maxDuration 60 안에 든다. */
export const REV_WRITE_TIMEOUT_MS = 8_000

export type SheetWriteMode = "on" | "off"

export function resolveSheetWriteMode(env: {
  BRANCH_REV_SHEET_WRITE_ENABLED?: string
  VERCEL_ENV?: string
}): SheetWriteMode {
  // 글자 그대로만 비교한다 — " 1"·"true"·"01"·"preview" 는 모두 꺼짐.
  return env.BRANCH_REV_SHEET_WRITE_ENABLED === "1" && env.VERCEL_ENV === "production" ? "on" : "off"
}

export function currentSheetWriteMode(): SheetWriteMode {
  // process.env.X 를 리터럴로 읽는다 — 변수 키로 바꾸면 번들러가 env 를 못 찾아 조용히 꺼진다.
  return resolveSheetWriteMode({
    BRANCH_REV_SHEET_WRITE_ENABLED: process.env.BRANCH_REV_SHEET_WRITE_ENABLED,
    VERCEL_ENV: process.env.VERCEL_ENV,
  })
}
