import { cn } from "@/lib/utils"
import { renderMarkdownToHtml } from "@/lib/blog-markdown"

interface BlogMarkdownRendererProps {
  markdown: string
  className?: string
}

export default function BlogMarkdownRenderer({
  markdown,
  className,
}: BlogMarkdownRendererProps) {
  return (
    <div
      className={cn("blog-markdown", className)}
      dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(markdown) }}
    />
  )
}
