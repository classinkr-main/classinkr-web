// Type definitions only. Runtime CRUD lives in lib/repositories/patch-notes.ts (Supabase).
export type ChangeType = "feat" | "fix" | "improve" | "breaking"
export type NoteStatus = "draft" | "published"

export interface PatchChange {
  id: string
  type: ChangeType
  text: string
}

export interface PatchNote {
  id: string
  version: string
  title: string
  date: string
  status: NoteStatus
  changes: PatchChange[]
  createdAt: string
  updatedAt: string
}
