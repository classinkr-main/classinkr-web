import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PatchNote, PatchChange, NoteStatus } from "@/lib/patch-notes-data";

export type { PatchNote, PatchChange, NoteStatus, ChangeType } from "@/lib/patch-notes-data";

const sb = () => createSupabaseAdminClient();

export interface GetAllPatchNotesOptions {
  /** 최신순 상위 n건만 (미지정 = 전체) */
  limit?: number;
  /** true면 changes(jsonb)·타임스탬프를 빼고 id,version,title,date,status만 select — changes는 []로 채운다 */
  summary?: boolean;
}

const PATCH_NOTE_SUMMARY_COLUMNS = "id,version,title,date,status";

// options 미전달 = 기존 select("*") 전체 조회 그대로(app/admin/dev 등 호출자 무변경).
export async function getAllPatchNotes(options?: GetAllPatchNotesOptions): Promise<PatchNote[]> {
  const summary = options?.summary === true;
  let query = sb()
    .from("patch_notes")
    .select(summary ? PATCH_NOTE_SUMMARY_COLUMNS : "*")
    .order("date", { ascending: false });
  if (options?.limit !== undefined) {
    query = query.limit(options.limit);
  }
  const { data, error } = await query;
  if (error) throw new Error(`[patch-notes] 조회 실패: ${error.message}`);
  return (data ?? []).map(summary ? rowToSummary : rowToLegacy);
}

export async function createPatchNote(
  data: Omit<PatchNote, "id" | "createdAt" | "updatedAt">
): Promise<PatchNote> {
  const { data: row, error } = await sb()
    .from("patch_notes")
    .insert({
      version: data.version,
      title: data.title,
      date: data.date,
      status: data.status,
      changes: data.changes ?? [],
    })
    .select()
    .single();
  if (error) throw new Error(`[patch-notes] 생성 실패: ${error.message}`);
  return rowToLegacy(row);
}

export async function updatePatchNote(
  id: string,
  patch: Partial<Omit<PatchNote, "id" | "createdAt">>
): Promise<PatchNote | null> {
  const { data: row, error } = await sb()
    .from("patch_notes")
    .update({
      ...(patch.version !== undefined && { version: patch.version }),
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.date !== undefined && { date: patch.date }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.changes !== undefined && { changes: patch.changes }),
    })
    .eq("id", id)
    .select()
    .single();
  if (error || !row) return null;
  return rowToLegacy(row);
}

export async function deletePatchNote(id: string): Promise<boolean> {
  const { error } = await sb().from("patch_notes").delete().eq("id", id);
  return !error;
}

// summary 투영 — PatchNote 타입을 만족시키기 위해 select하지 않은 필드는 빈 값으로 채운다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSummary(row: any): PatchNote {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    date: row.date,
    status: row.status as NoteStatus,
    changes: [],
    createdAt: "",
    updatedAt: "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLegacy(row: any): PatchNote {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    date: row.date,
    status: row.status as NoteStatus,
    changes: (row.changes ?? []) as PatchChange[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
