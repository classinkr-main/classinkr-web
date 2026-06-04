import type { JsonLdNode } from "@/lib/seo"

type JsonLdPayload = JsonLdNode | JsonLdNode[]

export function JsonLd({ data }: { data: JsonLdPayload }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  )
}
