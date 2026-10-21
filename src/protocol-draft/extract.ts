import { FRR_UCUM, NP_RATIO_UCUM, toUcum } from "./ucum.ts"
import type {
  ObservationGate,
  OpenQuestion,
  ProcessBranch,
  SourcedMaterial,
  SourcedNumber,
  SourcedParam,
  SourcedProcessStep,
  SourcedQcLimit,
  SourcedText,
  SourcePointer
} from "./schema.ts"
import type { LoadedSourceDocument, SourceLine } from "./source-text.ts"

export interface ExtractedDraftFields {
  readonly family: SourcedText | undefined
  readonly semver: SourcedText | undefined
  readonly product_line: SourcedText | undefined
  readonly title: SourcedText | undefined
  readonly materials: ReadonlyArray<SourcedMaterial>
  readonly formulation: {
    readonly n_p_ratio: SourcedNumber | undefined
    readonly total_flow_rate: SourcedNumber | undefined
    readonly flow_rate_ratio_aqueous_to_organic: SourcedNumber | undefined
    readonly lipid_molar_percent: ReadonlyArray<SourcedParam>
  }
  readonly process_steps: ReadonlyArray<SourcedProcessStep>
  readonly qc_assays: ReadonlyArray<SourcedQcLimit>
  readonly release_specs: ReadonlyArray<SourcedQcLimit>
  readonly open_questions: ReadonlyArray<OpenQuestion>
}

const pointer = (file: string, line: SourceLine, excerpt: string): SourcePointer => ({
  file,
  line: line.line,
  excerpt
})

const sourcedText = (file: string, line: SourceLine, value: string, excerpt: string): SourcedText => ({
  value,
  source: pointer(file, line, excerpt)
})

const sourcedNumber = (
  file: string,
  line: SourceLine,
  value: number,
  excerpt: string,
  ucum: string | null
): SourcedNumber => ({
  value,
  ucum,
  source: pointer(file, line, excerpt)
})

const firstMatch = (
  lines: ReadonlyArray<SourceLine>,
  pattern: RegExp
): { readonly line: SourceLine; readonly match: RegExpMatchArray } | undefined => {
  for (const line of lines) {
    const match = line.text.match(pattern)
    if (match) {
      return { line, match }
    }
  }
  return undefined
}

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)

const instrumentRoleFor = (title: string): string | undefined => {
  const lower = title.toLowerCase()
  if (lower.includes("mix")) return "microfluidic_mixer"
  if (lower.includes("dls")) return "dls"
  if (lower.includes("ribo") || lower.includes("encapsul")) return "ribogreen_plate_reader"
  return undefined
}

const parseNumberedSteps = (
  file: string,
  lines: ReadonlyArray<SourceLine>
): ReadonlyArray<SourcedProcessStep> => {
  const starts: Array<{ ordinal: number; line: SourceLine; title: string }> = []
  for (const line of lines) {
    const match = line.text.match(/^\s*(\d+)\.\s+(.+?)\s*$/)
    if (match?.[1] && match[2]) {
      starts.push({
        ordinal: Number(match[1]),
        line,
        title: match[2]
      })
    }
  }

  return starts.map((start, index) => {
    const next = starts[index + 1]
    const body = lines.filter(
      (row) => row.line > start.line.line && (next ? row.line < next.line.line : true)
    )
    const gate = findObservationGate(file, body)
    const branches = findBranches(file, body)
    const params = findStepParams(file, [start.line, ...body])
    const role = instrumentRoleFor(start.title)
    return {
      key: slug(start.title) || `step_${start.ordinal}`,
      title: sourcedText(file, start.line, start.title, start.title),
      ordinal: start.ordinal,
      ...(role ? { instrument_role: role } : {}),
      params,
      ...(gate ? { observation_gate: gate } : {}),
      branches,
      source: pointer(file, start.line, start.title)
    }
  })
}

const VAGUE_ENDPOINT =
  /until\s+(?:it\s+)?looks\s+good|as needed|until\s+(?:it\s+)?seems\s+(?:ok|fine)|mix appropriately/i

const CLEAR_GATE = /until(?:\s+the)?(?:\s+suspension|\s+mixture|\s+solution)?(?:\s+is)?\s+clear/i

const findObservationGate = (
  file: string,
  body: ReadonlyArray<SourceLine>
): ObservationGate | undefined => {
  for (const line of body) {
    if (VAGUE_ENDPOINT.test(line.text)) {
      continue
    }
    if (CLEAR_GATE.test(line.text)) {
      const excerpt = line.text.trim()
      return {
        kind: "until_observation",
        observation: "clear",
        source: pointer(file, line, excerpt)
      }
    }
  }
  return undefined
}

const findBranches = (
  file: string,
  body: ReadonlyArray<SourceLine>
): ReadonlyArray<ProcessBranch> => {
  const branches: ProcessBranch[] = []
  for (const line of body) {
    const cloudy = line.text.match(
      /if(?:\s+the)?(?:\s+mixture|\s+suspension)?\s+remains cloudy(?:,)?\s*(.+)/i
    )
    const still = line.text.match(/if still cloudy(?:,)?\s*(.+)/i)
    const match = cloudy ?? still
    if (match?.[1]) {
      const when = cloudy ? "mixture remains cloudy" : "still cloudy"
      const then = match[1].replace(/\.$/, "").trim()
      branches.push({
        when: sourcedText(file, line, when, when),
        then: sourcedText(file, line, then, then),
        source: pointer(file, line, line.text.trim())
      })
    }
  }
  return branches
}

const findStepParams = (
  file: string,
  body: ReadonlyArray<SourceLine>
): ReadonlyArray<SourcedParam> => {
  const params: SourcedParam[] = []
  for (const line of body) {
    const hold = line.text.match(/hold\s+(\d+(?:\.\d+)?)\s*(h|hr|hours?)/i)
    if (hold?.[1] && hold[2]) {
      params.push({
        name: "hold",
        value: Number(hold[1]),
        ucum: toUcum(hold[2]),
        source: pointer(file, line, hold[0])
      })
    }
    const temp = line.text.match(/(\d+(?:\.\d+)?)\s*(deg C|°C)/i)
    if (temp?.[1] && temp[2]) {
      params.push({
        name: "temperature",
        value: Number(temp[1]),
        ucum: toUcum(temp[2]),
        source: pointer(file, line, temp[0])
      })
    }
  }
  return params
}

const collectVagueQuestions = (
  file: string,
  lines: ReadonlyArray<SourceLine>
): OpenQuestion[] => {
  const questions: OpenQuestion[] = []
  for (const line of lines) {
    if (VAGUE_ENDPOINT.test(line.text)) {
      questions.push({
        id: `vague_endpoint:${file}:${line.line}`,
        kind: "vague_endpoint",
        message: `Vague endpoint on line ${line.line}: "${line.text.trim()}". Kept as an open question; not converted into a fixed time or a single path.`,
        field_path: "process_steps.observation_gate",
        source: pointer(file, line, line.text.trim())
      })
    }
  }
  return questions
}

const findLabeledNumber = (
  file: string,
  lines: ReadonlyArray<SourceLine>,
  pattern: RegExp,
  unitFromGroup?: number
): SourcedNumber | undefined => {
  const found = firstMatch(lines, pattern)
  if (!found?.match[1]) {
    return undefined
  }
  const rawUnit = unitFromGroup ? found.match[unitFromGroup] : undefined
  const excerpt = found.match[0] ?? found.line.text.trim()
  return sourcedNumber(file, found.line, Number(found.match[1]), excerpt, toUcum(rawUnit) )
}

const findConflicts = (
  specs: ReadonlyArray<SourcedQcLimit>,
  fieldPath: string
): OpenQuestion[] => {
  const byMetric = new Map<string, SourcedQcLimit[]>()
  for (const spec of specs) {
    const key = `${spec.metric}:${spec.op}`
    const list = byMetric.get(key) ?? []
    list.push(spec)
    byMetric.set(key, list)
  }
  const questions: OpenQuestion[] = []
  for (const [key, list] of byMetric) {
    const values = list
      .map((item) => item.value?.value ?? item.min?.value ?? item.max?.value)
      .filter((value): value is number => typeof value === "number")
    const unique = [...new Set(values)]
    if (unique.length > 1) {
      const first = list[0]
      questions.push({
        id: `conflicting_values:${key}`,
        kind: "conflicting_values",
        message: `Source states more than one ${key} value: ${unique.join(" vs ")}.`,
        field_path: fieldPath,
        ...(first ? { source: first.source } : {})
      })
    }
  }
  return questions
}

export const extractDraftFields = (doc: LoadedSourceDocument): ExtractedDraftFields => {
  const file = doc.basename
  const lines = doc.lines
  const questions: OpenQuestion[] = [...collectVagueQuestions(file, lines)]

  const familyHit = firstMatch(lines, /protocol family:\s*([a-z0-9_]+)/i)
  const versionHit = firstMatch(lines, /version:\s*(\d+\.\d+\.\d+)/i)
  const productHit = firstMatch(lines, /product line:\s*([a-z0-9_]+)/i)
  const titleHit = firstMatch(lines, /^title:\s*(.+)$/i)

  const materials: SourcedMaterial[] = []
  for (const line of lines) {
    const match = line.text.match(/^\s*-\s+(.+?)\s+\(role:\s*([a-z0-9_]+)\)/i)
    if (match?.[1] && match[2]) {
      const name = match[1].trim()
      materials.push({
        id: slug(match[2]),
        role: match[2],
        name: sourcedText(file, line, name, name),
        source: pointer(file, line, line.text.trim())
      })
    }
  }

  const nP = findLabeledNumber(file, lines, /N\/P ratio:\s*(\d+(?:\.\d+)?)/i)
  const nPSourced = nP
    ? { ...nP, ucum: nP.ucum ?? NP_RATIO_UCUM }
    : undefined

  const tfr = findLabeledNumber(
    file,
    lines,
    /Total flow rate:\s*(\d+(?:\.\d+)?)\s*(\S+)/i,
    2
  )

  const frrHit = firstMatch(
    lines,
    /Flow rate ratio aqueous:organic:\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/i
  )
  const frr = frrHit?.match[1]
    ? sourcedNumber(
        file,
        frrHit.line,
        Number(frrHit.match[1]),
        frrHit.match[0] ?? frrHit.line.text.trim(),
        FRR_UCUM
      )
    : undefined

  const lipidPercent: SourcedParam[] = []
  for (const line of lines) {
    const match = line.text.match(
      /Lipid molar percent\s+([a-z0-9_]+):\s*(\d+(?:\.\d+)?)\s*(%)?/i
    )
    if (match?.[1] && match[2]) {
      lipidPercent.push({
        name: match[1],
        value: Number(match[2]),
        ucum: toUcum(match[3] ?? "%"),
        source: pointer(file, line, match[0])
      })
    }
  }

  const processSteps = parseNumberedSteps(file, lines)

  const specs: SourcedQcLimit[] = []

  const pdiHits = lines
    .map((line) => ({
      line,
      match: line.text.match(/PDI[^\n]*?(?:maximum|max|limit|:)\s*(\d+(?:\.\d+)?)/i)
    }))
    .filter((row): row is { line: SourceLine; match: RegExpMatchArray } => Boolean(row.match?.[1]))
  for (const hit of pdiHits) {
    const value = Number(hit.match[1])
    specs.push({
      assay: "dls_pdi",
      metric: "pdi",
      timepoint: "t0",
      op: "max",
      value: sourcedNumber(file, hit.line, value, hit.match[0], "1"),
      source: pointer(file, hit.line, hit.match[0])
    })
  }

  const eeHits = lines
    .map((line) => ({
      line,
      match: line.text.match(
        /(?:Encapsulation(?: efficiency)?(?:\s+target)?|\bEE\b)[^\n]*?(?:target|≥|>=|:)?\s*(\d+(?:\.\d+)?)\s*(%|percent)?/i
      )
    }))
    .filter((row): row is { line: SourceLine; match: RegExpMatchArray } => Boolean(row.match?.[1]))
  for (const hit of eeHits) {
    const value = Number(hit.match[1])
    const unit = toUcum(hit.match[2] ?? "")
    if (!unit) {
      questions.push({
        id: `missing_unit:ee_pct:${file}:${hit.line.line}`,
        kind: "missing_unit",
        message: `Encapsulation value ${value} on line ${hit.line.line} has no unit in the source.`,
        field_path: "release_specs.ee_pct",
        source: pointer(file, hit.line, hit.match[0])
      })
    }
    specs.push({
      assay: "ribogreen_ee",
      metric: "ee_pct",
      timepoint: "t0",
      op: "min",
      value: sourcedNumber(file, hit.line, value, hit.match[0], unit),
      source: pointer(file, hit.line, hit.match[0])
    })
  }

  const rangeHit = firstMatch(
    lines,
    /Z-average range:\s*(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*(nm)?/i
  )
  if (rangeHit?.match[1] && rangeHit.match[2]) {
    const unit = toUcum(rangeHit.match[3] ?? "nm")
    specs.push({
      assay: "dls_size",
      metric: "z_avg_nm",
      timepoint: "t0",
      op: "range",
      min: sourcedNumber(
        file,
        rangeHit.line,
        Number(rangeHit.match[1]),
        rangeHit.match[0] ?? rangeHit.line.text.trim(),
        unit
      ),
      max: sourcedNumber(
        file,
        rangeHit.line,
        Number(rangeHit.match[2]),
        rangeHit.match[0] ?? rangeHit.line.text.trim(),
        unit
      ),
      source: pointer(file, rangeHit.line, rangeHit.match[0] ?? rangeHit.line.text.trim())
    })
  }

  const driftHit = firstMatch(
    lines,
    /Size drift[^\n]*?(\d+(?:\.\d+)?)\s*(nm)?/i
  )
  if (driftHit?.match[1]) {
    const unit = toUcum(driftHit.match[2] ?? "")
    if (!unit) {
      questions.push({
        id: `missing_unit:size_drift:${file}:${driftHit.line.line}`,
        kind: "missing_unit",
        message: `Size drift value ${driftHit.match[1]} on line ${driftHit.line.line} has no unit in the source.`,
        field_path: "release_specs.size_drift_nm",
        source: pointer(file, driftHit.line, driftHit.match[0] ?? driftHit.line.text.trim())
      })
    }
    specs.push({
      assay: "dls_size_drift",
      metric: "size_drift_nm",
      timepoint: "t24h",
      op: "max",
      value: sourcedNumber(
        file,
        driftHit.line,
        Number(driftHit.match[1]),
        driftHit.match[0] ?? driftHit.line.text.trim(),
        unit
      ),
      source: pointer(file, driftHit.line, driftHit.match[0] ?? driftHit.line.text.trim())
    })
  }

  questions.push(...findConflicts(specs, "release_specs"))

  const tfrMentions: Array<{ line: SourceLine; value: string }> = []
  for (const line of lines) {
    const pattern = /TFR\s+(\d+(?:\.\d+)?)\s*mL\/min/gi
    let mention: RegExpExecArray | null
    while ((mention = pattern.exec(line.text))) {
      if (mention[1]) {
        tfrMentions.push({ line, value: mention[1] })
      }
    }
  }
  if (tfr) {
    const tfrLine = lines.find((line) => line.line === tfr.source.line)
    if (tfrLine) {
      tfrMentions.push({ line: tfrLine, value: String(tfr.value) })
    }
  }
  const uniqueTfr = [...new Set(tfrMentions.map((row) => row.value))]
  if (uniqueTfr.length > 1) {
    const first = tfrMentions[0]
    questions.push({
      id: `conflicting_values:total_flow_rate:${file}`,
      kind: "conflicting_values",
      message: `Source states more than one total flow rate: ${uniqueTfr.join(" vs ")} mL/min.`,
      field_path: "formulation.total_flow_rate",
      ...(first ? { source: pointer(file, first.line, first.line.text.trim()) } : {})
    })
  }

  return {
    family: familyHit?.match[1]
      ? sourcedText(file, familyHit.line, familyHit.match[1], familyHit.match[1])
      : undefined,
    semver: versionHit?.match[1]
      ? sourcedText(file, versionHit.line, versionHit.match[1], versionHit.match[1])
      : undefined,
    product_line: productHit?.match[1]
      ? sourcedText(file, productHit.line, productHit.match[1], productHit.match[1])
      : undefined,
    title: titleHit?.match[1]
      ? sourcedText(file, titleHit.line, titleHit.match[1].trim(), titleHit.match[1].trim())
      : undefined,
    materials,
    formulation: {
      n_p_ratio: nPSourced,
      total_flow_rate: tfr,
      flow_rate_ratio_aqueous_to_organic: frr,
      lipid_molar_percent: lipidPercent
    },
    process_steps: processSteps,
    qc_assays: specs,
    release_specs: specs,
    open_questions: questions
  }
}
