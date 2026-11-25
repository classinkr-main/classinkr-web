import { readOptionalNonNegativeInt } from "@/app/api/admin/hardware/_validation"
import type { ToolArgs } from "@/lib/ops-tools/types"

export const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false })

export const limitOf = (args: ToolArgs, fallback: number, max: number) => Math.min(readOptionalNonNegativeInt(args, "limit", "limit") ?? fallback, max)

export const includesText = (needle: string | undefined, ...hay: Array<string | null | undefined>) =>
  !needle || hay.some((v) => v?.toLocaleLowerCase("ko-KR").includes(needle.toLocaleLowerCase("ko-KR")))
