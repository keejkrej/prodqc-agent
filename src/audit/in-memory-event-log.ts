import { createHash } from "node:crypto"
import { Effect, Layer, Stream } from "effect"
import {
  DuplicateIdempotentActionError,
  EventLatencyBoundExceededError,
  EventLogImmutabilityError
} from "../domain/errors.ts"
import {
  EventLogEntry,
  EventLogService,
  type AppendEventInput,
  type EventLogServiceShape,
  type HashChainVerificationReport
} from "../domain/events.ts"
import type { EventId, RequestId, Sha256Hash } from "../domain/ids.ts"
import { MAX_EVENT_LATENCY_MS } from "../services/transparency.ts"

export const GENESIS_PREV_HASH =
  `sha256:${"0".repeat(64)}` as Sha256Hash

const VISIBILITY_RANK = {
  public_cluster: 0,
  lab_only: 1,
  internal: 2
} as const

export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`
}

const rowMinusHash = (entry: Omit<EventLogEntry, "hash"> | EventLogEntry) => ({
  event_id: entry.event_id,
  request_id: entry.request_id,
  entity_type: entry.entity_type,
  entity_id: entry.entity_id,
  event_code: entry.event_code,
  visibility: entry.visibility,
  actor_type: entry.actor_type,
  actor_id: entry.actor_id,
  payload: entry.payload,
  occurred_at: entry.occurred_at,
  recorded_at: entry.recorded_at,
  prev_hash: entry.prev_hash
})

export const hashEventRow = (
  prevHash: Sha256Hash,
  row: Omit<EventLogEntry, "hash"> | EventLogEntry
): Sha256Hash => {
  const digest = createHash("sha256")
    .update(prevHash)
    .update(canonicalJson(rowMinusHash(row)))
    .digest("hex")
  return `sha256:${digest}` as Sha256Hash
}

const latencyMs = (occurredAt: string, recordedAt: string): number =>
  Date.parse(recordedAt) - Date.parse(occurredAt)

export const createInMemoryEventLog = (): EventLogServiceShape => {
  const entries: EventLogEntry[] = []
  let nextEventId = 1

  const listForRequest = (requestId: RequestId): EventLogEntry[] =>
    entries.filter((entry) => entry.request_id === requestId)

  return {
    append: (input: AppendEventInput) =>
      Effect.gen(function* () {
        const recordedAt = input.occurred_at
        const observedLatency = latencyMs(input.occurred_at, recordedAt)
        if (observedLatency > MAX_EVENT_LATENCY_MS || observedLatency < 0) {
          return yield* Effect.fail(
            new EventLatencyBoundExceededError({
              requestId: input.request_id,
              occurredAt: input.occurred_at,
              recordedAt,
              latencyMs: observedLatency,
              maxAllowedLatencyMs: MAX_EVENT_LATENCY_MS
            })
          )
        }

        if (input.actor_type === "agent") {
          const duplicate = entries.find(
            (entry) =>
              entry.entity_id === input.entity_id &&
              entry.payload._tag === input.payload._tag &&
              entry.actor_type === "agent"
          )
          if (duplicate) {
            return yield* Effect.fail(
              new DuplicateIdempotentActionError({
                entityId: input.entity_id,
                eventCode: input.payload._tag,
                existingEventId: duplicate.event_id
              })
            )
          }
        }

        const prior = listForRequest(input.request_id)
        const prevHash = prior.at(-1)?.hash ?? GENESIS_PREV_HASH
        const eventId = nextEventId as EventId
        nextEventId += 1
        const withoutHash = {
          event_id: eventId,
          request_id: input.request_id,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          event_code: input.payload._tag,
          visibility: input.visibility,
          actor_type: input.actor_type,
          actor_id: input.actor_id,
          payload: input.payload,
          occurred_at: input.occurred_at,
          recorded_at: recordedAt,
          prev_hash: prevHash
        }
        const entry = new EventLogEntry({
          ...withoutHash,
          hash: hashEventRow(prevHash, withoutHash)
        })
        entries.push(entry)
        return entry
      }),

    getRequestTimeline: (params) =>
      Effect.sync(() => {
        const maxRank = VISIBILITY_RANK[params.maxVisibility]
        const events = listForRequest(params.requestId).filter((entry) => {
          if (VISIBILITY_RANK[entry.visibility] > maxRank) {
            return false
          }
          if (params.granularity === "full") {
            return true
          }
          return (
            entry.payload._tag.startsWith("request.") ||
            entry.payload._tag.startsWith("run.") ||
            entry.payload._tag === "qc.decided" ||
            entry.payload._tag.startsWith("delivery.")
          )
        })
        return {
          request_id: params.requestId,
          events,
          chain_head: events.at(-1)?.hash ?? GENESIS_PREV_HASH
        }
      }),

    verifyRequestChain: (requestId, maxAllowedLatencyMs = MAX_EVENT_LATENCY_MS) =>
      Effect.gen(function* () {
        const events = listForRequest(requestId)
        let prevHash = GENESIS_PREV_HASH
        let maxObservedLatencyMs = 0
        for (const entry of events) {
          if (entry.prev_hash !== prevHash) {
            return yield* Effect.fail(
              new EventLogImmutabilityError({
                requestId,
                eventId: entry.event_id,
                expectedPrevHash: prevHash,
                actualPrevHash: entry.prev_hash,
                reason: "Hash chain prev_hash mismatch on append-only event log."
              })
            )
          }
          const expectedHash = hashEventRow(prevHash, entry)
          if (entry.hash !== expectedHash) {
            return yield* Effect.fail(
              new EventLogImmutabilityError({
                requestId,
                eventId: entry.event_id,
                expectedPrevHash: prevHash,
                actualPrevHash: entry.prev_hash,
                reason: "Hash chain digest mismatch; event_log is immutable and must not be edited."
              })
            )
          }
          const observed = latencyMs(entry.occurred_at, entry.recorded_at)
          if (observed > maxAllowedLatencyMs || observed < 0) {
            return yield* Effect.fail(
              new EventLatencyBoundExceededError({
                requestId,
                eventId: entry.event_id,
                occurredAt: entry.occurred_at,
                recordedAt: entry.recorded_at,
                latencyMs: observed,
                maxAllowedLatencyMs
              })
            )
          }
          if (observed > maxObservedLatencyMs) {
            maxObservedLatencyMs = observed
          }
          prevHash = entry.hash
        }
        const report: HashChainVerificationReport = {
          request_id: requestId,
          verified_event_count: events.length,
          chain_head: events.at(-1)?.hash ?? GENESIS_PREV_HASH,
          max_observed_latency_ms: maxObservedLatencyMs
        }
        return report
      }),

    streamSince: (params) =>
      Stream.fromIterable(
        entries.filter((entry) => {
          if (
            params.sinceEventId !== undefined &&
            entry.event_id <= params.sinceEventId
          ) {
            return false
          }
          return VISIBILITY_RANK[entry.visibility] <= VISIBILITY_RANK[params.maxVisibility]
        })
      )
  }
}

export const makeInMemoryEventLogLayer = (): Layer.Layer<EventLogService> =>
  Layer.sync(EventLogService, () => createInMemoryEventLog())
