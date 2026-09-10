// 외부 CRM(XiaoshouYi) 접속 공통 계층 — 설정·토큰·HTTP 를 한곳에서 소유한다.
//
// 왜 따로 뺐나: 읽기(xiaoshouyi-sync.ts)와 쓰기(xiaoshouyi-write.ts)가 각자 readEnv/
// getXiaoshouyiConfig/getAccessToken 을 복사해 갖고 있었다. 값은 같았지만 강제하는 것이
// 없어서 한쪽만 고치면 조용히 갈라진다. 더 나빴던 건 재시도·타임아웃이 읽기에만 있었다는 점이다 —
// 쓰기는 맨 fetch 라 일시적인 5xx 한 번에 시도 횟수(최대 3회)를 하나 까먹었다.

/** 값이 비어 있으면 null — 빈 문자열 환경변수를 "설정됨"으로 오인하지 않는다. */
export function readEnv(name: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : null
}

export interface XiaoshouyiConfig {
  baseUrl: string
  accessToken?: string
  clientId?: string
  clientSecret?: string
  username?: string
  password?: string
}

/**
 * 자격 증명이 하나도 없으면 null. 호출자는 이걸 "장애"가 아니라 "미설정"으로 다뤄야 한다.
 *
 * ⚠️ baseUrl 이 없으면 동기화가 HTTP 200 + skipped 로 조용히 끝난다(2026-09-02 ~ 프로덕션 실측:
 * XIAOSHOUYI_BASE_URL 부재로 6일간 크론이 초록불인 채 무동작). 미설정은 정상 경로가 맞지만,
 * 운영에서는 admin-integrations/status 의 configured 플래그로 반드시 눈에 보이게 둘 것.
 */
export function getXiaoshouyiConfig(): XiaoshouyiConfig | null {
  const baseUrl =
    readEnv("XIAOSHOUYI_BASE_URL") ??
    readEnv("XIAOSHOUYI_API_BASE_URL") ??
    readEnv("XIAOSHOUYI_API_URL") ??
    readEnv("COMPANY_CRM_API_URL") ??
    readEnv("CRM_API_URL")

  if (!baseUrl) return null

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    accessToken: readEnv("XIAOSHOUYI_ACCESS_TOKEN") ?? readEnv("XIAOSHOUYI_SERVICE_ACCESS_TOKEN") ?? undefined,
    clientId: readEnv("XIAOSHOUYI_CLIENT_ID") ?? undefined,
    clientSecret: readEnv("XIAOSHOUYI_CLIENT_SECRET") ?? undefined,
    username: readEnv("XIAOSHOUYI_USERNAME") ?? readEnv("XIAOSHOUYI_SERVICE_USERNAME") ?? undefined,
    password: readEnv("XIAOSHOUYI_PASSWORD") ?? readEnv("XIAOSHOUYI_SERVICE_PASSWORD") ?? undefined,
  }
}

const FETCH_TIMEOUT_MS = 30_000
const FETCH_RETRY_DELAYS_MS = [200, 800, 2000]

/**
 * 외부 CRM API 호출 공통 래퍼 — 타임아웃 + 일시 오류(네트워크/429/5xx)에 백오프 재시도.
 * 4xx 는 자격/쿼리 문제라 재시도하지 않는다.
 */
export async function fetchXiaoshouyi(url: string | URL, init: RequestInit = {}): Promise<Response> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_DELAYS_MS[attempt - 1]))
    }

    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Xiaoshouyi transient HTTP ${response.status}`)
        continue
      }
      return response
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Xiaoshouyi request failed: ${String(lastError)}`)
}

export async function getAccessToken(config: XiaoshouyiConfig) {
  if (config.accessToken) return config.accessToken
  if (!config.clientId || !config.clientSecret || !config.username || !config.password) return null

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    username: config.username,
    password: config.password,
  })

  const response = await fetchXiaoshouyi(`${config.baseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!response.ok) {
    throw new Error(`Xiaoshouyi token request failed: ${response.status}`)
  }

  const payload = (await response.json()) as { access_token?: unknown }
  return typeof payload.access_token === "string" ? payload.access_token : null
}

/** 객체 API 키는 경로에 그대로 들어가므로 형태를 강제한다. */
export function assertObjectApiKey(value: string) {
  const trimmed = value.trim()
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:__c)?$/.test(trimmed)) {
    throw new Error("Invalid Xiaoshouyi object API key")
  }
  return trimmed
}

/** 외부 레코드 id 도 경로에 들어간다. 숫자형 문자열만 허용한다(정밀도 때문에 문자열로 다룬다). */
export function assertExternalRecordId(value: string) {
  const trimmed = value.trim()
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) {
    throw new Error("Invalid Xiaoshouyi record id")
  }
  return trimmed
}

/**
 * 단건 레코드 조회 — `GET /rest/data/v2.0/xobjects/{object}/{id}`.
 *
 * SOQL(`/rest/data/v2/query`)로는 못 얻는 값들이 여기서만 나온다. 특히 `groupId`(활동 기록의
 * 피드 그룹)와 `entityType-label` 이 그렇다. 활동 되밀기가 이 함수를 필요로 한다.
 *
 * 비즈니스 오류가 HTTP 200 으로 오는 API 라, 본문의 `code` 를 반드시 확인한다.
 */
export async function fetchXiaoshouyiRecord(input: {
  config: XiaoshouyiConfig
  token: string
  objectApiKey: string
  recordId: string
}): Promise<Record<string, unknown>> {
  const objectApiKey = assertObjectApiKey(input.objectApiKey)
  const recordId = assertExternalRecordId(input.recordId)

  const response = await fetchXiaoshouyi(
    `${input.config.baseUrl}/rest/data/v2.0/xobjects/${objectApiKey}/${encodeURIComponent(recordId)}`,
    {
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
    }
  )

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Xiaoshouyi record fetch failed (${response.status}): ${text.slice(0, 200)}`)
  }

  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Xiaoshouyi record fetch returned non-JSON: ${text.slice(0, 200)}`)
  }

  return assertXiaoshouyiOk(parsed, `record fetch ${objectApiKey}/${recordId}`)
}

/**
 * HTTP 200 인데 본문에 실패가 담겨 오는 API 다(예: `{"code":5000047,"msg":"Field data type mismatch"}`).
 * 응답 껍데기만 보고 성공으로 판정하면 실패가 조용히 성공으로 기록된다 — 반드시 code 를 본다.
 *
 * 성공 응답의 데이터 위치가 `data` / 최상위 둘 다 관측되므로 둘 다 받아준다.
 */
export function assertXiaoshouyiOk(payload: unknown, context: string): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    throw new Error(`Xiaoshouyi ${context}: unexpected response shape`)
  }

  const envelope = payload as { code?: unknown; msg?: unknown; data?: unknown }
  if (envelope.code !== undefined && String(envelope.code) !== "200") {
    const message = typeof envelope.msg === "string" ? envelope.msg : ""
    throw new Error(`Xiaoshouyi ${context}: API ${String(envelope.code)}${message ? ` ${message}` : ""}`)
  }

  const data = envelope.data
  if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>
  return envelope as Record<string, unknown>
}

/**
 * 활동 기록을 붙일 대상 레코드의 피드 그룹 id.
 *
 * ⚠️ groupId 는 활동 유형별 상수가 아니라 **대상 레코드마다 다른 값**이다. 틀린 값으로도 생성은
 * 성공하지만 남의 피드에 꽂혀 화면에서 사라진다 — 즉 조용한 실패다. 못 읽으면 null 을 돌려주고,
 * 호출자는 활동을 만들지 않아야 한다(activity-record-writeback 의 missing_group).
 */
export async function fetchXiaoshouyiGroupId(input: {
  config: XiaoshouyiConfig
  token: string
  objectApiKey: string
  recordId: string
}): Promise<string | null> {
  const record = await fetchXiaoshouyiRecord(input)
  const raw = record.groupId
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim()
  // 큰 id 가 숫자로 직렬화돼 오는 경우가 있다. 정밀도 손실을 피하려 문자열로만 다룬다.
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw)
  return null
}
