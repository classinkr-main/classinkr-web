/**
 * 한국 행정구역(시도) 표준 + 지역 정규화 유틸리티.
 *
 * 목적: 여러 곳에 자유 텍스트로 흩어진 지역 값을 17개 시도 표준으로 정규화한다.
 *  - customers.region_label / partners.region / leads.branch
 *  - branch_rev_deals.region / installation_events.location
 *
 * 출력 단위는 "시도"(17개)다. 시군구 수준 입력("강남", "수원시")은 상위 시도로
 * 끌어올린다. label 값은 lib/branch/korea-province-map.ts 의 KOREA_PROVINCE_SHAPES
 * 라벨과 동일하게 유지하므로, 히트맵/대시보드가 그대로 채택할 수 있다.
 *
 * 설계 원칙: 확신 가능한 매핑만 코드로 둔다. 모호한 토큰(중구/서구/동구 등 여러
 * 시도에 동시에 존재하는 일반 자치구명)은 의도적으로 매칭하지 않고 null 을 돌려
 * 진단 단계에서 수집한다(추측으로 잘못 분류하지 않는다). 운영 중 발견되는 추가
 * 이형은 DB의 region_aliases 테이블로 코드 수정 없이 확장한다.
 */

export interface KoreaProvince {
  /** 행정표준코드 시도 2자리 prefix — 안정적 내부 키 */
  code: string
  /** 표준 약식 라벨 — 히트맵/대시보드 표기 기준 */
  label: string
  /** 공식 전체 명칭 */
  name: string
  /** 영문 표기 */
  english: string
  /** 동의어/이형 표기(전체명·약어·영문 등) */
  aliases: string[]
}

/** 대한민국 17개 시도. code 는 행정표준코드 시도 prefix(레거시 2자리, 안정 키). */
export const KOREA_PROVINCES: KoreaProvince[] = [
  { code: "11", label: "서울", name: "서울특별시", english: "Seoul", aliases: ["서울시", "seoul"] },
  { code: "26", label: "부산", name: "부산광역시", english: "Busan", aliases: ["부산시", "busan", "pusan"] },
  { code: "27", label: "대구", name: "대구광역시", english: "Daegu", aliases: ["대구시", "daegu", "taegu"] },
  { code: "28", label: "인천", name: "인천광역시", english: "Incheon", aliases: ["인천시", "incheon"] },
  { code: "29", label: "광주", name: "광주광역시", english: "Gwangju", aliases: ["광주시", "gwangju"] },
  { code: "30", label: "대전", name: "대전광역시", english: "Daejeon", aliases: ["대전시", "daejeon"] },
  { code: "31", label: "울산", name: "울산광역시", english: "Ulsan", aliases: ["울산시", "ulsan"] },
  { code: "36", label: "세종", name: "세종특별자치시", english: "Sejong", aliases: ["세종시", "세종특별자치", "sejong"] },
  { code: "41", label: "경기", name: "경기도", english: "Gyeonggi", aliases: ["경기도", "gyeonggi", "gyeonggi-do"] },
  { code: "42", label: "강원", name: "강원특별자치도", english: "Gangwon", aliases: ["강원도", "강원특별자치", "gangwon"] },
  { code: "43", label: "충북", name: "충청북도", english: "Chungbuk", aliases: ["충청북도", "충청북", "chungbuk", "chungcheongbuk"] },
  { code: "44", label: "충남", name: "충청남도", english: "Chungnam", aliases: ["충청남도", "충청남", "chungnam", "chungcheongnam"] },
  { code: "45", label: "전북", name: "전북특별자치도", english: "Jeonbuk", aliases: ["전라북도", "전라북", "전북특별자치", "jeonbuk", "jeollabuk"] },
  { code: "46", label: "전남", name: "전라남도", english: "Jeonnam", aliases: ["전라남도", "전라남", "jeonnam", "jeollanam"] },
  { code: "47", label: "경북", name: "경상북도", english: "Gyeongbuk", aliases: ["경상북도", "경상북", "gyeongbuk", "gyeongsangbuk"] },
  { code: "48", label: "경남", name: "경상남도", english: "Gyeongnam", aliases: ["경상남도", "경상남", "gyeongnam", "gyeongsangnam"] },
  { code: "50", label: "제주", name: "제주특별자치도", english: "Jeju", aliases: ["제주도", "제주시", "제주특별자치", "jeju"] },
]

/** 표준 17개 시도 라벨 목록. */
export const KOREA_PROVINCE_LABELS: string[] = KOREA_PROVINCES.map((p) => p.label)

export const PROVINCE_BY_LABEL: Map<string, KoreaProvince> = new Map(
  KOREA_PROVINCES.map((p) => [p.label, p]),
)
export const PROVINCE_BY_CODE: Map<string, KoreaProvince> = new Map(
  KOREA_PROVINCES.map((p) => [p.code, p]),
)

/**
 * 시군구(약식) → 시도 매핑.
 *
 * 시도명을 포함하지 않고 단독으로 등장하는 시·군·구명만 다룬다("강남", "수원").
 * 시도명을 포함하는 문자열("서울 강남구", "경기도 수원시")은 부분일치 단계가
 * 처리하므로 여기에 넣지 않는다. 여러 시도에 중복 존재하는 일반 자치구명
 * (중구/서구/동구/남구/북구/강서/고성)은 의도적으로 제외한다 → AMBIGUOUS.
 */
const SIGUNGU_GROUPS: Record<string, string[]> = {
  서울: [
    "강남", "강동", "강북", "관악", "광진", "구로", "금천", "노원", "도봉",
    "동대문", "동작", "마포", "서대문", "서초", "성동", "성북", "송파",
    "양천", "영등포", "용산", "은평", "종로", "중랑",
  ],
  부산: ["해운대", "사하", "사상", "금정", "연제", "수영", "부산진", "동래", "영도", "기장"],
  대구: ["수성", "달서", "달성", "군위"],
  인천: ["부평", "계양", "연수", "미추홀", "남동", "강화", "옹진"],
  광주: ["광산"],
  대전: ["유성", "대덕"],
  울산: ["울주"],
  경기: [
    "수원", "성남", "분당", "용인", "고양", "일산", "부천", "안양", "평촌",
    "안산", "화성", "남양주", "의정부", "평택", "시흥", "파주", "김포", "광명",
    "군포", "하남", "오산", "이천", "양주", "구리", "안성", "포천", "의왕",
    "여주", "동두천", "과천", "가평", "양평", "연천",
  ],
  강원: [
    "춘천", "원주", "강릉", "동해", "태백", "속초", "삼척", "홍천", "횡성",
    "영월", "평창", "정선", "철원", "화천", "양구", "인제", "양양",
  ],
  충북: ["청주", "충주", "제천", "보은", "옥천", "영동", "증평", "진천", "괴산", "음성", "단양"],
  충남: [
    "천안", "공주", "보령", "아산", "서산", "논산", "계룡", "당진", "금산",
    "부여", "서천", "청양", "홍성", "예산", "태안",
  ],
  전북: [
    "전주", "군산", "익산", "정읍", "남원", "김제", "완주", "진안", "무주",
    "장수", "임실", "순창", "고창", "부안",
  ],
  전남: [
    "목포", "여수", "순천", "나주", "광양", "담양", "곡성", "구례", "고흥",
    "보성", "화순", "장흥", "강진", "해남", "영암", "무안", "함평", "영광",
    "장성", "완도", "진도", "신안",
  ],
  경북: [
    "포항", "경주", "김천", "안동", "구미", "영주", "영천", "상주", "문경",
    "경산", "의성", "청송", "영양", "영덕", "청도", "고령", "성주", "칠곡",
    "예천", "봉화", "울진", "울릉",
  ],
  경남: [
    "창원", "마산", "진해", "진주", "통영", "사천", "김해", "밀양", "거제",
    "양산", "의령", "함안", "창녕", "남해", "하동", "산청", "함양", "거창", "합천",
  ],
  제주: ["서귀포"],
}

/**
 * 여러 시도에 동시에 존재해 단독으로는 시도를 특정할 수 없는 자치구/군명.
 * 자동 매핑하지 않고 null 로 둔다(진단에서 수집 후 컨텍스트로 보정).
 */
export const AMBIGUOUS_DISTRICT_NAMES: string[] = [
  "중구", "서구", "동구", "남구", "북구", "강서", "고성",
]

const SPACE_RE = /\s+/g

/** 매칭 키 정규화: NFC + trim + 소문자 + 공백 제거. */
function normKey(input: string): string {
  return input.normalize("NFC").trim().toLowerCase().replace(SPACE_RE, "")
}

/** 시도 라벨/공식명/영문/약어/코드 → 라벨 인덱스. */
const ALIAS_INDEX: Map<string, string> = (() => {
  const idx = new Map<string, string>()
  for (const p of KOREA_PROVINCES) {
    for (const key of [p.code, p.label, p.name, p.english, ...p.aliases]) {
      idx.set(normKey(key), p.label)
    }
  }
  return idx
})()

/** 시군구(약식) → 시도 라벨 인덱스. */
const SIGUNGU_INDEX: Map<string, string> = (() => {
  const idx = new Map<string, string>()
  for (const [sido, names] of Object.entries(SIGUNGU_GROUPS)) {
    for (const name of names) idx.set(normKey(name), sido)
  }
  return idx
})()

const AMBIGUOUS_KEYS: Set<string> = new Set(AMBIGUOUS_DISTRICT_NAMES.map(normKey))

/** 접미사(시/군/구)를 한 글자만 제거. 시도 자체는 앞 단계에서 이미 처리됨. */
function stripDistrictSuffix(raw: string): string | null {
  if (raw.length >= 3 && /[시군구]$/.test(raw)) return raw.slice(0, -1)
  return null
}

/** 부분일치: 입력 문자열에서 가장 앞에 등장하는 시도명을 채택. */
function matchBySubstring(raw: string): string | null {
  let best: { label: string; idx: number; len: number } | null = null
  for (const p of KOREA_PROVINCES) {
    // 한글 토큰만 사용(영문 약어가 일반 텍스트에 우연히 박히는 오탐 방지)
    const tokens = [p.name, p.label, ...p.aliases].filter((t) => /[가-힣]/.test(t))
    for (const t of tokens) {
      const i = raw.indexOf(t)
      if (i < 0) continue
      if (!best || i < best.idx || (i === best.idx && t.length > best.len)) {
        best = { label: p.label, idx: i, len: t.length }
      }
    }
  }
  return best?.label ?? null
}

export interface NormalizedRegion {
  /** 행정표준코드 시도 prefix */
  code: string
  /** 표준 약식 라벨 */
  label: string
  /** 공식 전체 명칭 */
  name: string
}

/**
 * 자유 텍스트 지역값을 표준 시도 라벨로 정규화한다.
 * 매칭 실패 시 null(진단 대상). 매칭 순서:
 *  1) 시도 직접(라벨/공식명/영문/약어/코드)
 *  2) 시군구 약식(모호 토큰 제외)
 *  3) 접미사(시/군/구) 제거 후 1~2 재시도
 *  4) 부분일치(가장 앞 시도명)
 */
export function normalizeRegionLabel(input: string | null | undefined): string | null {
  if (!input) return null
  const raw = input.normalize("NFC").trim()
  if (!raw) return null
  const key = normKey(raw)

  // 1) 시도 직접 매칭
  const direct = ALIAS_INDEX.get(key)
  if (direct) return direct

  // 2) 시군구 약식 매칭(모호 토큰 제외)
  if (!AMBIGUOUS_KEYS.has(key)) {
    const sg = SIGUNGU_INDEX.get(key)
    if (sg) return sg
  }

  // 3) 접미사 제거 후 재시도("수원시"→수원, "강남구"→강남, "세종시"→세종)
  const stripped = stripDistrictSuffix(raw)
  if (stripped) {
    const sk = normKey(stripped)
    const direct2 = ALIAS_INDEX.get(sk)
    if (direct2) return direct2
    if (!AMBIGUOUS_KEYS.has(sk)) {
      const sg2 = SIGUNGU_INDEX.get(sk)
      if (sg2) return sg2
    }
  }

  // 4) 부분일치
  return matchBySubstring(raw)
}

/** normalizeRegionLabel 의 구조화 버전. 실패 시 null. */
export function normalizeRegion(input: string | null | undefined): NormalizedRegion | null {
  const label = normalizeRegionLabel(input)
  if (!label) return null
  const province = PROVINCE_BY_LABEL.get(label)
  if (!province) return null
  return { code: province.code, label: province.label, name: province.name }
}

/** 단독으로는 시도를 특정할 수 없는 모호 토큰인지 여부. */
export function isAmbiguousRegionToken(input: string | null | undefined): boolean {
  if (!input) return false
  return AMBIGUOUS_KEYS.has(normKey(input))
}

export interface RegionAliasSeedRow {
  /** 원본 표기(표시용) */
  alias: string
  /** 매칭 키(소문자 + 공백 제거) */
  normalized: string
  /** 시도 코드 */
  regionCode: string
  kind: "sido" | "variant" | "sigungu"
}

/**
 * DB region_aliases 시드 행 생성. 이 파일이 단일 진실 원천이며,
 * scripts/seed-region-aliases.ts 가 이를 직렬화해 마이그레이션 시드로 적재한다.
 *
 * 시군구는 약식(기저명)만 싣는다 — "시/군/구" 접미사 형태는 SQL
 * normalize_region_code() 가 접미사 제거로 처리한다. normalized 기준 중복은
 * 먼저 등록된 행이 이긴다(시도 → 시군구 순이라 시도가 우선).
 */
export function buildRegionAliasSeed(): RegionAliasSeedRow[] {
  const rows: RegionAliasSeedRow[] = []
  const seen = new Set<string>()
  const push = (alias: string, regionCode: string, kind: RegionAliasSeedRow["kind"]) => {
    const normalized = normKey(alias)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    rows.push({ alias, normalized, regionCode, kind })
  }
  for (const p of KOREA_PROVINCES) {
    push(p.label, p.code, "sido")
    push(p.name, p.code, "sido")
    push(p.english, p.code, "variant")
    for (const alias of p.aliases) push(alias, p.code, "variant")
  }
  for (const [sido, names] of Object.entries(SIGUNGU_GROUPS)) {
    const code = PROVINCE_BY_LABEL.get(sido)?.code
    if (!code) continue
    for (const name of names) push(name, code, "sigungu")
  }
  return rows
}
