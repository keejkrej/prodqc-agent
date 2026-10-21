const escapePdfLiteral = (text: string): string =>
  text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")

const unescapePdfLiteral = (text: string): string =>
  text.replace(/\\([\\()nrt])/g, (_match, ch: string) => {
    if (ch === "n") return "\n"
    if (ch === "r") return "\r"
    if (ch === "t") return "\t"
    return ch
  })

/**
 * Minimal text-extraction for synthetic / digital PDFs that store
 * literal strings in content streams (`(text) Tj`).
 */
export const extractPdfText = (bytes: Uint8Array): string => {
  const ascii = Buffer.from(bytes).toString("latin1")
  if (!ascii.startsWith("%PDF")) {
    throw new Error("Not a PDF (missing %PDF header)")
  }
  const strings: string[] = []
  const tj = /\((?:\\.|[^\\)])*\)\s*Tj/g
  let match: RegExpExecArray | null
  while ((match = tj.exec(ascii))) {
    const literal = match[0]
    const inner = literal.slice(1, literal.lastIndexOf(")"))
    strings.push(unescapePdfLiteral(inner))
  }
  if (strings.length === 0) {
    throw new Error("PDF text extraction found no Tj literal strings")
  }
  return strings.join("\n")
}

const objectBlock = (id: number, body: string): string => `${id} 0 obj\n${body}\nendobj\n`

/**
 * Write a one-page Type1-Helvetica PDF whose text extractors can round-trip.
 * Used only for SYNTHETIC fixtures and tests.
 */
export const writeSimplePdf = (lines: ReadonlyArray<string>): Buffer => {
  const ops = [
    "BT",
    "/F1 9 Tf",
    "72 770 Td",
    ...lines.flatMap((line, index) =>
      index === 0
        ? [`(${escapePdfLiteral(line)}) Tj`]
        : ["0 -11 Td", `(${escapePdfLiteral(line)}) Tj`]
    ),
    "ET"
  ].join("\n")
  const stream = `${ops}\n`
  const objects = [
    objectBlock(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    objectBlock(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    objectBlock(
      3,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
    ),
    objectBlock(4, `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`),
    objectBlock(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
  ]
  let body = "%PDF-1.4\n"
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "latin1"))
    body += object
  }
  const xrefAt = Buffer.byteLength(body, "latin1")
  const xrefEntries = ["0000000000 65535 f "]
  for (let i = 1; i <= 5; i += 1) {
    const offset = offsets[i]
    if (offset === undefined) {
      throw new Error("PDF xref offset missing")
    }
    xrefEntries.push(`${String(offset).padStart(10, "0")} 00000 n `)
  }
  body += `xref\n0 6\n${xrefEntries.join("\n")}\n`
  body += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return Buffer.from(body, "latin1")
}
