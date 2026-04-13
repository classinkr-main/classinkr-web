export const PRODUCT_TEMPLATES = [
  {
    key: "board-86",
    label: '전자칠판 86"',
    description: "메인 대형 패널",
    unit_price: 5800000,
  },
  {
    key: "board-75",
    label: '전자칠판 75"',
    description: "중형 패널",
    unit_price: 4900000,
  },
  {
    key: "camera-t1",
    label: "ClassIn T1 카메라",
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
    unit_price: 7500000, // 580+120+50 = 750
  },
] as const

export type ProductKey = typeof PRODUCT_TEMPLATES[number]['key']

export function getProductBySku(sku: string) {
  return PRODUCT_TEMPLATES.find(p => p.key === sku)
}
