"use client"

import { useEffect, useState } from "react"
import { Eye } from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import type { BlogPost } from "@/lib/blog-types"

interface PageViewsResponse {
  rangeDays: number
  total: number
  top: Array<{ page: string; count: number }>
}

function slugFromPath(path: string): string {
  const raw = path.replace(/^\/blog\//, "")
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** 최근 30일 블로그 인기글 — client_events page_view 집계 */
export default function TopViewedPosts({ posts }: { posts: BlogPost[] }) {
  const [data, setData] = useState<PageViewsResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    adminFetchJsonCached<PageViewsResponse>(
      "/api/admin/content/page-views?prefix=%2Fblog%2F&days=30&limit=5",
      undefined,
      { ttlMs: 300_000 }
    )
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (failed || (data && data.top.length === 0)) return null

  const titleBySlug = new Map(posts.map((p) => [p.slug, p.title]))

  return (
    <div className="mb-6 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Eye className="h-4 w-4 text-[#084734]" />
        <h2 className="text-[13px] font-semibold text-[#111110]">최근 30일 인기글</h2>
        {data ? (
          <span className="text-[11px] text-[#1a1a1a]/35">총 {data.total.toLocaleString()}회 조회</span>
        ) : null}
      </div>
      {!data ? (
        <p className="text-[12px] text-[#1a1a1a]/35">불러오는 중...</p>
      ) : (
        <ol className="space-y-1.5">
          {data.top.map((item, index) => {
            const slug = slugFromPath(item.page)
            return (
              <li key={item.page} className="flex items-baseline gap-2 text-[13px]">
                <span className="w-4 shrink-0 text-right font-semibold text-[#1a1a1a]/30">{index + 1}</span>
                <a
                  href={item.page}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-[#111110] hover:text-[#084734]"
                >
                  {titleBySlug.get(slug) ?? slug}
                </a>
                <span className="shrink-0 text-[12px] text-[#1a1a1a]/40">{item.count.toLocaleString()}회</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
