export const PRODUCT_TEMPLATES = [
  {
    key: "board-86",
    label: '전자칠판 86"',
    description: "메인 대형 패널",
    unit_price: 6300000,
  },
  {
    key: "board-75",
    label: '전자칠판 75"',
    description: "중형 패널",
    unit_price: 5400000,
  },
  {
    key: "camera-t1",
    label: "Classin T1 카메라",
    description: "수업/회의 촬영용",
    unit_price: 1200000,
  },
  {
    key: "stand",
    label: "이동형 스탠드",
    description: "스탠드 거치형",
    unit_price: 500000,
  },
  {
    key: "wall-mount",
    label: "벽걸이 설치",
    description: "현장 설치비 포함",
    unit_price: 500000,
  },
  {
    key: "bundle-86-t1-wall",
    label: '86" 패키지',
    description: '86" + T1 카메라 + 벽걸이 설치',
    unit_price: 8000000, // 630+120+50 = 800
  },
  {
    key: "ai-recording-1y",
    label: "자동 녹화 1년 이용권",
    description: "약 1,200시간 녹화/아카이브",
    unit_price: 300000,
  },
  {
    key: "ai-studio-recording-set",
    label: "올인원 녹화수업 세트",
    description: '86" 전자칠판 + T1 + 벽걸이 + 자동 녹화 1년',
    unit_price: 8300000, // 630+120+50+30 = 830 (lib/billing/hardware-catalog.ts의 hw-package-ai-studio와 동일 구성)
  },
  {
    key: "online-suite-monthly",
    label: "구독형 AI Suite",
    description: "무제한 녹화/수업 + 랜딩페이지 + 인가 대행",
    unit_price: 400000,
  },
] as const

export type ProductKey = typeof PRODUCT_TEMPLATES[number]['key']

export function getProductBySku(sku: string) {
  return PRODUCT_TEMPLATES.find(p => p.key === sku)
}
