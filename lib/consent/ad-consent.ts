// 맞춤형 광고 활용 동의(선택) — 폼 체크 칸 문구와 버전의 정본.
// 문구를 바꾸면 AD_CONSENT_VERSION 도 손으로 올린다(리드마다 이 버전이 저장된다).
// 같은 사실을 개인정보처리방침 5항(app/privacy/page.tsx, #ad-consent)에도 적는다 — 함께 고친다.

export const AD_CONSENT_VERSION = "ad-consent-2026-11-06"

export const AD_CONSENT_TITLE = "맞춤형 광고 활용 동의 (선택)"

export const AD_CONSENT_SUMMARY =
  "이메일·휴대폰 번호를 해시값으로 바꿔 Google·Meta에 보냅니다. 동의하지 않아도 신청은 그대로 됩니다."

/** 두 칸 모두 선택해야 동의로 본다(제3자 제공 + 국외 이전, 개인정보 보호법 제17조·제28조의8). */
export const AD_CONSENT_BOXES = {
  provide: "[선택] 맞춤형 광고를 위한 개인정보 제3자 제공(Google·Meta)에 동의합니다",
  transfer: "[선택] 위 정보의 국외 이전(미국 등)에 동의합니다",
} as const

export const AD_CONSENT_DETAILS: readonly string[] = [
  "받는 곳: Google LLC(Google Ads · 미국 등 Google 시설이 있는 국가 · googlekrsupport@google.com), Meta Platforms, Inc.(미국 · 1 Meta Way, Menlo Park, CA 94025, USA)",
  "보내는 항목: 이메일과 휴대폰 번호의 해시값. 해시값은 정해진 방식(SHA-256)으로 바꾼 문자열로, 같은 이메일은 늘 같은 값이 되어 Google·Meta가 자기 회원 정보와 맞춰 봅니다. 원래 이메일과 번호는 보내지 않습니다.",
  "보내는 때와 방법: 신청 직후 암호화 통신으로 보냅니다. Google에는 브라우저의 Google 태그로, Meta에는 회사 서버가 전환 API로 보냅니다. 두 칸을 모두 선택하고 쿠키 설정의 '마케팅'도 켠 경우에만 보냅니다.",
  "목적: Google — 광고 성과 측정. Meta — 광고 성과 측정, 광고 대상 선정(Meta가 자체 목적으로 쓰는 부분 포함).",
  "보유 기간: Meta는 매칭 후 연락처 정보를 삭제합니다. Google은 일치하지 않는 값을 삭제하고 일치한 값은 암호화해 보관합니다(Google Ads 데이터 처리 약관, 공개된 기간 없음). 회사는 동의 여부·일시·문구 버전을 상담 기록과 같은 기간(최대 3년) 보관합니다.",
  "거부할 권리: 동의하지 않아도 상담·예약·신청은 똑같이 처리되며, 해시값을 보내지 않습니다. 동의한 뒤에도 classinkr@classin.com으로 언제든 철회할 수 있습니다.",
]

export type AdConsentValue = { provide: boolean; transfer: boolean }

export const EMPTY_AD_CONSENT: AdConsentValue = { provide: false, transfer: false }

export const isAdConsentGiven = (value: AdConsentValue) => value.provide && value.transfer
