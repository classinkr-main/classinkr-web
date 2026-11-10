// 하드웨어 제품 분류 — 서버(repositories)와 클라이언트(inventory/shared)가 함께 쓰는 순수 판정.
// 분류 정규식이 화면·서버마다 갈라지며 생기는 오계상(브라켓→카메라, 판촉 합산 오염)을 막기 위해
// 여기 한 곳만 수정한다. UI 전용 상수·컴포넌트는 components/admin/hardware/inventory/shared.tsx 유지.

export type HardwareCardGroup = "ifp86" | "ifp75" | "camera" | "stand" | "etc"

export function isPromotedProduct(product: string): boolean {
  return /\(\s*promoted\s*\)/i.test(product)
}

export function isCoreIfpProduct(product: string, size: "75" | "86"): boolean {
  return new RegExp(`^${size}["”]?\\s*IFP`, "i").test(product)
}

// 카테고리 카드 단일 분류 — 서술 명칭("카메라"·"스탠드") 매칭 대신 장비 코드(T1·S1·STD1)로만
// 판별한다. STDM1(110")·110/65" 보드·터치펜(A1/B1/D2)·OPS/POE/케이블·브라켓 등 나머지는 전부
// "etc"(기타 요약)로 모아 비가시 재고를 없앤다.
export function hardwareCardGroup(product: string): HardwareCardGroup {
  if (isCoreIfpProduct(product, "86")) return "ifp86"
  if (isCoreIfpProduct(product, "75")) return "ifp75"
  if (/\bT1\b|\bS1\b/i.test(product)) return "camera"
  if (/\bSTD1\b/i.test(product)) return "stand"
  return "etc"
}

// 홈 재고표 순서(운영자 지정 2026-11-10) — 86" → 75" → T1 만 기본으로 보이고, 110" 은 맨 아래에 둔다.
// 그 밖의 품목(판촉 라인·스탠드·액세서리·터치펜 등)은 접어 둔다(null). 숫자가 작을수록 위.
export const HOME_STOCK_BOTTOM_RANK = 99

export function homeStockRank(product: string): number | null {
  if (isPromotedProduct(product)) return null
  if (isCoreIfpProduct(product, "86")) return 0
  if (isCoreIfpProduct(product, "75")) return 1
  if (/^T1$/i.test(product.trim())) return 2
  if (/^110["”]?\s*IFP/i.test(product)) return HOME_STOCK_BOTTOM_RANK
  return null
}
