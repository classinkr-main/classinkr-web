type PageProps = {
  params: Promise<{ token: string }>
}

export default async function SharedContractPage({ params }: PageProps) {
  await params
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F5F4] px-6">
      <div className="max-w-md rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-medium text-[#1a1a1a]">계약서 준비 중</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#1a1a1a]/60">
          서명 링크가 곧 활성화됩니다.
          <br />
          담당자에게 문의 바랍니다.
        </p>
      </div>
    </main>
  )
}
