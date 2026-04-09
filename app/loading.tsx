export default function Loading() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6"
      style={{ backgroundColor: "#FAFAF8" }}
    >
      {/* Spinner */}
      <div className="relative w-12 h-12">
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
          style={{
            borderTopColor: "#084734",
            borderRightColor: "#D1FAE5",
          }}
        />
      </div>

      {/* Skeleton cards */}
      <div className="w-full max-w-sm space-y-3 px-4">
        {[80, 60, 72].map((width, i) => (
          <div
            key={i}
            className="h-4 rounded-lg animate-pulse"
            style={{
              width: `${width}%`,
              backgroundColor: "#D1FAE5",
              marginLeft: i === 1 ? "auto" : undefined,
              marginRight: i === 1 ? "auto" : undefined,
            }}
          />
        ))}
      </div>

      <p
        style={{
          fontSize: "14px",
          fontWeight: 500,
          color: "#A39E98",
          letterSpacing: "0.125px",
        }}
      >
        불러오는 중...
      </p>
    </div>
  )
}
