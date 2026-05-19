"use client";

import { clearAdminSessionStorage, getAdminToken } from "@/lib/admin-client";

export async function portalFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const adminToken = getAdminToken();
  const isAdminPage =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/admin");

  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (adminToken) {
    headers.set("Authorization", `Bearer ${adminToken}`);
  }

  if (isAdminPage && !headers.has("x-portal-scope")) {
    headers.set("x-portal-scope", "admin");
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401 && typeof window !== "undefined" && adminToken) {
    clearAdminSessionStorage();
    if (!window.location.pathname.startsWith("/admin/login")) {
      window.location.href = "/admin/login";
    }
  }

  return response;
}
