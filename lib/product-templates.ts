import { HARDWARE_INSTALL_PRICE_KRW, getHardwareItem } from "@/lib/billing/hardware-catalog"

/**
 * 견적 작성기용 품목 카탈로그.
 *
 * 하드웨어 단가는 lib/billing/hardware-catalog.ts(공개 가격 SSOT)에서 파생한다 — 여기서 숫자를
 * 다시 적으면 체크아웃 합계·랜딩 가격과 견적서 단가가 조용히 갈라진다.
 * 정합성은 tests/billing/pricing-consistency.test.ts 가 지킨다.
 */
function catalogPrice(sku: string, fallback: number) {
  return getHardwareItem(sku)?.priceKrw ?? fallback
}

const BOARD_86_PRICE = catalogPrice("hw-board-86", 6_300_000)
const BOARD_75_PRICE = catalogPrice("hw-board-75", 5_400_000)
const CAMERA_T1_PRICE = catalogPrice("hw-camera-t1", 1_200_000)
const AI_STUDIO_SET_PRICE = catalogPrice("hw-package-ai-studio", 8_300_000)
/** 자동 녹화 1년 이용권 — 녹화 세트 단가에서 86\"+T1+벽걸이를 뺀 값(830-630-120-50=30만원). */
const AI_RECORDING_1Y_PRICE = 300_000

export const PRODUCT_TEMPLATES = [
  {
    key: "board-86",
    label: '전자칠판 86"',
    description: "메인 대형 패널",
    unit_price: BOARD_86_PRICE,
  },
  {
    key: "board-75",
    label: '전자칠판 75"',
    description: "중형 패널",
    unit_price: BOARD_75_PRICE,
  },
  {
    key: "camera-t1",
    label: "Classin T1 카메라",
    description: "수업/회의 촬영용",
    unit_price: CAMERA_T1_PRICE,
  },
  {
    key: "stand",
    label: "이동형 스탠드",
    description: "스탠드 거치형",
    unit_price: HARDWARE_INSTALL_PRICE_KRW,
  },
  {
    key: "wall-mount",
    label: "벽걸이 설치",
    description: "현장 설치비 포함",
    unit_price: HARDWARE_INSTALL_PRICE_KRW,
  },
  {
    key: "bundle-86-t1-wall",
    label: '86" 패키지',
    description: '86" + T1 카메라 + 벽걸이 설치',
    unit_price: BOARD_86_PRICE + CAMERA_T1_PRICE + HARDWARE_INSTALL_PRICE_KRW, // 630+120+50 = 800
  },
  {
    key: "ai-recording-1y",
    label: "자동 녹화 1년 이용권",
    description: "약 1,200시간 녹화/아카이브",
    unit_price: AI_RECORDING_1Y_PRICE,
  },
  {
    key: "ai-studio-recording-set",
    label: "올인원 녹화수업 세트",
    description: '86" 전자칠판 + T1 + 벽걸이 + 자동 녹화 1년',
    unit_price: AI_STUDIO_SET_PRICE, // 630+120+50+30 = 830 (hardware-catalog의 hw-package-ai-studio)
  },
  {
    key: "online-suite-monthly",
    label: "구독형 AI Suite",
    description: "무제한 녹화/수업 + 랜딩페이지 + 인가 대행",
    unit_price: 400_000,
  },
] as const

export type ProductKey = typeof PRODUCT_TEMPLATES[number]['key']

export function getProductBySku(sku: string) {
  return PRODUCT_TEMPLATES.find(p => p.key === sku)
}
