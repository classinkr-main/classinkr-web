import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    const { stdout } = await execAsync(
      'git log --pretty=format:\'{"hash":"%h","full":"%H","author":"%an","date":"%ai","message":"%s","refs":"%D"}\' -30',
      { cwd: process.cwd() }
    )
    const commits = stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
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
