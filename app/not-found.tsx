import Link from "next/link"

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#FAFAF8" }}
    >
      <div className="w-full max-w-md text-center">
        <div
          className="rounded-2xl p-10 mx-auto"
          style={{
            backgroundColor: "#ECFDF5",
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow:
              "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px, rgba(0,0,0,0.01) 0px 0.175px 1px",
          }}
        >
          <p
            className="font-semibold mb-3"
            style={{
              fontSize: "64px",
              lineHeight: 1,
              letterSpacing: "-2.125px",
              color: "#084734",
            }}
          >
            404
          </p>
          <h1
            className="font-bold mb-3"
            style={{
              fontSize: "48px",
              lineHeight: 1,
              letterSpacing: "-1.5px",
              color: "#111110",
            }}
          >
            페이지를 찾을 수 없어요
          </h1>
          <p
            className="mb-8"
            style={{
              fontSize: "16px",
              lineHeight: 1.5,
              color: "#615D59",
            }}
          >
            요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
            <br />
            주소를 다시 확인하거나 홈으로 돌아가 주세요.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center font-semibold transition-colors"
            style={{
              backgroundColor: "#084734",
              color: "#ffffff",
              padding: "10px 24px",
              borderRadius: "6px",
              fontSize: "15px",
              lineHeight: "1.33",
              textDecoration: "none",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#065c41"
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#084734"
            }}
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  )
}
