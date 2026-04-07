"use client";

/**
 * Portal Fetch — 클라이언트 통합 fetch 헬퍼
 *
 * admin 세션이 있으면 Bearer 토큰 부착, 없으면 Supabase cookie 자동 전송.
 * /api/portal/* 엔드포인트와 함께 사용.
 */

import { getAdminToken, clearAdminSessionStorage } from "@/lib/admin-client";

export async function portalFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);

  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // admin 세션이 있으면 Bearer 토큰 부착
  const adminToken = getAdminToken();
  if (adminToken) {
    headers.set("Authorization", `Bearer ${adminToken}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  // 401 시 admin 세션 클리어 + 리다이렉트
  if (response.status === 401 && typeof window !== "undefined") {
    // admin 세션이 있었다면 admin 로그인으로
    if (adminToken) {
      clearAdminSessionStorage();
      if (!window.location.pathname.startsWith("/admin/login")) {
        window.location.href = "/admin/login";
      }
    } else {
      // partner 세션이었다면 partner 로그인으로
      if (!window.location.pathname.startsWith("/partner/login")) {
        window.location.href = "/partner/login";
      }
    }
  }

  return response;
}

export async function portalFetchJson<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const response = await portalFetch(input, init);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const fallback = `${response.status} ${response.statusText}`.trim();
    throw new Error(
      data?.error ?? data?.message ?? (fallback || "요청에 실패했습니다.")
    );
  }

  return data as T;
}
