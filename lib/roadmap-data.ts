// roadmap-data.ts — 로드맵 도메인 타입.
// CRUD는 lib/repositories/roadmap.ts(Supabase)로 이관됨. 이 파일은 타입만 제공한다.

export type RoadmapStatus = "planned" | "in-progress" | "done"

export interface RoadmapFeature {
  id: string
  title: string
  status: RoadmapStatus
  assignee?: string
}

export interface RoadmapItem {
  id: string
  version: string
  title: string
  status: RoadmapStatus
  startDate?: string
  targetDate?: string
  features: RoadmapFeature[]
}
