// Meta 리드애즈 payload 골든 케이스 — 입력과 기대 출력을 한곳에 둔다.
//
// 이 기대값은 app/api/meta/webhook/route.ts 의 빌더를 lib/meta/lead-ads-payload.ts 로
// 옮기기 **전에** 라우트를 통해 잡은 현재 동작이다(설계 META-RECEIVER-FINAL §4-2 H2).
// 라우트 경유 골든(tests/meta/lead-ads-payload.golden.test.ts)과 옮긴 뒤의 모듈 직접
// 테스트가 같은 표를 쓰므로, 빌더를 고치면 두 테스트가 함께 실패한다.
//
// 값은 모두 합성이다(전화 010-0000-xxxx, 이메일 example.com, id 는 자릿수만 맞춘 가짜).

export type GoldenLeadValue = {
  leadgen_id?: string
  page_id?: string
  form_id?: string
  ad_id?: string
  adgroup_id?: string
  created_time?: number
}

// Graph 응답의 created_time 은 ISO 문자열이다. (라우트의 MetaLeadDetail 은 교차 타입이라 number
// 로 좁혀지지만, 테스트 입력은 실제 응답 모양을 따른다 — 빌더는 created_time 을 읽지 않는다.)
export type GoldenLeadDetail = Omit<GoldenLeadValue, "created_time"> & {
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

export type GoldenPayloadCase = {
  id: string
  value: GoldenLeadValue
  /** undefined 면 Graph 상세 조회가 실패한 경우(detail=undefined)다. */
  detail: GoldenLeadDetail | undefined
  expected: Record<string, unknown>
}

/** buildLeadCapturePayload 가 돌려주는 객체의 키 순서(값이 undefined 인 키 포함). */
export const GOLDEN_PAYLOAD_KEY_ORDER = [
  "source",
  "name",
  "org",
  "role",
  "size",
  "email",
  "phone",
  "branch",
  "message",
  "marketingConsent",
  "sourceDetail",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmTerm",
  "utmContent",
] as const

export const GOLDEN_PAYLOAD_CASES: GoldenPayloadCase[] = [
  {
    id: "standard_keys_full_ad_hierarchy",
    value: {
      leadgen_id: "900000000000001",
      page_id: "100000000000001",
      form_id: "200000000000001",
      ad_id: "300000000000001",
      adgroup_id: "400000000000001",
      created_time: 1789000000,
    },
    detail: {
      id: "900000000000001",
      created_time: "2026-09-15T01:00:00+0000",
      ad_id: "300000000000001",
      ad_name: "  테스트 광고 A  ",
      adset_id: "400000000000001",
      adset_name: "테스트 세트 A",
      campaign_id: "500000000000001",
      campaign_name: "테스트 캠페인 A",
      form_id: "200000000000001",
      field_data: [
        { name: "full_name", values: ["테스트 리드"] },
        { name: "email", values: ["Test.Lead@Example.com"] },
        { name: "phone_number", values: ["010-0000-0001"] },
        { name: "company_name", values: ["테스트학원"] },
        { name: "job_title", values: ["원장"] },
        { name: "student_count", values: ["50-100"] },
        { name: "city", values: ["청주"] },
        { name: "marketing_consent", values: ["Yes"] },
      ],
    },
    expected: {
      source: "meta_lead_ads",
      name: "테스트 리드",
      org: "테스트학원",
      role: "원장",
      size: "50-100",
      email: "Test.Lead@Example.com",
      phone: "010-0000-0001",
      branch: "청주",
      message: [
        "Meta Lead Ads",
        "leadgen_id=900000000000001",
        "page_id=100000000000001",
        "form_id=200000000000001",
        "campaign=테스트 캠페인 A",
        "adset=테스트 세트 A",
        "ad=  테스트 광고 A  ",
        "fields=full_name: 테스트 리드 / email: Test.Lead@Example.com / phone_number: 010-0000-0001 / company_name: 테스트학원 / job_title: 원장 / student_count: 50-100 / city: 청주 / marketing_consent: Yes",
      ].join("\n"),
      marketingConsent: true,
      sourceDetail: "테스트 광고 A",
      utmSource: "meta",
      utmMedium: "lead_ads",
      utmCampaign: "테스트 캠페인 A",
      utmTerm: "테스트 세트 A",
      utmContent: "  테스트 광고 A  ",
    },
  },
  {
    id: "korean_custom_keys_ids_only",
    value: {
      leadgen_id: "900000000000002",
      page_id: "100000000000001",
      form_id: "200000000000002",
    },
    detail: {
      id: "900000000000002",
      form_id: "200000000000099",
      ad_id: "300000000000002",
      adset_id: "400000000000002",
      campaign_id: "500000000000002",
      field_data: [
        { name: "성명", values: [" 김테스트 "] },
        { name: "이메일", values: ["kr.lead@example.com"] },
        { name: "전화번호", values: ["010-0000-0002"] },
        { name: "학원명", values: ["테스트수학학원"] },
        { name: "직책", values: ["실장"] },
        { name: "원생수", values: ["120"] },
        { name: "주소", values: ["충북 청주시 테스트로 1"] },
        { name: "지역", values: ["충북"] },
        { name: "마케팅 수신 동의", values: ["동의"] },
        { name: "관심 과목", values: ["수학", "  ", "영어"] },
        { name: "비고", values: ["   "] },
        { name: "  ", values: ["이름 없는 필드"] },
        { values: ["name 속성 없음"] },
      ],
    },
    expected: {
      source: "meta_lead_ads",
      name: "김테스트",
      org: "테스트수학학원",
      role: "실장",
      size: "120",
      email: "kr.lead@example.com",
      phone: "010-0000-0002",
      branch: "충북",
      message: [
        "Meta Lead Ads",
        "leadgen_id=900000000000002",
        "page_id=100000000000001",
        "form_id=200000000000002",
        "campaign=500000000000002",
        "adset=400000000000002",
        "ad=300000000000002",
        "fields=성명: 김테스트 / 이메일: kr.lead@example.com / 전화번호: 010-0000-0002 / 학원명: 테스트수학학원 / 직책: 실장 / 원생수: 120 / 주소: 충북 청주시 테스트로 1 / 지역: 충북 / 마케팅 수신 동의: 동의 / 관심 과목: 수학, 영어",
      ].join("\n"),
      marketingConsent: true,
      sourceDetail: undefined,
      utmSource: "meta",
      utmMedium: "lead_ads",
      utmCampaign: "500000000000002",
      utmTerm: "400000000000002",
      utmContent: "300000000000002",
    },
  },
  {
    id: "split_name_mixed_case_keys_consent_no",
    value: {
      leadgen_id: "900000000000003",
      page_id: "100000000000002",
      ad_id: "300000000000003",
    },
    detail: {
      id: "900000000000003",
      form_id: "200000000000003",
      field_data: [
        { name: "First_Name", values: ["테스트"] },
        { name: "LAST_NAME", values: ["박"] },
        { name: "Email_Address", values: ["split.name@example.com"] },
        { name: "mobile_number", values: ["010-0000-0003"] },
        { name: "Organization", values: ["테스트 교육센터"] },
        { name: "position", values: ["팀장"] },
        { name: "team_size", values: ["10"] },
        { name: "address", values: ["서울 테스트구"] },
        { name: "marketing", values: ["no"] },
      ],
    },
    expected: {
      source: "meta_lead_ads",
      name: "박테스트",
      org: "테스트 교육센터",
      role: "팀장",
      size: "10",
      email: "split.name@example.com",
      phone: "010-0000-0003",
      branch: "서울 테스트구",
      message: [
        "Meta Lead Ads",
        "leadgen_id=900000000000003",
        "page_id=100000000000002",
        "form_id=200000000000003",
        "ad=300000000000003",
        "fields=first_name: 테스트 / last_name: 박 / email_address: split.name@example.com / mobile_number: 010-0000-0003 / organization: 테스트 교육센터 / position: 팀장 / team_size: 10 / address: 서울 테스트구 / marketing: no",
      ].join("\n"),
      marketingConsent: false,
      sourceDetail: undefined,
      utmSource: "meta",
      utmMedium: "lead_ads",
      utmCampaign: undefined,
      utmTerm: undefined,
      utmContent: "300000000000003",
    },
  },
  {
    id: "no_ad_hierarchy_anywhere",
    value: {
      leadgen_id: "900000000000004",
      page_id: "100000000000003",
    },
    detail: {
      id: "900000000000004",
      field_data: [
        { name: "name", values: ["광고계층 없음"] },
        { name: "phone", values: ["010-0000-0004"] },
        { name: "email_marketing_consent", values: [" TRUE "] },
      ],
    },
    expected: {
      source: "meta_lead_ads",
      name: "광고계층 없음",
      org: undefined,
      role: undefined,
      size: undefined,
      email: undefined,
      phone: "010-0000-0004",
      branch: undefined,
      message: [
        "Meta Lead Ads",
        "leadgen_id=900000000000004",
        "page_id=100000000000003",
        "form_id=-",
        "fields=name: 광고계층 없음 / phone: 010-0000-0004 / email_marketing_consent: TRUE",
      ].join("\n"),
      marketingConsent: true,
      sourceDetail: undefined,
      utmSource: "meta",
      utmMedium: "lead_ads",
      utmCampaign: undefined,
      utmTerm: undefined,
      utmContent: undefined,
    },
  },
  {
    id: "detail_undefined",
    value: {
      leadgen_id: "900000000000005",
      page_id: "100000000000004",
      form_id: "200000000000005",
      ad_id: "300000000000005",
    },
    detail: undefined,
    expected: {
      source: "meta_lead_ads",
      name: undefined,
      org: undefined,
      role: undefined,
      size: undefined,
      email: undefined,
      phone: undefined,
      branch: undefined,
      message: [
        "Meta Lead Ads",
        "leadgen_id=900000000000005",
        "page_id=100000000000004",
        "form_id=200000000000005",
        "ad=300000000000005",
      ].join("\n"),
      marketingConsent: false,
      sourceDetail: undefined,
      utmSource: "meta",
      utmMedium: "lead_ads",
      utmCampaign: undefined,
      utmTerm: undefined,
      utmContent: "300000000000005",
    },
  },
]

/** 동의 판정 표 — 키마다 값을 바꿔 hasMarketingConsent 결과를 잠근다. */
export const GOLDEN_CONSENT_CASES: Array<{
  key: string
  value: string
  expected: boolean
}> = [
  { key: "marketing_consent", value: "1", expected: true },
  { key: "marketing_consent", value: "true", expected: true },
  { key: "consent_marketing", value: "y", expected: true },
  { key: "consent_marketing", value: "Agree", expected: true },
  { key: "email_marketing_consent", value: "agreed", expected: true },
  { key: "마케팅_수신_동의", value: " 동의 ", expected: true },
  { key: "marketing_consent", value: "0", expected: false },
  { key: "marketing_consent", value: "false", expected: false },
  { key: "marketing", value: "동의안함", expected: false },
  { key: "마케팅 수신 동의", value: "미동의", expected: false },
  { key: "consent", value: "yes", expected: false },
]

/** Graph 상세 조회 URL 의 fields 파라미터(순서 포함). */
export const GOLDEN_GRAPH_FIELDS =
  "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data"
