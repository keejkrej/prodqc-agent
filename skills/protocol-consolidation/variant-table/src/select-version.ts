import type { DateBasis, LabOntology, ProtocolVersionInterval } from "./types.ts"

const inForce = (version: ProtocolVersionInterval, asOf: string): boolean =>
  version.valid_from <= asOf && (version.valid_to === null || asOf < version.valid_to)

export const selectCurrentBefore = (
  versions: readonly ProtocolVersionInterval[],
  asOf: string
): ProtocolVersionInterval => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error(`select-version: date must be YYYY-MM-DD, got ${asOf}`)
  }
  const hits = versions.filter((version) => inForce(version, asOf))
  if (hits.length === 0) {
    throw new Error(`select-version: no protocol version in force on ${asOf}`)
  }
  if (hits.length > 1) {
    throw new Error(
      `select-version: overlapping protocol versions on ${asOf}: ${hits.map((item) => item.id).join(", ")}`
    )
  }
  const selected = hits[0]
  if (!selected) {
    throw new Error(`select-version: no protocol version in force on ${asOf}`)
  }
  return selected
}

export const datasetDatesForPublication = (graph: LabOntology, publicationId: string): string[] => {
  const pub = graph.entities.publications.find((item) => item.id === publicationId)
  if (!pub) return []
  const figureIds = new Set(pub.figures)
  const datasetIds = new Set(
    graph.edges
      .filter(
        (edge) =>
          edge.type === "derived_from" &&
          edge.from.kind === "figure" &&
          figureIds.has(edge.from.id) &&
          edge.to.kind === "dataset"
      )
      .map((edge) => edge.to.id)
  )
  return graph.entities.datasets.filter((item) => datasetIds.has(item.id)).map((item) => item.date)
}

export const selectProtocolForMethods = (params: {
  readonly versions: readonly ProtocolVersionInterval[]
  readonly datasetDates: readonly string[]
  readonly submitted?: string
}): {
  readonly version: ProtocolVersionInterval
  readonly date_basis: DateBasis
  readonly as_of: string
  readonly dataset_dates: readonly string[]
} => {
  if (params.datasetDates.length > 0) {
    const chosen = params.datasetDates.map((date) => selectCurrentBefore(params.versions, date))
    const ids = [...new Set(chosen.map((item) => item.id))]
    if (ids.length !== 1) {
      throw new Error(
        `select-version: linked datasets span multiple protocol versions: ${ids.join(", ")}`
      )
    }
    const version = chosen[0]
    if (!version) {
      throw new Error("select-version: linked datasets did not resolve a protocol version")
    }
    const asOf = [...params.datasetDates].sort().at(-1) ?? params.datasetDates[0]
    if (!asOf) {
      throw new Error("select-version: linked datasets did not resolve a protocol version")
    }
    return {
      version,
      date_basis: "dataset",
      as_of: asOf,
      dataset_dates: [...params.datasetDates]
    }
  }
  if (!params.submitted) {
    throw new Error("select-version: no linked datasets and no submission date")
  }
  return {
    version: selectCurrentBefore(params.versions, params.submitted),
    date_basis: "submission",
    as_of: params.submitted,
    dataset_dates: []
  }
}
