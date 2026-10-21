import type { OpenQuestion, SourcePointer } from "./schema.ts"
import type { SourceLine } from "./source-text.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isSourcePointer = (value: unknown): value is SourcePointer =>
  isRecord(value) &&
  typeof value.file === "string" &&
  typeof value.line === "number" &&
  typeof value.excerpt === "string"

const isSourcedLeaf = (value: Record<string, unknown>): boolean => {
  if (!isSourcePointer(value.source)) {
    return false
  }
  if (typeof value.observation === "string") {
    return true
  }
  return typeof value.value === "string" || typeof value.value === "number"
}

export const lineContainsValue = (lineText: string, value: unknown): boolean => {
  if (typeof value === "number") {
    if (lineText.includes(String(value))) {
      return true
    }
    if (Number.isInteger(value) && lineText.includes(`${value}.0`)) {
      return true
    }
    if (!Number.isInteger(value) && lineText.includes(value.toFixed(1))) {
      return true
    }
    return false
  }
  if (typeof value === "string" && value.length > 0) {
    return lineText.toLowerCase().includes(value.toLowerCase())
  }
  return false
}

export const isGroundedPointer = (
  pointer: SourcePointer,
  value: unknown,
  lines: ReadonlyArray<SourceLine>
): boolean => {
  const row = lines.find((line) => line.line === pointer.line)
  if (!row) {
    return false
  }
  if (!row.text.includes(pointer.excerpt)) {
    return false
  }
  return lineContainsValue(row.text, value)
}

const questionId = (path: string, kind: OpenQuestion["kind"]): string =>
  `${kind}:${path}`

/**
 * Walk a drafted tree. Any `{ value, source }` (or `{ observation, source }`)
 * whose source line does not contain the value is dropped and recorded.
 * The CLI must never keep a value it did not read.
 */
export const groundDraftTree = (
  node: unknown,
  lines: ReadonlyArray<SourceLine>,
  path = "$"
): { readonly value: unknown; readonly rejected: number; readonly questions: OpenQuestion[] } => {
  const questions: OpenQuestion[] = []
  let rejected = 0

  const walk = (current: unknown, currentPath: string): unknown => {
    if (Array.isArray(current)) {
      return current
        .map((item, index) => walk(item, `${currentPath}[${index}]`))
        .filter((item) => item !== undefined)
    }
    if (!isRecord(current)) {
      return current
    }

    if (isSourcedLeaf(current) && isSourcePointer(current.source)) {
      const pointer = current.source
      const groundedValue = "value" in current ? current.value : current.observation
      if (isGroundedPointer(pointer, groundedValue, lines)) {
        const next: Record<string, unknown> = {}
        for (const [key, child] of Object.entries(current)) {
          if (key === "source" || key === "value" || key === "observation") {
            next[key] = child
            continue
          }
          next[key] = walk(child, `${currentPath}.${key}`)
        }
        return next
      }
      rejected += 1
      questions.push({
        id: questionId(currentPath, "ungrounded_value"),
        kind: "ungrounded_value",
        message: `Dropped a value that was not present on ${pointer.file}:${pointer.line}. The CLI does not invent unread values.`,
        field_path: currentPath,
        source: pointer
      })
      return undefined
    }

    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(current)) {
      const walked = walk(child, `${currentPath}.${key}`)
      if (walked !== undefined) {
        next[key] = walked
      }
    }
    if ("when" in current && "then" in current && (next.when === undefined || next.then === undefined)) {
      rejected += 1
      return undefined
    }
    return next
  }

  return { value: walk(node, path), rejected, questions }
}
