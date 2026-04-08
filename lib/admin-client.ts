"use client"

const STORAGE_KEYS = [
  "admin_password",
  "admin_token",
  "admin_role",
  "admin_name",
  "admin_email",
  "admin_branch",
] as const

export function clearAdminSessionStorage() {
  if (typeof window === "undefined") return

  STORAGE_KEYS.forEach((key) => {
    sessionStorage.removeItem(key)
  })
}

export function getAdminToken() {
  if (typeof window === "undefined") return ""

  return (
    sessionStorage.getItem("admin_token") ??
    sessionStorage.getItem("admin_password") ??
    ""
  )
}

export async function adminFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  const token = getAdminToken()

  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(input, {
    ...init,
    headers,
  })

  if (response.status === 401 && typeof window !== "undefined") {
    clearAdminSessionStorage()

    if (window.location.pathname !== "/admin/login") {
      window.location.href = "/admin/login"
    }
  }

  return response
}

export async function adminFetchJson<T>(input: string, init?: RequestInit) {
  const response = await adminFetch(input, init)
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const fallback = `${response.status} ${response.statusText}`.trim()
    throw new Error(data?.error ?? data?.message ?? (fallback || "요청에 실패했습니다."))
  }

  return data as T
}
