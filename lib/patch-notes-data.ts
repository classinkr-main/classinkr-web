/**
 * patch-notes-data.ts — 패치노트 CRUD (JSON 파일 기반)
 * Supabase 전환 시 이 파일의 함수 시그니처 유지, 내부 구현만 교체.
 */
import fs from "fs"
import path from "path"

const FILE = path.join(process.cwd(), "data", "patch-notes.json")

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

function read(): PatchNote[] {
  if (!fs.existsSync(FILE)) return []
  return JSON.parse(fs.readFileSync(FILE, "utf8")) as PatchNote[]
}

function write(data: PatchNote[]) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}

function uid() {
  return `pn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export function getAllPatchNotes(): PatchNote[] {
  return read().sort((a, b) => b.date.localeCompare(a.date))
}

export function createPatchNote(
  data: Omit<PatchNote, "id" | "createdAt" | "updatedAt">
): PatchNote {
  const notes = read()
  const now = new Date().toISOString()
  const note: PatchNote = {
    ...data,
    id: uid(),
    changes: (data.changes ?? []).map((c) => ({ ...c, id: uid() })),
    createdAt: now,
    updatedAt: now,
  }
  notes.unshift(note)
  write(notes)
  return note
}

export function updatePatchNote(
  id: string,
  patch: Partial<Omit<PatchNote, "id" | "createdAt">>
): PatchNote | null {
  const notes = read()
  const idx = notes.findIndex((n) => n.id === id)
  if (idx === -1) return null
  notes[idx] = { ...notes[idx], ...patch, id, updatedAt: new Date().toISOString() }
  write(notes)
  return notes[idx]
}

export function deletePatchNote(id: string): boolean {
  const notes = read()
  const next = notes.filter((n) => n.id !== id)
  if (next.length === notes.length) return false
  write(next)
  return true
}
