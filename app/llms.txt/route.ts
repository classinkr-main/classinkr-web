import { buildLlmsTxt } from "@/lib/llms-txt"

// 정본(포지셔닝·FAQ)이 바뀌면 다음 배포에 같이 바뀐다. 요청마다 만들 이유가 없어 빌드 때 한 번 만든다.
export const dynamic = "force-static"

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
