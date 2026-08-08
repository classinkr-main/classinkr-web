// 엑셀·구글시트에서 복사한 표를 리드 행으로 바꾸는 파서 — 순수 모듈(브라우저·서버 무관).
//
// 원래 components/admin/crm/LeadRegisterModal.tsx 안에만 있던 로직이다. 캠페인 허브의
// "광고 리드 가져오기"도 같은 붙여넣기를 받으므로, 두 화면이 헤더 인식·행 검증 기준을
// 공유하도록 밖으로 뺐다. 한쪽만 고치면 같은 시트가 화면에 따라 다르게 잘린다.

export interface PastedLeadRow {
  org?: string
  name?: string
  phone?: string
  email?: string
}

// 서버(app/api/admin/leads)와 같은 기준 — 클라이언트에서 미리 거르지 않으면
// 사용자는 등록 버튼을 누른 뒤에야 어떤 행이 왜 빠졌는지 알게 된다.
const PHONE_PATTERN = /^[\d()+\-\s]{8,}$/
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/
const EMAIL_MAX_LENGTH = 254

/** 행이 제외되는 사유 목록 — 비어 있으면 유효한 행. */
export function pastedLeadRowIssues(row: PastedLeadRow): string[] {
  const issues: string[] = []
  if (row.phone && !PHONE_PATTERN.test(row.phone)) issues.push("전화 형식")
  if (row.email && (row.email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(row.email))) issues.push("이메일 형식")
  return issues
}

// 헤더 라벨은 셀 "전체"가 라벨일 때만 인정한다 — 부분 일치("테스트학원"의 "학원")로 판정하면
// 헤더 없는 붙여넣기의 첫 리드가 헤더로 오인돼 조용히 사라진다(실사용 학원명 대부분이 "학원"으로 끝남).
const HEADER_ORG = /^(학원명?|기관명?|회사명?|업체명?|org|organization)$/
const HEADER_NAME = /^(이름|성명|성함|name|담당|담당자|담당자 ?이름)$/
const HEADER_PHONE = /^(전화|전화번호|연락처|휴대폰|핸드폰|휴대전화|hp|phone|tel)$/
const HEADER_EMAIL = /^(이메일|메일|email|e-mail)$/

/** 붙여넣기(엑셀/구글시트 TSV·CSV·줄단위)를 리드 행으로. 헤더가 있으면 컬럼 매핑, 없으면 내용으로 추론. */
export function parsePastedLeads(text: string): PastedLeadRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : "\t"
  const firstCols = lines[0].split(delim).map((c) => c.trim().toLowerCase())
  // 첫 행에 이메일(@)이나 전화처럼 보이는 값이 있으면 그건 데이터다 — 헤더 판정보다 우선.
  const firstRowLooksLikeData = firstCols.some((c) => c.includes("@") || PHONE_PATTERN.test(c))
  const headerHit =
    !firstRowLooksLikeData &&
    firstCols.some((c) => HEADER_ORG.test(c) || HEADER_NAME.test(c) || HEADER_PHONE.test(c) || HEADER_EMAIL.test(c))

  const colMap: { org?: number; name?: number; phone?: number; email?: number } = {}
  let dataLines = lines
  if (headerHit) {
    firstCols.forEach((c, i) => {
      if (colMap.org == null && HEADER_ORG.test(c)) colMap.org = i
      else if (colMap.name == null && HEADER_NAME.test(c)) colMap.name = i
      else if (colMap.phone == null && HEADER_PHONE.test(c)) colMap.phone = i
      else if (colMap.email == null && HEADER_EMAIL.test(c)) colMap.email = i
    })
    dataLines = lines.slice(1)
  }

  return dataLines
    .map<PastedLeadRow>((line) => {
      const cols = line.split(delim).map((c) => c.trim())
      if (headerHit) {
        return {
          org: colMap.org != null ? cols[colMap.org] || undefined : undefined,
          name: colMap.name != null ? cols[colMap.name] || undefined : undefined,
          phone: colMap.phone != null ? cols[colMap.phone] || undefined : undefined,
          email: colMap.email != null ? cols[colMap.email] || undefined : undefined,
        }
      }
      // 헤더 없음: @=이메일, 숫자많음=전화, 나머지 앞에서부터 학원/이름.
      let email: string | undefined
      let phone: string | undefined
      const rest: string[] = []
      for (const c of cols) {
        if (!c) continue
        if (c.includes("@")) email = email ?? c
        else if (PHONE_PATTERN.test(c)) phone = phone ?? c
        else rest.push(c)
      }
      return { org: rest[0], name: rest[1], phone, email }
    })
    .filter((r) => r.org || r.name || r.phone || r.email)
}

/** 붙여넣기 미리보기 한 행 — 제외 사유까지 들고 있어 "왜 줄었는지"를 등록 전에 보여준다. */
export interface CheckedPastedLeadRow {
  row: PastedLeadRow
  issues: string[]
}

export function checkPastedLeads(rows: PastedLeadRow[]): CheckedPastedLeadRow[] {
  return rows.map((row) => ({ row, issues: pastedLeadRowIssues(row) }))
}
