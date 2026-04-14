import type { Metadata } from "next"
import Link from "next/link"
import UnsubscribeForm from "./UnsubscribeForm"

export const metadata: Metadata = {
  title: "수신 거부 — ClassIn",
  robots: { index: false, follow: false },
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function UnsubscribePage({ searchParams }: Props) {
  const params = await searchParams
  const raw = params["email"]
  const email = typeof raw === "string" ? raw.trim() : ""

  return (
    <main className="min-h-screen flex items-center justify-center px-6" style={{ background: "#FAFAF8" }}>
      <div
        className="max-w-md w-full bg-white rounded-2xl p-10 text-center"
        style={{
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow:
            "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px, rgba(0,0,0,0.01) 0px 0.175px 1px",
        }}
      >
        {email ? (
          <UnsubscribeForm email={email} />
        ) : (
          /* No-email fallback */
          <div className="flex flex-col items-center gap-6">
            <div
              className="flex items-center justify-center w-14 h-14 rounded-full"
              style={{ background: "#F6F5F4" }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  stroke="#A39E98"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="flex flex-col gap-2">
              <h1
                className="text-[22px] font-bold leading-snug tracking-[-0.25px]"
                style={{ color: "#111110" }}
              >
                유효하지 않은 링크입니다.
              </h1>
              <p className="text-[15px] leading-relaxed" style={{ color: "#615D59" }}>
                이메일 주소가 포함된 링크를 사용해 주세요.
              </p>
            </div>

            <Link
              href="/"
              className="text-[15px] font-semibold transition-opacity hover:opacity-70"
              style={{ color: "#084734" }}
            >
              홈으로
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
