import "server-only";
import { isCompassKrTeamSnapshot, type CompassKrTeamResult } from "./kr-team-contract";

/** 비밀값은 서버에만 둔다. 미설정·실패를 명시하고 예전 성공값으로 대체하지 않는다. */
export async function readCompassKrTeam(month: string): Promise<CompassKrTeamResult> {
  const base = process.env.COMPASS_BRIDGE_URL?.trim();
  const token = process.env.COMPASS_BRIDGE_TOKEN?.trim();
  if (!base || !token) return { state: "not_configured", snapshot: null };
  try {
    const url = new URL(base);
    const local = ["127.0.0.1", "localhost"].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && local && process.env.NODE_ENV === "development"))) throw new Error("Invalid bridge origin");
    url.pathname = "/api/cron/kr-team";
    url.search = new URLSearchParams({ month }).toString();
    url.hash = "";
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error",
      // branch 클라이언트의 15초 마감 전에 명시적인 실패 상태를 돌려준다.
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Bridge request failed");
    const text = await response.text();
    if (text.length > 1_000_000) throw new Error("Bridge response too large");
    const snapshot: unknown = JSON.parse(text);
    if (!isCompassKrTeamSnapshot(snapshot, month)) throw new Error("Bridge contract mismatch");
    return { state: "ready", snapshot };
  } catch {
    return { state: "unavailable", snapshot: null };
  }
}
