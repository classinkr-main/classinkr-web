import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

const SEP = "XCOMMITX"

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    // 커밋 메타 + numstat(파일별 추가/삭제 라인 수)
    const { stdout } = await execAsync(
      `git log --pretty=format:"${SEP}|%h|%H|%an|%ai|%s|%D" --numstat -50`,
      { cwd: process.cwd() }
    )

    const commits = stdout
      .split(SEP + "|")
      .filter((block) => block.trim())
      .map((block) => {
        const lines = block.split("\n")
        const header = lines[0].trim()
        const parts = header.split("|")
        if (parts.length < 6) return null

        try {
          let added = 0, deleted = 0, files = 0
          for (const line of lines.slice(1)) {
            const cols = line.split("\t")
            if (cols.length >= 2 && cols[0].trim() !== "") {
              added += parseInt(cols[0]) || 0
              deleted += parseInt(cols[1]) || 0
              files++
            }
          }
          return {
            hash: parts[0],
            full: parts[1],
            author: parts[2],
            date: parts[3],
            message: parts[4],
            refs: parts.slice(5).join("|"),
            stats: { files, added, deleted },
          }
        } catch {
          return null
        }
      })
      .filter(Boolean)

    return NextResponse.json(commits)
  } catch {
    return NextResponse.json({ error: "git log 실패" }, { status: 500 })
  }
}
