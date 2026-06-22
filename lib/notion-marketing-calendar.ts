/**
 * notion-marketing-calendar.ts — 마케팅 운영 캘린더(노션) 읽기 전용 연동
 *
 * 노션이 이 캘린더의 system-of-record다. 서버에서 NOTION_API_TOKEN으로 직접 읽어
 * CalendarEvent로 매핑만 한다. Supabase 복제/백업 없음(읽기 전용).
 * 인메모리 TTL 캐시만 사용한다(서버리스 인스턴스 한정, 비영속 허용 — 영속 저장 아님).
 *
 * 이 모듈은 서버 전용이다. NOTION_API_TOKEN은 절대 클라이언트로 노출되지 않는다.
 */
import type { CalendarEvent } from "@/lib/calendar-data"

const NOTION_VERSION = "2022-06-28"
const NOTION_API = "https://api.notion.com/v1"
// 마케팅 운영 캘린더 DB. 비밀이 아니므로 코드 기본값 + env 오버라이드.
const DEFAULT_DB_ID = "2b29585602f9806bbef0e250df7df14d"
const CACHE_TTL_MS = 5 * 60_000
const MAX_ROWS = 300

interface CacheEntry {
  at: number
  data: CalendarEvent[]
}
const cache = new Map<string, CacheEntry>()

function getToken(): string | null {
  const t = process.env.NOTION_API_TOKEN?.trim()
  return t && t.length > 0 ? t : null
}

function getDbId(): string {
  const id = process.env.NOTION_MARKETING_CALENDAR_DB_ID?.trim()
  return id && id.length > 0 ? id : DEFAULT_DB_ID
}

// ─── Notion property shapes (읽는 속성만 정의) ─────────────────────────────────
interface NotionRichText {
  plain_text?: string
}
interface NotionTitleProp {
  title?: NotionRichText[]
}
interface NotionRichTextProp {
  rich_text?: NotionRichText[]
}
interface NotionStatusProp {
  status?: { name?: string } | null
}
interface NotionSelectProp {
  select?: { name?: string } | null
}
interface NotionMultiSelectProp {
  multi_select?: { name?: string }[]
}
interface NotionDateProp {
  date?: { start?: string; end?: string | null } | null
}
interface NotionPeopleProp {
  people?: { name?: string }[]
}
interface NotionRow {
  id: string
  url?: string
  created_time?: string
  last_edited_time?: string
  properties?: Record<string, unknown>
}
interface NotionQueryResponse {
  results?: NotionRow[]
  has_more?: boolean
  next_cursor?: string | null
}

interface NotionCalendarQueryOptions {
  year?: number
  month?: number
}

function joinRich(arr?: NotionRichText[]): string {
  return (arr ?? []).map((t) => t.plain_text ?? "").join("").trim()
}

function datePart(value?: string | null): string | undefined {
  if (!value) return undefined
  return value.slice(0, 10)
}

function timePart(value?: string | null): string | undefined {
  // 저장된 wall-clock(HH:mm)을 그대로 사용한다(tz 변환 X). 노션이 사용자가 입력한
  // 오프셋을 보존하므로 표시 시간이 의도한 로컬 시간과 일치한다.
  if (!value || !value.includes("T")) return undefined
  return value.slice(11, 16)
}

function monthBounds(year: number, month: number): { start: string; next: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`
  const ny = month === 12 ? year + 1 : year
  const nm = month === 12 ? 1 : month + 1
  const next = `${ny}-${String(nm).padStart(2, "0")}-01`
  return { start, next }
}

function shiftDay(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function notionQuery(body: Record<string, unknown>): Promise<NotionQueryResponse | null> {
  const token = getToken()
  if (!token) return null
  const res = await fetch(`${NOTION_API}/databases/${getDbId()}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store", // 우리 TTL 캐시가 권위를 갖도록 Next fetch 캐시 비활성
  })
  if (!res.ok) throw new Error(`notion query failed: ${res.status}`)
  return (await res.json()) as NotionQueryResponse
}

function buildFilter(opts: NotionCalendarQueryOptions): Record<string, unknown> {
  if (opts.year && opts.month) {
    // 서버 필터를 월 경계 ±1일로 넓혀, 비표준 tz 오프셋 행이 경계에서 누락되는 것을 방지한다.
    // 정확한 월 배치는 calendar-data.ts의 isEventVisibleInMonth(저장 날짜 기준)가 담당한다.
    const { start, next } = monthBounds(opts.year, opts.month)
    return {
      and: [
        { property: "Date", date: { on_or_after: shiftDay(start, -1) } },
        { property: "Date", date: { before: shiftDay(next, 1) } },
      ],
    }
  }
  return { property: "Date", date: { is_not_empty: true } }
}

async function queryRows(opts: NotionCalendarQueryOptions): Promise<NotionRow[]> {
  const rows: NotionRow[] = []
  let cursor: string | undefined
  const filter = buildFilter(opts)
  for (;;) {
    const body: Record<string, unknown> = { page_size: 100, filter }
    if (cursor) body.start_cursor = cursor
    const json = await notionQuery(body)
    if (!json) return rows
    rows.push(...(json.results ?? []))
    if (!(json.has_more && json.next_cursor)) return rows
    cursor = json.next_cursor
    if (rows.length >= MAX_ROWS) {
      // 무음 절단 방지: 상한 도달 + 잔여 행 존재를 관측 가능하게 남긴다(주로 month 미지정 all-path).
      console.warn(`[notion-marketing-calendar] hit MAX_ROWS=${MAX_ROWS}; remaining rows omitted`)
      return rows
    }
  }
}

function mapRow(row: NotionRow): CalendarEvent | null {
  const props = row.properties ?? {}
  const date = (props["Date"] as NotionDateProp | undefined)?.date
  const start = datePart(date?.start)
  if (!start) return null // 캘린더는 날짜가 있어야 표시

  const time = timePart(date?.start)
  const end = datePart(date?.end)
  const endTime = timePart(date?.end)

  const title = joinRich((props["Name"] as NotionTitleProp | undefined)?.title) || "(제목 없음)"
  const status = (props["Status"] as NotionStatusProp | undefined)?.status?.name
  const division = (props[""] as NotionSelectProp | undefined)?.select?.name // 홈페이지/마케팅/기술·IT/교육
  const contentType = (props["Content Type"] as NotionSelectProp | undefined)?.select?.name
  const quarter = (props["분기"] as NotionSelectProp | undefined)?.select?.name
  const channels = ((props["Channel"] as NotionMultiSelectProp | undefined)?.multi_select ?? [])
    .map((c) => c.name)
    .filter((n): n is string => Boolean(n))
  const memo = joinRich((props["내용"] as NotionRichTextProp | undefined)?.rich_text)
  const people = ((props["Person in Charge"] as NotionPeopleProp | undefined)?.people ?? [])
    .map((p) => p.name)
    .filter((n): n is string => Boolean(n))

  const description =
    [
      status ? `[${status}]` : null,
      division ?? null,
      contentType ?? null,
      channels.length > 0 ? channels.join("/") : null,
      quarter ?? null,
      memo || null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" · ") || undefined

  const nowIso = new Date().toISOString()
  return {
    id: `notion_${row.id}`,
    title,
    date: start,
    endDate: end && end !== start ? end : undefined,
    time,
    endTime,
    type: "other",
    description,
    assignees: people,
    allDay: !time && !endTime,
    source: "notion",
    sourceLabel: "마케팅(노션)",
    readonly: true,
    href: typeof row.url === "string" ? row.url : undefined,
    createdAt: row.created_time ?? nowIso,
    updatedAt: row.last_edited_time ?? nowIso,
  }
}

/**
 * 마케팅 운영 캘린더(노션) 이벤트를 CalendarEvent[]로 반환한다.
 * - 토큰 미설정/네트워크 오류 시 빈 배열(다른 캘린더 소스를 깨지 않음).
 * - 5분 TTL 인메모리 캐시. 오류 시 직전 캐시가 있으면 그걸 제공(graceful).
 */
export async function getNotionMarketingCalendarEvents(
  opts: NotionCalendarQueryOptions = {}
): Promise<CalendarEvent[]> {
  if (!getToken()) return []
  const key = opts.year && opts.month ? `${opts.year}-${String(opts.month).padStart(2, "0")}` : "all"
  const cached = cache.get(key)
  const nowMs = Date.now()
  if (cached && nowMs - cached.at < CACHE_TTL_MS) return cached.data
  try {
    const rows = await queryRows(opts)
    const events = rows
      .map(mapRow)
      .filter((event): event is CalendarEvent => event !== null)
    cache.set(key, { at: nowMs, data: events })
    return events
  } catch {
    // 오류 시 직전 캐시가 있으면 stale로 제공, 없으면 빈 배열
    if (cached) return cached.data
    return []
  }
}
