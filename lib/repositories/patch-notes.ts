import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PatchNote, PatchChange, NoteStatus } from "@/lib/patch-notes-data";

export type { PatchNote, PatchChange, NoteStatus, ChangeType } from "@/lib/patch-notes-data";

const sb = () => createSupabaseAdminClient();

export async function getAllPatchNotes(): Promise<PatchNote[]> {
  const { data, error } = await sb()
    .from("patch_notes")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw new Error(`[patch-notes] 조회 실패: ${error.message}`);
  return (data ?? []).map(rowToLegacy);
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
