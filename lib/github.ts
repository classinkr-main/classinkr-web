const REPO = "classinkr-main/classinkr-web"
const API  = `https://api.github.com/repos/${REPO}/releases`

export interface GithubRelease {
  id: number
  tag_name: string
  name: string
  body: string
  published_at: string
  html_url: string
  prerelease: boolean
  draft: boolean
}

export async function getReleases(): Promise<GithubRelease[]> {
  const headers: HeadersInit = { Accept: "application/vnd.github+json" }
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const res = await fetch(API, {
    headers,
    next: { revalidate: 3600 }, // 1시간 캐시
  })

  if (!res.ok) return []

  const data: GithubRelease[] = await res.json()
  return data.filter((r) => !r.draft && !r.prerelease)
}
