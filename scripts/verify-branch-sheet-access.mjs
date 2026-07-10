// 매출시트(브랜치 대시보드) 접근·구조 검증 — 시트 이관 시 1회 실행하는 운영 도구.
//
// 사용: node scripts/verify-branch-sheet-access.mjs   (프로젝트 루트에서)
//
// env 로딩: .env.local을 자체 관대 파서로 읽는다 — node --env-file은 이 파일의
// 서비스계정 JSON 붙여넣기 잔재("client_id": ... 줄)에서 이후 변수를 못 읽는다(실측).
//
// 검증 항목:
//  1) GOOGLE_SERVICE_ACCOUNT_EMAIL 자격으로 GOOGLE_BRANCH_DASHBOARD_SHEET_ID 접근(403이면
//     시트 공유에 이 계정을 추가하거나, 접근 가능한 계정의 키로 env를 교체해야 한다)
//  2) 파서가 기대하는 탭 존재: '1. DSH' / '2. REV' / '3. KPI' ('4. 지역 매출'은 선택)
//  3) '2. REV' 헤더 행 표본을 읽어 resolveRevColumns가 인식할 헤더 텍스트가 있는지 확인
//
// 전부 read-only. DB에는 아무것도 쓰지 않는다 — 실제 반영은 어드민 UI의 동기화 버튼
// (또는 /api/admin/branch/sync) + 장부 Source 바의 "DB 재동기화"로.

import { google } from "googleapis"
import { existsSync, readFileSync } from "node:fs"

function loadDotenvLoose(path) {
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line)
    if (!m) continue // JSON 잔재 등 비정형 줄은 무시
    if (!(m[1] in process.env)) process.env[m[1]] = m[2]
  }
}
loadDotenvLoose(".env.local")

const SHEET_ID = process.env.GOOGLE_BRANCH_DASHBOARD_SHEET_ID
const EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
const KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/^"|"$/g, "").replace(/\\n/g, "\n")

if (!SHEET_ID || !EMAIL || !KEY) {
  console.error("Missing env: GOOGLE_BRANCH_DASHBOARD_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY")
  process.exit(2)
}

const REQUIRED_TABS = ["1. DSH", "2. REV", "3. KPI"]
const OPTIONAL_TABS = ["4. 지역 매출"]
// lib/branch/parsers/rev.ts resolveRevColumns가 찾는 헤더 텍스트(대소문자 무시 부분일치)
const REV_HEADER_HINTS = ["account", "team", "manager", "status", "type", "product"]

const auth = new google.auth.JWT({ email: EMAIL, key: KEY, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] })
const sheets = google.sheets({ version: "v4", auth })

try {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: "properties.title,sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))",
  })
  const tabs = (meta.data.sheets ?? []).map((s) => ({
    gid: s.properties.sheetId,
    title: s.properties.title,
    rows: s.properties.gridProperties?.rowCount,
    cols: s.properties.gridProperties?.columnCount,
  }))
  console.log(`[ok] 접근 성공: "${meta.data.properties.title}" (계정 ${EMAIL})`)
  console.log(`[tabs] ${tabs.map((t) => `${t.title}(gid=${t.gid}, ${t.rows}x${t.cols})`).join(" · ")}`)

  let fail = false
  for (const need of REQUIRED_TABS) {
    const hit = tabs.find((t) => t.title === need)
    if (!hit) {
      fail = true
      console.error(`[FAIL] 필수 탭 없음: '${need}' — 파서 RANGE 상수(lib/branch/parsers/*.ts)가 이 이름을 하드코딩한다. 시트 탭명을 맞추거나 RANGE를 갱신할 것.`)
    } else {
      console.log(`[ok] 필수 탭 '${need}' 존재`)
    }
  }
  for (const opt of OPTIONAL_TABS) {
    if (!tabs.find((t) => t.title === opt)) console.log(`[warn] 선택 탭 '${opt}' 없음 (지역 매출 파서만 영향)`)
  }

  if (tabs.find((t) => t.title === "2. REV")) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "'2. REV'!A1:CF6" })
    const rows = res.data.values ?? []
    const flat = rows.flat().map((v) => String(v).toLowerCase())
    const missing = REV_HEADER_HINTS.filter((h) => !flat.some((cell) => cell.includes(h)))
    if (missing.length > 0) {
      console.log(`[warn] REV 헤더 표본(상위 6행)에서 다음 힌트 미검출: ${missing.join(", ")} — 헤더 행이 더 아래거나 명칭이 바뀌었으면 resolveRevColumns 폴백(실측 위치)을 확인할 것`)
    } else {
      console.log("[ok] REV 헤더 힌트 전부 검출 — resolveRevColumns 호환")
    }
  }

  if (fail) process.exit(1)
  console.log("[done] 접근·구조 검증 통과. 다음 단계: 어드민에서 동기화 → 장부 Source 바 'DB 재동기화'")
} catch (e) {
  const status = e?.response?.status ?? e?.code ?? null
  if (status === 403) {
    console.error(`[FAIL 403] ${EMAIL} 계정이 이 시트에 접근할 수 없습니다.`)
    console.error("  해결 A(권장·간단): 구글시트 공유에 위 계정을 뷰어로 추가")
    console.error("  해결 B: 접근 가능한 서비스 계정의 JSON 키로 GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY 교체(로컬 .env.local + Vercel 프로젝트 env 둘 다)")
  } else {
    console.error(`[FAIL ${status ?? "?"}] ${String(e?.message).slice(0, 300)}`)
  }
  process.exit(1)
}
