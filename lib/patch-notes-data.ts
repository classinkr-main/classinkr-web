/**
 * patch-notes-data.ts — 패치노트 도메인 타입.
 * CRUD는 lib/repositories/patch-notes.ts(Supabase)로 이관됨. 이 파일은 타입만 제공한다.
 */

export type ChangeType = "feat" | "fix" | "improve" | "breaking"
export type NoteStatus = "draft" | "published"

export interface PatchChange {
  id: string
  type: ChangeType
  text: string
}

export interface PatchNote {
  id: string
  version: string       // "v1.2.0"
  title: string         // "2026년 3월 업데이트"
  date: string          // ISO date
  status: NoteStatus
  changes: PatchChange[]
  createdAt: string
  updatedAt: string
}
