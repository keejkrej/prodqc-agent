import { decodeSourcedDraftProtocolSync, type SourcedDraftProtocol } from "./schema.ts"
import { groundDraftTree } from "./ground.ts"
import type { ExtractedDraftFields } from "./extract.ts"
import { looksSynthetic, type LoadedSourceDocument } from "./source-text.ts"

const filenameStem = (basename: string): string =>
  basename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]+/g, "_")

export const assembleSourcedDraft = (params: {
  readonly model: string
  readonly document: LoadedSourceDocument
  readonly extracted: ExtractedDraftFields
}): SourcedDraftProtocol => {
  const { model, document, extracted } = params
  const synthetic = looksSynthetic(document)
  const familyValue = extracted.family?.value ?? filenameStem(document.basename).toLowerCase()
  const semverValue = extracted.semver?.value ?? "0.0.0"
  const protocolId = `pv_${familyValue}_${semverValue}`
  const firstLine = document.lines[0]

  const grounded = groundDraftTree(
    {
      materials: extracted.materials,
      formulation: extracted.formulation,
      process_steps: extracted.process_steps,
      qc_assays: extracted.qc_assays,
      release_specs: extracted.release_specs
    },
    document.lines
  )

  const groundedRecord = (grounded.value ?? {}) as {
    materials?: ExtractedDraftFields["materials"]
    formulation?: ExtractedDraftFields["formulation"]
    process_steps?: ExtractedDraftFields["process_steps"]
    qc_assays?: ExtractedDraftFields["qc_assays"]
    release_specs?: ExtractedDraftFields["release_specs"]
  }

  const openQuestions = [
    ...extracted.open_questions,
    ...grounded.questions,
    ...(!extracted.family && firstLine
      ? [
          {
            id: `missing_value:family:${document.basename}`,
            kind: "missing_value" as const,
            message: `Family was not in the source body; protocol_id used the filename ${document.basename}.`,
            field_path: "family",
            source: {
              file: document.basename,
              line: firstLine.line,
              excerpt: firstLine.text.trim() || document.basename
            }
          }
        ]
      : []),
    ...(!extracted.semver
      ? [
          {
            id: `missing_value:semver:${document.basename}`,
            kind: "missing_value" as const,
            message: "Semver was not in the source body; recorded as 0.0.0 and flagged.",
            field_path: "semver"
          }
        ]
      : [])
  ]

  const disclaimer = [
    "DRAFT sourced from a local protocol version.",
    "Every kept field points at the source line it was read from.",
    "Unread values are omitted; uncertain items are open questions.",
    "Not a registered ProtocolVersion. Not the full migration pipeline.",
    synthetic ? "SYNTHETIC FIXTURE — not a real lab protocol." : "Do not commit real protocol inputs or outputs."
  ].join(" ")

  return decodeSourcedDraftProtocolSync({
    draft: true,
    schema_version: "0.1.0-draft",
    disclaimer,
    protocol_id: protocolId,
    family: familyValue,
    semver: semverValue,
    status: "draft",
    ...(extracted.product_line ? { product_line: extracted.product_line.value } : {}),
    source_document: {
      file: document.basename,
      sha256: document.sha256,
      line_count: document.lines.length
    },
    model,
    synthetic,
    materials: groundedRecord.materials ?? [],
    formulation: groundedRecord.formulation ?? {
      lipid_molar_percent: []
    },
    process_steps: groundedRecord.process_steps ?? [],
    qc_assays: groundedRecord.qc_assays ?? [],
    release_specs: groundedRecord.release_specs ?? [],
    open_questions: openQuestions,
    invented_values_rejected: grounded.rejected
  })
}
