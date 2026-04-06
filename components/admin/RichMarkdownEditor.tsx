"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { useEditor, EditorContent, Extension } from "@tiptap/react"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import Placeholder from "@tiptap/extension-placeholder"
import Link from "@tiptap/extension-link"
import Image from "@tiptap/extension-image"
import { Markdown } from "tiptap-markdown"

// ProseMirror 플러그인: {{green:text}} 구문을 에디터에서 초록색으로 시각화
const GreenTextDecoration = Extension.create({
  name: "greenTextDecoration",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("greenTextDecoration"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return
              const regex = /\{\{green:.*?\}\}/g
              let match: RegExpExecArray | null
              while ((match = regex.exec(node.text)) !== null) {
                decorations.push(
                  Decoration.inline(
                    pos + match.index,
                    pos + match.index + match[0].length,
                    { class: "rich-editor-brand-green" }
                  )
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})

export interface RichMarkdownEditorHandle {
  toggleBold: () => void
  toggleItalic: () => void
  setHeading: (level: 2 | 3) => void
  toggleBlockquote: () => void
  toggleBulletList: () => void
  toggleOrderedList: () => void
  toggleHighlight: () => void
  wrapBrandColor: () => void
  insertLink: () => void
  insertImage: () => void
  insertDivider: () => void
}

interface RichMarkdownEditorProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

const RichMarkdownEditor = forwardRef<RichMarkdownEditorHandle, RichMarkdownEditorProps>(
  function RichMarkdownEditor({ value, onChange, placeholder = "본문을 작성해주세요" }, ref) {
    const lastEmitted = useRef(value)
    const skipNextUpdate = useRef(false)

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Highlight.configure({ multicolor: false }),
        Link.configure({ openOnClick: false }),
        Image.configure({ allowBase64: false }),
        Placeholder.configure({ placeholder }),
        GreenTextDecoration,
        Markdown.configure({
          html: false,
          tightLists: true,
          bulletListMarker: "-",
          transformPastedText: true,
        }),
      ],
      content: value,
      editorProps: {
        attributes: { class: "rich-editor-content" },
      },
      onUpdate({ editor }) {
        if (skipNextUpdate.current) {
          skipNextUpdate.current = false
          return
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const markdown = (editor.storage as any).markdown.getMarkdown() as string
        lastEmitted.current = markdown
        onChange(markdown)
      },
    })

    // 외부에서 value가 변경될 때(언두/리두, 드래프트 불러오기 등) 에디터에 반영
    useEffect(() => {
      if (!editor || value === lastEmitted.current) return
      lastEmitted.current = value
      skipNextUpdate.current = true
      editor.commands.setContent(value)
    }, [editor, value])

    useImperativeHandle(ref, () => ({
      toggleBold: () => editor?.chain().focus().toggleBold().run(),
      toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
      setHeading: (level) => editor?.chain().focus().toggleHeading({ level }).run(),
      toggleBlockquote: () => editor?.chain().focus().toggleBlockquote().run(),
      toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
      toggleOrderedList: () => editor?.chain().focus().toggleOrderedList().run(),
      toggleHighlight: () => editor?.chain().focus().toggleHighlight().run(),
      wrapBrandColor: () => {
        if (!editor) return
        const { from, to } = editor.state.selection
        const selectedText = editor.state.doc.textBetween(from, to) || "브랜드 텍스트"
        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.insertText(`{{green:${selectedText}}}`, from, to)
            return true
          })
          .run()
      },
      insertLink: () => {
        if (!editor) return
        const { from, to } = editor.state.selection
        if (from !== to) {
          const url = window.prompt("링크 URL을 입력하세요:")
          if (url) editor.chain().focus().setLink({ href: url }).run()
        } else {
          const url = window.prompt("링크 URL을 입력하세요:")
          if (!url) return
          const label = window.prompt("링크 텍스트:") ?? url
          editor
            .chain()
            .focus()
            .insertContent({
              type: "text",
              text: label,
              marks: [{ type: "link", attrs: { href: url } }],
            })
            .run()
        }
      },
      insertImage: () => {
        if (!editor) return
        const url = window.prompt("이미지 URL을 입력하세요:")
        if (!url) return
        const alt = window.prompt("이미지 설명(alt 텍스트):") ?? ""
        editor.chain().focus().setImage({ src: url, alt }).run()
      },
      insertDivider: () => editor?.chain().focus().setHorizontalRule().run(),
    }), [editor])

    return (
      <div className="min-h-[600px] rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] px-5 py-4 transition-colors focus-within:border-[#084734]">
        <EditorContent editor={editor} />
      </div>
    )
  }
)

export default RichMarkdownEditor
