import {
  BarChart3,
  Building2,
  LayoutGrid,
  Lightbulb,
  Quote,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

/**
 * 카테고리 글리프 어휘.
 *
 * 카테고리는 이 블로그에서 유일하게 모든 글에 채워지는 분류축이다(tag는 비는 글이 많다).
 * 그래서 필터 칩·목록 행·이미지 폴백까지 같은 글리프로 꿰면 부호가 정보를 나른다.
 *
 * 색은 쓰지 않는다 — DESIGN.md §2의 "유일한 포화 컬러는 Classin Green" 원칙에 따라
 * 카테고리는 색상환이 아니라 형태로만 구분한다. 글리프도 학원(Building2)·원장 목소리(Quote)
 * 처럼 소재 자체에서 끌어온다.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  전체: LayoutGrid,
  인사이트: Lightbulb,
  "제품 업데이트": Sparkles,
  "성공 사례": Building2,
  "교육 트렌드": TrendingUp,
  "데이터 분석": BarChart3,
  "원장 인터뷰": Quote,
}

export function getCategoryIcon(category: string | null | undefined): LucideIcon {
  if (!category) return LayoutGrid
  return CATEGORY_ICONS[category] ?? LayoutGrid
}
