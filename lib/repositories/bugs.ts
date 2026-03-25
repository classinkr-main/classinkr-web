import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type { BugReport } from "@/lib/bugs-data";
import type { BugReport } from "@/lib/bugs-data";

const sb = () => createSupabaseAdminClient();

export async function getBugReports(): Promise<BugReport[]> {
  const { data, error } = await sb()
    .from("bug_reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[bugs] 조회 실패: ${error.message}`);
  return (data ?? []).map(rowToLegacy);
}

export async function createBugReport(
  data: Omit<BugReport, "id" | "createdAt" | "updatedAt" | "status">
): Promise<BugReport> {
  const { data: row, error } = await sb()
    .from("bug_reports")
    .insert({
      title: data.title,
      description: data.description ?? null,
      severity: data.severity,
      status: "open",
      reporter: data.reporter,
      assignee: data.assignee ?? null,
      tags: data.tags ?? [],
      environment: data.environment ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`[bugs] 생성 실패: ${error.message}`);
  return rowToLegacy(row);
}

export async function updateBugReport(
  id: string,
  patch: Partial<Omit<BugReport, "id" | "createdAt">>
): Promise<BugReport | null> {
  const { data: row, error } = await sb()
    .from("bug_reports")
    .update({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.severity !== undefined && { severity: patch.severity }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.assignee !== undefined && { assignee: patch.assignee }),
      ...(patch.tags !== undefined && { tags: patch.tags }),
      ...(patch.environment !== undefined && { environment: patch.environment }),
    })
    .eq("id", id)
    .select()
    .single();
  if (error || !row) return null;
  return rowToLegacy(row);
}

export async function deleteBugReport(id: string): Promise<boolean> {
  const { error } = await sb().from("bug_reports").delete().eq("id", id);
  return !error;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLegacy(row: any): BugReport {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    severity: row.severity,
    status: row.status,
    reporter: row.reporter,
    assignee: row.assignee ?? undefined,
    tags: row.tags ?? [],
    environment: row.environment ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
