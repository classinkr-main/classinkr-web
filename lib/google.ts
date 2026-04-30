/**
 * Google API 공통 인증 모듈
 * 서비스 계정(Service Account)으로 Sheets / Calendar / Gmail 접근
 *
 * 사용하려면 .env.local에 아래 값이 필요합니다:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY
 *   GOOGLE_SHEET_ID        (선택 — Sheets 사용 시)
 *   GOOGLE_CALENDAR_ID     (선택 — Calendar 사용 시)
 */

import { google } from "googleapis"

/* ── 인증 클라이언트 ─────────────────────────────────────────── */
function createAuth(extraScopes: string[] = []) {
    const baseScopes = [
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
        scopes: [...baseScopes, ...extraScopes],
    })
}

const auth = createAuth()

/* ── API 클라이언트 ──────────────────────────────────────────── */
export const sheets = google.sheets({ version: "v4", auth })
export const calendar = google.calendar({ version: "v3", auth })
export const gmail = google.gmail({ version: "v1", auth })
export const drive = google.drive({ version: "v3", auth })

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
