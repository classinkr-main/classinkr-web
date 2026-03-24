import fs from "fs"
import path from "path"

const ROADMAP_PATH = path.join(process.cwd(), "data", "roadmap.json")

export type RoadmapStatus = "planned" | "in-progress" | "done"

export interface RoadmapFeature {
  id: string
  title: string
  status: RoadmapStatus
  assignee?: string
}

export interface RoadmapItem {
  id: string
  version: string
  title: string
  status: RoadmapStatus
  startDate?: string
  targetDate?: string
  features: RoadmapFeature[]
}

function readRoadmap(): RoadmapItem[] {
  if (!fs.existsSync(ROADMAP_PATH)) return []
  return JSON.parse(fs.readFileSync(ROADMAP_PATH, "utf-8")) as RoadmapItem[]
}

function writeRoadmap(items: RoadmapItem[]) {
  fs.writeFileSync(ROADMAP_PATH, JSON.stringify(items, null, 2))
}

export function getRoadmapItems() {
  return readRoadmap()
}

export function createRoadmapItem(item: RoadmapItem) {
  const roadmap = readRoadmap()
  roadmap.push(item)
  writeRoadmap(roadmap)
  return item
}

export function updateRoadmapItem(id: string, patch: Partial<RoadmapItem>) {
  const roadmap = readRoadmap()
  const index = roadmap.findIndex((item) => item.id === id)
  if (index === -1) return null

  roadmap[index] = { ...roadmap[index], ...patch, id }
  writeRoadmap(roadmap)

  return roadmap[index]
}
