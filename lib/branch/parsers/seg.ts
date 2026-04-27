import type { FormattedCell } from "@/lib/branch/google-sheets"
export const SEG_RANGE = "SEG!A1:AZ100"
export interface SegRow { region: string; goal: number; status: number }

export function parseSeg(grid: FormattedCell[][]): SegRow[] {
  const goalMap = new Map<string, number>()
  const statusMap = new Map<string, number>()
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const gReg = String(row[11]?.value ?? "").trim()
    const gAmt = Number(row[12]?.value); if (gReg) goalMap.set(gReg, Number.isFinite(gAmt) ? gAmt : 0)
    const sReg = String(row[16]?.value ?? "").trim()
    const sAmt = Number(row[17]?.value); if (sReg) statusMap.set(sReg, Number.isFinite(sAmt) ? sAmt : 0)
  }
  const regions = new Set([...goalMap.keys(), ...statusMap.keys()])
  return [...regions].map((region) => ({ region, goal: goalMap.get(region) ?? 0, status: statusMap.get(region) ?? 0 }))
}
