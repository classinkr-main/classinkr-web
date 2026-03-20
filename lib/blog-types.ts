export interface BlogPost {
  id: number
  title: string
  excerpt: string
  category: string
  tag: string
  date: string
  author: string
  authorRole: string
  readTime: string
  imageUrl: string
  featured?: boolean
}

export const CATEGORIES = [
  "전체", "인사이트", "제품 업데이트", "성공 사례",
  "교육 트렌드", "데이터 분석", "원장 인터뷰",
] as const
