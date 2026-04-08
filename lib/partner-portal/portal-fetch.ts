"use client";

import { clearAdminSessionStorage, getAdminToken } from "@/lib/admin-client";

export async function portalFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const adminToken = getAdminToken();

  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (adminToken) {
    headers.set("Authorization", `Bearer ${adminToken}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401 && typeof window !== "undefined") {
    if (adminToken) {
      clearAdminSessionStorage();
      if (!window.location.pathname.startsWith("/admin/login")) {
        window.location.href = "/admin/login";
      }
    } else if (!window.location.pathname.startsWith("/partner/login")) {
      window.location.href = "/partner/login";
    }
  }

  return response;
}
