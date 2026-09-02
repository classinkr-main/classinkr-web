/**
 * Google API 공통 인증 모듈
 * 서비스 계정(Service Account)으로 Sheets / Calendar / Gmail 접근
 *
 * 사용하려면 .env.local에 아래 값이 필요합니다:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY
 *   GOOGLE_SHEET_ID        (선택 — Sheets 사용 시)
 *   GOOGLE_CALENDAR_ID     (선택 — Calendar 사용 시)
 *
 * `googleapis`는 패키지가 커서 top-level import 시 이 모듈을 물고 있는 모든
 * 서버 함수 번들(콜드 스타트)에 포함된다. 그래서 런타임에는 절대 top-level
 * import하지 않는다 — 아래 `sheets`/`calendar`/`gmail`/`drive`는 실제 메서드가
 * 처음 "호출"되는 시점에만 `import("googleapis")`를 실행하는 지연 프록시다.
 * 호출부는 예전과 동일하게 `sheets.spreadsheets.values.get(...)`처럼 쓰면 된다
 * (시그니처 무변경 — 값은 여전히 값처럼 보이고 동작한다).
 */

import type { Auth, calendar_v3, drive_v3, gmail_v1, sheets_v4 } from "googleapis"

type GoogleNamespace = typeof import("googleapis")["google"]

/** async factory의 결과를 1회만 계산해 캐시하는 래퍼. */
function once<T>(factory: () => Promise<T>): () => Promise<T> {
    let cached: Promise<T> | null = null
    return () => {
        if (!cached) cached = factory()
        return cached
    }
}

const loadGoogleNamespace = once(async (): Promise<GoogleNamespace> => {
    const { google } = await import("googleapis")
    return google
})

/* ── 인증 클라이언트 (인스턴스당 1회만 생성) ─────────────────── */
const loadAuth = once(async (): Promise<Auth.GoogleAuth> => {
    const google = await loadGoogleNamespace()
    const scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/gmail.send",
        // Read-only file metadata — used to surface "sheet has changed since
        // last sync" badges in the branch dashboard.
        "https://www.googleapis.com/auth/drive.metadata.readonly",
    ]

    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        },
        scopes,
    })
})

/**
 * `load()`가 최종적으로 반환하는 실제 클라이언트를 향한 지연 프록시를 만든다.
 * `client.a.b.c(args)` 형태의 "프로퍼티 체이닝 후 메서드 호출" 패턴만 지원하며,
 * 체인의 마지막 메서드가 실제로 호출되는 시점에만 `load()`를 실행한다.
 * `load()`는 항상 `once()`로 감싸 전달하므로 실제 로드(동적 import 포함)는
 * 인스턴스당 1회뿐이다. 반환값은 googleapis 메서드가 원래 돌려주던 Promise
 * 그대로이므로 호출부의 `await x.y.z(...)` 코드는 수정할 필요가 없다.
 */
function lazyApiClient<T extends object>(load: () => Promise<T>): T {
    const cache = new Map<string, unknown>()

    function build(path: readonly PropertyKey[]): unknown {
        const key = path.map(String).join(".")
        const cached = cache.get(key)
        if (cached) return cached

        const proxy = new Proxy(function lazyApiClientTarget() {}, {
            get(_target, prop) {
                if (prop === "then" || typeof prop === "symbol") return undefined
                return build([...path, prop])
            },
            apply(_target, _thisArg, args) {
                if (path.length === 0) {
                    throw new TypeError("lazyApiClient: 클라이언트 자체는 호출할 수 없습니다.")
                }
                return load().then((client) => {
                    let parent = client as unknown as Record<PropertyKey, unknown>
                    for (let i = 0; i < path.length - 1; i++) {
                        parent = parent[path[i]] as Record<PropertyKey, unknown>
                    }
                    const methodName = path[path.length - 1]
                    const method = parent[methodName]
                    if (typeof method !== "function") {
                        throw new TypeError(`lazyApiClient: "${key}"는 로드된 클라이언트에 없는 메서드입니다.`)
                    }
                    return (method as (...a: unknown[]) => unknown).apply(parent, args)
                })
            },
        })
        cache.set(key, proxy)
        return proxy
    }

    return build([]) as T
}

/* ── API 클라이언트 (지연 프록시 — 첫 실제 메서드 호출 시에만 googleapis를 동적 import) ─ */
export const sheets: sheets_v4.Sheets = lazyApiClient(once(async () => {
    const [google, auth] = await Promise.all([loadGoogleNamespace(), loadAuth()])
    return google.sheets({ version: "v4", auth })
}))

export const calendar: calendar_v3.Calendar = lazyApiClient(once(async () => {
    const [google, auth] = await Promise.all([loadGoogleNamespace(), loadAuth()])
    return google.calendar({ version: "v3", auth })
}))

export const gmail: gmail_v1.Gmail = lazyApiClient(once(async () => {
    const [google, auth] = await Promise.all([loadGoogleNamespace(), loadAuth()])
    return google.gmail({ version: "v1", auth })
}))

export const drive: drive_v3.Drive = lazyApiClient(once(async () => {
    const [google, auth] = await Promise.all([loadGoogleNamespace(), loadAuth()])
    return google.drive({ version: "v3", auth })
}))

/* ── 헬퍼: Sheets에 행 추가 ──────────────────────────────────── */
export async function appendSheetRow(
    values: (string | number | null)[],
    range = "Sheet1!A:Z",
    sheetId = process.env.GOOGLE_SHEET_ID,
) {
    if (!sheetId) throw new Error("GOOGLE_SHEET_ID가 설정되지 않았습니다.")

    return sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [values] },
    })
}

/* ── 헬퍼: Calendar 이벤트 생성 ───────────────────────────────── */
export async function createCalendarEvent(params: {
    title: string
    description?: string
    startISO: string   // "2026-04-15T10:00:00+09:00"
    endISO: string
    attendees?: string[]
    calendarId?: string
}) {
    const calId = params.calendarId ?? process.env.GOOGLE_CALENDAR_ID ?? "primary"

    return calendar.events.insert({
        calendarId: calId,
        requestBody: {
            summary: params.title,
            description: params.description,
            start: { dateTime: params.startISO, timeZone: "Asia/Seoul" },
            end: { dateTime: params.endISO, timeZone: "Asia/Seoul" },
            attendees: params.attendees?.map((email) => ({ email })),
        },
    })
}

/* ── 헬퍼: Gmail 발송 ─────────────────────────────────────────── */
export async function sendGmail(params: {
    to: string
    subject: string
    html: string
    from?: string   // 도메인 위임 설정된 주소만 가능
}) {
    const from = params.from ?? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ""
    const raw = Buffer.from(
        [
            `From: ${from}`,
            `To: ${params.to}`,
            `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString("base64")}?=`,
            "MIME-Version: 1.0",
            'Content-Type: text/html; charset="UTF-8"',
            "Content-Transfer-Encoding: base64",
            "",
            Buffer.from(params.html).toString("base64"),
        ].join("\r\n"),
    )
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")

    return gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
    })
}
