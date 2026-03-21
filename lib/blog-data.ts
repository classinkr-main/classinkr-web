import fs from "fs"
import path from "path"

export type { BlogPost } from "./blog-types"
export { CATEGORIES } from "./blog-types"

import type { BlogPost } from "./blog-types"

// ─── File Path ──────────────────────────────────────────────────
const DATA_PATH = path.join(process.cwd(), "data", "blog-posts.json")

function readPosts(): BlogPost[] {
  const raw = fs.readFileSync(DATA_PATH, "utf-8")
  return JSON.parse(raw)
}

function writePosts(posts: BlogPost[]): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(posts, null, 2), "utf-8")
}

// ─── CRUD (async for future Supabase swap) ──────────────────────
export async function getAllPosts(): Promise<BlogPost[]> {
  return readPosts()
}

export async function getPostById(id: number): Promise<BlogPost | undefined> {
  const posts = readPosts()
  return posts.find((p) => p.id === id)
}

export async function createPost(data: Omit<BlogPost, "id">): Promise<BlogPost> {
  const posts = readPosts()
  const maxId = posts.length > 0 ? Math.max(...posts.map((p) => p.id)) : 0
  const newPost: BlogPost = { id: maxId + 1, ...data }
  posts.unshift(newPost)
  writePosts(posts)
  return newPost
}

export async function updatePost(id: number, data: Partial<BlogPost>): Promise<BlogPost | null> {
  const posts = readPosts()
  const index = posts.findIndex((p) => p.id === id)
  if (index === -1) return null
  posts[index] = { ...posts[index], ...data, id }
  writePosts(posts)
  return posts[index]
}

export async function deletePost(id: number): Promise<boolean> {
  const posts = readPosts()
  const filtered = posts.filter((p) => p.id !== id)
  if (filtered.length === posts.length) return false
  writePosts(filtered)
  return true
}
