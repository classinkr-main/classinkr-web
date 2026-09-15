// Meta 리드애즈 leadgen → submitLeadCapture payload 빌더(순수).
//
// app/api/meta/webhook/route.ts 에 있던 함수를 글자 그대로 옮겼다(설계 META-RECEIVER-FINAL
// §4-2 H2). 웹훅 라우트와 이후의 미러·폴백이 같은 빌더를 쓰게 하려는 이동이며, 바뀐 것은
// export 뿐이다. 동작은 tests/meta/lead-ads-payload.golden.test.ts 가 라우트 경계에서 잠근다.
//
// 키 목록을 바꾸면 Compass 제출 뷰(public.compass_meta_submissions_v)의 form_answers 허용 키도
// 함께 봐야 한다(설계 §3-2 허용 키).

export type MetaLeadValue = {
  leadgen_id?: string
  page_id?: string
  form_id?: string
  ad_id?: string
  adgroup_id?: string
  created_time?: number
}

export type MetaWebhookPayload = {
  object?: string
  entry?: Array<{
    id?: string
    time?: number
    changes?: Array<{
      field?: string
      value?: MetaLeadValue
    }>
  }>
}

export type MetaLeadDetail = MetaLeadValue & {
  id?: string
  created_time?: string | number
  ad_name?: string
  adset_id?: string
  adset_name?: string
  campaign_id?: string
  campaign_name?: string
  field_data?: Array<{
    name?: string
    values?: string[]
  }>
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export function extractLeadValues(payload: MetaWebhookPayload) {
  const values: MetaLeadValue[] = []

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen" && change.value?.leadgen_id) {
        values.push(change.value)
      }
    }
  }

  return values
}

export function fieldDataToMap(fieldData: MetaLeadDetail["field_data"]) {
  const fields: Record<string, string> = {}

  for (const field of fieldData ?? []) {
    const key = normalizeString(field.name)
    if (!key) continue

    const value = field.values
      ?.map((item) => normalizeString(item))
      .filter(Boolean)
      .join(", ")

    if (value) fields[key.toLowerCase()] = value
  }

  return fields
}

export function pickField(fields: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = fields[key.toLowerCase()]
    if (value) return value
  }

  return undefined
}

export function hasMarketingConsent(fields: Record<string, string>) {
  const value = pickField(fields, [
    "marketing_consent",
    "consent_marketing",
    "email_marketing_consent",
    "marketing",
    "마케팅_수신_동의",
    "마케팅 수신 동의",
  ])

  if (!value) return false

  return ["1", "true", "yes", "y", "agree", "agreed", "동의"].includes(
    value.trim().toLowerCase()
  )
}

export function buildMetaMessage(value: MetaLeadValue, detail?: MetaLeadDetail) {
  const fields = fieldDataToMap(detail?.field_data)
  const fieldSummary = Object.entries(fields)
    .map(([key, item]) => `${key}: ${item}`)
    .join(" / ")

  return [
    "Meta Lead Ads",
    `leadgen_id=${value.leadgen_id ?? detail?.id ?? "-"}`,
    `page_id=${value.page_id ?? "-"}`,
    `form_id=${value.form_id ?? detail?.form_id ?? "-"}`,
    detail?.campaign_name || detail?.campaign_id
      ? `campaign=${detail.campaign_name ?? detail.campaign_id}`
      : undefined,
    detail?.adset_name || detail?.adset_id
      ? `adset=${detail.adset_name ?? detail.adset_id}`
      : undefined,
    detail?.ad_name || detail?.ad_id || value.ad_id
      ? `ad=${detail?.ad_name ?? detail?.ad_id ?? value.ad_id}`
      : undefined,
    fieldSummary ? `fields=${fieldSummary}` : undefined,
  ]
    .filter(Boolean)
    .join("\n")
}

export function buildLeadCapturePayload(value: MetaLeadValue, detail?: MetaLeadDetail) {
  const fields = fieldDataToMap(detail?.field_data)
  const firstName = pickField(fields, ["first_name", "firstname", "이름"])
  const lastName = pickField(fields, ["last_name", "lastname", "성"])
  const combinedName = [lastName, firstName].filter(Boolean).join("")

  return {
    source: "meta_lead_ads",
    name:
      pickField(fields, ["full_name", "name", "성명", "이름"]) ||
      combinedName ||
      undefined,
    org: pickField(fields, [
      "company_name",
      "company",
      "organization",
      "business_name",
      "school_name",
      "academy_name",
      "학원명",
      "회사명",
      "기관명",
    ]),
    role: pickField(fields, ["job_title", "role", "position", "직책", "담당자직책"]),
    size: pickField(fields, [
      "student_count",
      "number_of_students",
      "academy_size",
      "team_size",
      "원생수",
      "학생수",
      "규모",
    ]),
    email: pickField(fields, ["email", "email_address", "이메일"]),
    phone: pickField(fields, [
      "phone_number",
      "phone",
      "mobile",
      "mobile_number",
      "전화번호",
      "휴대폰",
    ]),
    branch: pickField(fields, [
      "city",
      "region",
      "province",
      "address",
      "지역",
      "주소",
      "도시",
    ]),
    message: buildMetaMessage(value, detail),
    marketingConsent: hasMarketingConsent(fields),
    // 광고 계층을 구조화 필드에 저장 — 어드민 리드 보드의 세부유입(광고명) 표시·필터가
    // message 파싱 없이 바로 작동한다. sourceDetail은 사람이 읽는 라벨이라 이름만 쓴다.
    sourceDetail: normalizeString(detail?.ad_name),
    utmSource: "meta",
    utmMedium: "lead_ads",
    utmCampaign: detail?.campaign_name ?? detail?.campaign_id,
    utmTerm: detail?.adset_name ?? detail?.adset_id,
    utmContent: detail?.ad_name ?? detail?.ad_id ?? value.ad_id,
  }
}
