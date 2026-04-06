import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CalendarEvent, EventType } from "@/lib/calendar-data";

export type { CalendarEvent, EventType } from "@/lib/calendar-data";

const sb = () => createSupabaseAdminClient();

export async function getAllEvents(): Promise<CalendarEvent[]> {
  const { data, error } = await sb()
    .from("calendar_events")
    .select("*")
    .order("date", { ascending: true });
  if (error) throw new Error(`[calendar] 조회 실패: ${error.message}`);
  return (data ?? []).map(rowToLegacy);
}

export async function getEventsByMonth(
  year: number,
  month: number
): Promise<CalendarEvent[]> {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const start = `${prefix}-01`;
  const end = `${prefix}-31`;
  const { data, error } = await sb()
    .from("calendar_events")
    .select("*")
    .or(`date.gte.${start},end_date.gte.${start}`)
    .lte("date", end)
    .order("date", { ascending: true });
  if (error) throw new Error(`[calendar] 월별 조회 실패: ${error.message}`);
  return (data ?? []).map(rowToLegacy);
}

export async function createEvent(
  data: Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">
): Promise<CalendarEvent> {
  const { data: row, error } = await sb()
    .from("calendar_events")
    .insert({
      title: data.title,
      date: data.date,
      end_date: data.endDate ?? null,
      time: data.time ?? null,
      end_time: data.endTime ?? null,
      type: data.type,
      description: data.description ?? null,
      assignees: data.assignees ?? [],
      all_day: data.allDay ?? false,
    })
    .select()
    .single();
  if (error) throw new Error(`[calendar] 생성 실패: ${error.message}`);
  return rowToLegacy(row);
}

export async function updateEvent(
  id: string,
  patch: Partial<Omit<CalendarEvent, "id" | "createdAt">>
): Promise<CalendarEvent | null> {
  const { data: row, error } = await sb()
    .from("calendar_events")
    .update({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.date !== undefined && { date: patch.date }),
      ...(patch.endDate !== undefined && { end_date: patch.endDate }),
      ...(patch.time !== undefined && { time: patch.time }),
      ...(patch.endTime !== undefined && { end_time: patch.endTime }),
      ...(patch.type !== undefined && { type: patch.type }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.assignees !== undefined && { assignees: patch.assignees }),
      ...(patch.allDay !== undefined && { all_day: patch.allDay }),
    })
    .eq("id", id)
    .select()
    .single();
  if (error || !row) return null;
  return rowToLegacy(row);
}

export async function deleteEvent(id: string): Promise<boolean> {
  const { error } = await sb().from("calendar_events").delete().eq("id", id);
  return !error;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLegacy(row: any): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    endDate: row.end_date ?? undefined,
    time: row.time ?? undefined,
    endTime: row.end_time ?? undefined,
    type: row.type as EventType,
    description: row.description ?? undefined,
    assignees: row.assignees ?? [],
    allDay: row.all_day ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
