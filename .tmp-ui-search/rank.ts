import { getAllDocsSummaries } from "@/app/docs/_utils"
import { searchDocs, analyzeDocsQuery, suggestDocsQueries } from "@/lib/docs-search"
const docs = getAllDocsSummaries()
const qs = process.argv.slice(2)
for (const q of qs) {
  const a = analyzeDocsQuery(q)
  const r = searchDocs(docs, q)
  console.log(`\n## ${q}  (terms: ${a.terms.map(t => (t.soft ? "~" : "") + t.surface + "[" + t.primary.map(f=>f.text).join("/") + (t.alt.length ? "|" + t.alt.map(f=>f.text).join("/") : "") + "]").join(" ")}; symptom=${a.symptom}; phrase=${a.phrase}) → ${r.length}`)
  for (const x of r.slice(0, 6)) console.log(`  ${x.score}\t${x.doc.href}\t${x.doc.title}\t§ ${x.sections.map(s => s.id + ":" + s.title).join(" | ")}\t✦ ${x.highlight}`)
  if (r.length === 0) console.log("  suggest:", suggestDocsQueries(q, docs))
}
