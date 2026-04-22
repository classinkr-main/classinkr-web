import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Search } from "lucide-react"

import { DocsArticleCard, DocsLandingShell, DocsSearchPanel } from "@/components/docs"
import { getDocsContent } from "@/lib/docs-content"

import {
  docsTrustCards,
  getAllDocsSummaries,
  getDocsCategoryCards,
  toArticleSummary,
} from "./_utils"

export const metadata: Metadata = {
  title: "가이드와 도움말 | ClassIn",
  description:
    "ClassIn 사용법, 운영 매뉴얼, 자주 묻는 질문, 문제 해결, 업데이트를 한곳에서 확인하세요.",
  openGraph: {
    title: "ClassIn 가이드와 도움말",
    description:
      "ClassIn 사용법, 운영 매뉴얼, 자주 묻는 질문, 문제 해결, 업데이트를 한곳에서 확인하세요.",
    type: "website",
  },
}

export default async function DocsHomePage() {
  const docsContent = await getDocsContent()
  const categories = getDocsCategoryCards(docsContent)
  const featuredArticles = docsContent.docs
    .filter((doc) => doc.featured && (doc.visibility ?? "public") === "public" && !doc.noindex)
    .map((doc) => toArticleSummary(doc, docsContent.categories))
  const allDocs = getAllDocsSummaries(docsContent)
  const popularTroubleshooting = docsContent.docs
    .filter((doc) => doc.category === "troubleshooting")
    .map((doc) => toArticleSummary(doc, docsContent.categories))

  return (
    <DocsLandingShell
      eyebrow="ClassIn Docs"
      title={
        <>
          수업 운영이 막히지 않도록,
          <br className="hidden md:block" />
          필요한 답을 한곳에.
        </>
      }
      description={
        <>
          빠른 시작, 제품 가이드, 기능 매뉴얼, FAQ, 문제 해결, 업데이트까지.
          원장님과 운영팀이 바로 확인할 수 있는 ClassIn 문서 센터입니다.
        </>
      }
      categories={categories}
      featuredArticles={featuredArticles}
    >
      <DocsSearchPanel articles={allDocs} sourcePage="/docs" />

      <section className="grid gap-4 lg:grid-cols-3">
        {docsTrustCards.map(({ icon: Icon, title, description }) => (
          <div key={title} className="rounded-2xl border border-black/[0.08] bg-white p-6 shadow-card">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#084734]">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <h2 className="mt-5 text-xl font-bold leading-snug tracking-card text-[#111110]">
              {title}
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-[#615D59]">
              {description}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-[28px] border border-black/[0.08] bg-white p-6 shadow-card md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#084734]">
              Quick Help
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-subhead text-[#111110] md:text-3xl">
              수업 중 바로 찾는 문제 해결
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#615D59]">
              문제 해결 문서는 메인 마케팅 메시지보다 한 단계 뒤에 두되,
              검색과 챗봇에서는 바로 찾을 수 있게 구성했습니다.
            </p>
          </div>
          <Link
            href="/docs/troubleshooting"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#084734] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#065c41]"
          >
            문제 해결 보기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {popularTroubleshooting.map((article) => (
            <DocsArticleCard key={article.href} {...article} />
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-black/[0.08] bg-[#0D1A12] p-6 text-white shadow-card md:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#6EE7B7]">
              <Search className="h-3.5 w-3.5" />
              AI 상담 데이터 준비
            </div>
            <h2 className="mt-5 text-2xl font-black leading-tight tracking-subhead md:text-3xl">
              상담팀과 챗봇이 같은 문서를 기준으로 답하게 됩니다.
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-white/65">
              문서마다 대상, 키워드, 요약, 관련 문서를 함께 저장했습니다.
              이후 챗봇 검색 인덱스나 상담 매크로로 확장하기 좋은 구조입니다.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6EE7B7]">
              Knowledge Base
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-white/5 p-4">
                <div className="text-3xl font-black tabular-nums">{docsContent.categories.length}</div>
                <div className="mt-1 text-xs text-white/45">문서 카테고리</div>
              </div>
              <div className="rounded-xl bg-white/5 p-4">
                <div className="text-3xl font-black tabular-nums">{allDocs.length}</div>
                <div className="mt-1 text-xs text-white/45">초기 문서</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </DocsLandingShell>
  )
}
