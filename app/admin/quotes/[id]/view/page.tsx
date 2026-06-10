import type { Metadata } from "next"

import QuoteDirectViewerClient from "./QuoteDirectViewerClient"

export const metadata: Metadata = {
  title: "견적서 보기",
  robots: { index: false, follow: false, nocache: true },
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function AdminQuoteViewPage({ params }: PageProps) {
  const { id } = await params
  return <QuoteDirectViewerClient quoteId={id} />
}
