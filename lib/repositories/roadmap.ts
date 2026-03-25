import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RoadmapItem, RoadmapFeature, RoadmapStatus } from "@/lib/roadmap-data";

export type { RoadmapItem, RoadmapFeature, RoadmapStatus } from "@/lib/roadmap-data";

const sb = () => createSupabaseAdminClient();

export async function getRoadmapItems(): Promise<RoadmapItem[]> {
  const { data, error } = await sb()
    .from("roadmap_items")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[roadmap] 조회 실패: ${error.message}`);
  return (data ?? []).map(rowToLegacy);
}

export async function createRoadmapItem(item: RoadmapItem): Promise<RoadmapItem> {
  const { data: row, error } = await sb()
    .from("roadmap_items")
    .insert({
      version: item.version,
      title: item.title,
      status: item.status,
      start_date: item.startDate ?? null,
      target_date: item.targetDate ?? null,
      features: item.features ?? [],
    })
    .select()
    .single();
  if (error) throw new Error(`[roadmap] 생성 실패: ${error.message}`);
  return rowToLegacy(row);
}

export async function updateRoadmapItem(
  id: string,
  patch: Partial<RoadmapItem>
): Promise<RoadmapItem | null> {
  const { data: row, error } = await sb()
    .from("roadmap_items")
    .update({
      ...(patch.version !== undefined && { version: patch.version }),
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.startDate !== undefined && { start_date: patch.startDate }),
      ...(patch.targetDate !== undefined && { target_date: patch.targetDate }),
      ...(patch.features !== undefined && { features: patch.features }),
    })
    .eq("id", id)
    .select()
    .single();
  if (error || !row) return null;
  return rowToLegacy(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLegacy(row: any): RoadmapItem {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    status: row.status as RoadmapStatus,
    startDate: row.start_date ?? undefined,
    targetDate: row.target_date ?? undefined,
    features: (row.features ?? []) as RoadmapFeature[],
  };
}
