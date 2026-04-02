import "server-only"

interface PostJsonOptions {
  timeoutMs?: number
  headers?: HeadersInit
}

export async function postJson(
  url: string,
  body: unknown,
  { timeoutMs = 8000, headers }: PostJsonOptions = {}
) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  })
}
