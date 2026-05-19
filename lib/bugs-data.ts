// Type definitions only. Runtime CRUD lives in lib/repositories/bugs.ts (Supabase).
export interface BugReport {
  id: string
  title: string
  description: string
  severity: "low" | "medium" | "high" | "critical"
  status: "open" | "in-progress" | "resolved" | "closed"
  reporter: string
  assignee?: string
  createdAt: string
  updatedAt: string
  tags: string[]
  environment?: string
}
