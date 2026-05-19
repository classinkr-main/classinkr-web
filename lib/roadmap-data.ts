// Type definitions only. Runtime CRUD lives in lib/repositories/roadmap.ts (Supabase).
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
