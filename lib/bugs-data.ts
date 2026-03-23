import fs from "fs"
import path from "path"

const BUGS_PATH = path.join(process.cwd(), "data", "bugs.json")

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

function readBugs(): BugReport[] {
  if (!fs.existsSync(BUGS_PATH)) return []
  return JSON.parse(fs.readFileSync(BUGS_PATH, "utf-8")) as BugReport[]
}

function writeBugs(bugs: BugReport[]) {
  fs.writeFileSync(BUGS_PATH, JSON.stringify(bugs, null, 2))
}

export function getBugReports() {
  return readBugs()
}

export function createBugReport(
  data: Omit<BugReport, "id" | "createdAt" | "updatedAt" | "status">
) {
  const bugs = readBugs()
  const now = new Date().toISOString()
  const newBug: BugReport = {
    ...data,
    id: `BUG-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    status: "open",
    tags: data.tags ?? [],
  }

  bugs.unshift(newBug)
  writeBugs(bugs)

  return newBug
}

export function updateBugReport(
  id: string,
  patch: Partial<Omit<BugReport, "id" | "createdAt">>
) {
  const bugs = readBugs()
  const index = bugs.findIndex((bug) => bug.id === id)
  if (index === -1) return null

  bugs[index] = {
    ...bugs[index],
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  }
  writeBugs(bugs)

  return bugs[index]
}

export function deleteBugReport(id: string) {
  const bugs = readBugs()
  const filtered = bugs.filter((bug) => bug.id !== id)
  if (filtered.length === bugs.length) return false

  writeBugs(filtered)
  return true
}
