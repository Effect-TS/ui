import * as BrowserHost from "@effect/ui/html/BrowserHost"
import * as MessageLog from "@effect/ui/MessageLog"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import * as Control from "./control.ts"

export interface Controller {
  readonly roots: ReadonlyMap<string, BrowserHost.Controllable>
  readonly size: number
  readonly paused: () => Control.Paused | undefined
  readonly paint: (
    session: string,
    seq: number
  ) => Effect.Effect<BrowserHost.Painted | undefined>
  readonly resume: Effect.Effect<void>
  readonly notRecording: () => ReadonlyArray<string>
  readonly setRecording: (tag: string, recording: boolean) => void
  readonly picks: () => ReadonlyArray<Control.Picked>
  readonly changes: Stream.Stream<void>
}

type Json = Schema.Json

const isObject = (value: unknown): value is Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const resolve = (
  schema: Json | undefined,
  definitions: Record<string, Json>
): Json | undefined =>
  isObject(schema) && typeof schema.$ref === "string"
    ? definitions[
      schema.$ref.slice(schema.$ref.lastIndexOf("/") + 1)
        .replaceAll("~1", "/").replaceAll("~0", "~")
    ]
    : schema

const literalOf = (schema: Json | undefined): unknown =>
  isObject(schema)
    ? schema.const ??
      (Array.isArray(schema.enum) && schema.enum.length === 1
        ? schema.enum[0]
        : undefined)
    : undefined

const tagOf = (schema: Json, definitions: Record<string, Json>): unknown => {
  const resolved = resolve(schema, definitions)
  return isObject(resolved) && isObject(resolved.properties)
    ? literalOf(resolved.properties._tag)
    : undefined
}

// Cap generated string padding and array items.
const most = 64

// Other log placeholders do not require secrets.
const holdsPlaceholder = (value: unknown): boolean =>
  typeof value === "object" && value !== null &&
  ((isObject(value) && Object.keys(value).length === 1 &&
    value["~redacted"] === true) ||
    Object.values(value).some(holdsPlaceholder))

const isPlaceholderSchema = (schema: Json): boolean =>
  isObject(schema) && isObject(schema.properties) &&
  Object.keys(schema.properties).length === 1 &&
  literalOf(schema.properties["~redacted"]) === true

interface Document {
  readonly schema: Json
  readonly definitions: Record<string, Json>
}

/**
 * Builds a candidate, not a validated payload. Prefers the first usable union
 * member and nonempty arrays; recursive references may fall back to [] or None.
 * In redacting mode, rejects annotations that could expose redacted values.
 */
const exampleOf = (
  root: Json,
  definitions: Record<string, Json>,
  redacting = false
): Json | undefined => {
  const open = new Set<string>()
  let unmasked = false
  const masks = (node: Json | undefined, seen: Set<Json>): boolean => {
    const schema = resolve(node, definitions)
    if (typeof schema !== "object" || schema === null || seen.has(schema)) {
      return false
    }
    seen.add(schema)
    return isPlaceholderSchema(schema) ||
      Object.values(schema).some((child) => masks(child, seen))
  }
  const walk = (schema: Json): Json | undefined => {
    if (!isObject(schema)) return undefined
    if (typeof schema.$ref === "string") {
      const target = resolve(schema, definitions)
      if (open.has(schema.$ref) || target === undefined) return undefined
      open.add(schema.$ref)
      const out = walk(target)
      open.delete(schema.$ref)
      return out
    }
    if ("const" in schema) return schema.const
    if (Array.isArray(schema.enum)) return schema.enum[0]
    const annotated = Array.isArray(schema.examples) &&
      schema.examples.length > 0
    if (annotated || "default" in schema) {
      if (redacting && masks(schema, new Set())) unmasked = true
      return annotated ? (schema.examples as Array<Json>)[0] : schema.default
    }
    const members = schema.anyOf ?? schema.oneOf
    if (Array.isArray(members)) {
      for (const member of members) {
        const out = walk(member)
        if (out !== undefined) return out
      }
      return undefined
    }
    if (Array.isArray(schema.allOf)) {
      const { allOf, ...rest } = schema
      return walk(Object.assign(rest, ...allOf))
    }
    if (isObject(schema.not)) return undefined
    const number = (key: string) =>
      typeof schema[key] === "number" ? schema[key] : undefined
    switch (schema.type) {
      case "string":
        return "a".repeat(Math.min(number("minLength") ?? 0, most))
      case "number":
      case "integer": {
        let out = Math.max(0, number("minimum") ?? -Infinity)
        const above = number("exclusiveMinimum")
        if (above !== undefined && out <= above) out = above + 1
        out = Math.min(out, number("maximum") ?? Infinity)
        const below = number("exclusiveMaximum")
        if (below !== undefined && out >= below) out = below - 1
        return out
      }
      case "boolean":
        return false
      case "array": {
        const out: Array<Json> = []
        for (
          const item of Array.isArray(schema.prefixItems)
            ? schema.prefixItems
            : []
        ) {
          const value = walk(item)
          if (value === undefined) return undefined
          out.push(value)
        }
        const minItems = number("minItems") ?? 0
        // Let the decoder report lengths beyond the cap.
        const length = Math.min(
          Math.max(out.length + 1, minItems),
          number("maxItems") ?? Infinity,
          out.length + most
        )
        if (out.length < length) {
          const value = walk(schema.items ?? {})
          if (value === undefined) {
            return out.length < minItems ? undefined : out
          }
          while (out.length < length) out.push(value)
        }
        return out
      }
      case "object": {
        const out: Record<string, Json> = {}
        const required = Array.isArray(schema.required) ? schema.required : []
        const properties = isObject(schema.properties) ? schema.properties : {}
        for (const key of Object.keys(properties)) {
          const value = walk(properties[key])
          if (value !== undefined) out[key] = value
          else if (required.includes(key)) return undefined
        }
        if (
          Object.keys(properties).length === 0 &&
          isObject(schema.additionalProperties)
        ) {
          const value = walk(schema.additionalProperties)
          if (value !== undefined) out.key = value
        }
        return out
      }
      default:
        return null
    }
  }
  const out = walk(root)
  return unmasked ? undefined : out
}

/** The JSON codec `dispatch` decodes with. */
const codecOf = (schema: Schema.Top) =>
  Schema.toCodecJson(schema as Schema.Codec<unknown>)

const documentOf = (schema: Schema.Top): Document =>
  Schema.toJsonSchemaDocument(codecOf(schema)) as unknown as Document

const membersOf = (document: Document): ReadonlyArray<Json> => {
  const root = resolve(document.schema, document.definitions)
  return isObject(root) && Array.isArray(root.anyOf)
    ? root.anyOf
    : [document.schema]
}

const messageSchema = (
  schema: Schema.Top,
  tag: string | undefined
): Effect.Effect<Json, string> =>
  Effect.suspend(() => {
    const document = documentOf(schema)
    const members = membersOf(document)
    const tags = members.map((member) => tagOf(member, document.definitions))
    const index = tag === undefined ? -1 : tags.indexOf(tag)
    if (tag !== undefined && index === -1) {
      return Effect.fail(
        "No message _tag " + tag + ". The tags are " +
          tags.filter((t) => typeof t === "string").join(", ") + "."
      )
    }
    const decode = Schema.decodeUnknownEffect(codecOf(schema))
    const redactedSchema = MessageLog.redactSchema(schema)
    const encodeRedacted = redactedSchema === schema
      ? undefined
      : Schema.encodeUnknownEffect(codecOf(redactedSchema))
    // Build lazily when decoding or redacted encoding fails.
    let redacted: Document | undefined
    const example = (i: number): Effect.Effect<Json> => {
      const name = tags[i]
      const none = (invalid: string): Json => ({
        ...(typeof name === "string" ? { tag: name } : {}),
        invalid
      })
      const candidate = exampleOf(members[i], document.definitions)
      if (candidate === undefined) {
        return Effect.succeed(none("No value fits this schema."))
      }
      // Validate the JSON round-trip too: serialization turns -0 into 0.
      const message: Json = JSON.parse(JSON.stringify(candidate))
      const entry = (shown: unknown, status?: { invalid: string }): Json =>
        shown === undefined
          ? none(
            "No safe example: a Schema.Redacted's value here comes from an " +
              "example or default that can't be redacted."
          )
          : holdsPlaceholder(shown)
          ? { message: shown as Json, redacted: true, ...status }
          : { message, ...status }
      // Fall back to the redacting schema if decoding or encoding fails.
      const walked = (status?: { invalid: string }): Json => {
        if (encodeRedacted === undefined) return { message, ...status }
        redacted ??= documentOf(redactedSchema)
        return entry(
          exampleOf(membersOf(redacted)[i], redacted.definitions, true),
          status
        )
      }
      return decode(message, { errors: "all" }).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            Effect.succeed(walked({ invalid: error.message })),
          onSuccess: (value) =>
            encodeRedacted === undefined
              ? Effect.succeed({ message })
              : Effect.match(encodeRedacted(value), {
                onFailure: () => walked(),
                onSuccess: (shown) => entry(shown)
              })
        })
      )
    }
    return Effect.map(
      Effect.forEach(
        tag === undefined ? members.map((_, i) => i) : [index],
        example
      ),
      (examples) => ({
        schema: tag === undefined ? document.schema : members[index],
        definitions: document.definitions,
        examples
      })
    )
  })

const maxMatches = 20

// What the tools tell of an element: its tag and the instance that rendered it, never its text.
export const matchOf = (
  element: Element,
  found: BrowserHost.ControlledInstance
) => ({
  tag: element.localName,
  instance: found.instance,
  path: found.path,
  component: found.component
})

export const makeHandler = (
  controller: Omit<Controller, "changes">
): (request: Control.Request) => Effect.Effect<Json, string> => {
  const noRoot = (session: string) =>
    "Session " + session + " has no root on this page."

  const target = (session: string, instance: number) =>
    Effect.suspend(() => {
      const root = controller.roots.get(session)
      if (root === undefined) return Effect.fail(noRoot(session))
      const found = root.instance(instance)
      return found === undefined
        ? Effect.fail(
          "Instance " + instance + " is not mounted in session " + session + "."
        )
        : Effect.succeed(found)
    })

  return (request: Control.Request): Effect.Effect<Json, string> => {
    switch (request._tag) {
      case "Show":
        return Effect.flatMap(
          controller.paint(request.session, request.seq),
          (painted) =>
            painted !== undefined
              ? Effect.succeed({
                fellBack: [...painted.fellBack],
                fallbacks: [...painted.fallbacks],
                skipped: [...painted.skipped]
              })
              : Effect.fail(
                controller.roots.has(request.session)
                  ? "#" + request.seq + " is not among the last " +
                    controller.size + " entries the page keeps to paint from."
                  : noRoot(request.session)
              )
        )
      case "Resume":
        return Effect.as(controller.resume, null)
      case "SetRecording":
        return Effect.sync(() => {
          controller.setRecording(request.tag, request.recording)
          return controller.notRecording()
        })
      case "MessageSchema":
        return Effect.flatMap(
          target(request.session, request.instance),
          (found) => messageSchema(found.message, request.tag)
        )
      case "Dispatch":
        return Effect.gen(function*() {
          const found = yield* target(request.session, request.instance)
          const decode = Schema.decodeUnknownEffect(codecOf(found.message))
          const messages = yield* Effect.forEach(
            request.messages,
            (message, index) =>
              Effect.mapError(
                decode(message),
                (error) =>
                  "Message " + index + " does not decode: " + error.message
              )
          )
          const deadline = Date.now() + request.within
          const outcomes: Array<Control.Outcome> = []
          for (const message of messages) {
            const left = deadline - Date.now()
            if (left <= 0) break
            const outcome = yield* found.dispatch(message).pipe(
              Effect.timeoutOrElse({
                duration: left,
                orElse: () => Effect.succeed({ _tag: "Unknown" } as const)
              })
            )
            outcomes.push(outcome)
            if (outcome._tag !== "Updated") break
          }
          const paused = controller.paused()
          return {
            outcomes,
            paused: paused?.session === request.session ? paused.seq : null
          }
        })
      case "Find":
        return Effect.suspend(() => {
          const root = controller.roots.get(request.session)
          if (root === undefined) return Effect.fail(noRoot(request.session))
          let elements: NodeListOf<Element>
          try {
            elements = document.querySelectorAll(request.selector)
          } catch {
            return Effect.fail("Invalid CSS selector: " + request.selector)
          }
          const matches: Array<Json> = []
          let total = 0
          BrowserHost.instancesAt(root, elements).forEach((found, index) => {
            if (found === undefined || ++total > maxMatches) return
            matches.push({ ...matchOf(elements[index]!, found), index })
          })
          return Effect.succeed({ total, matches })
        })
    }
  }
}

export const connect = (
  url: string,
  controller: Controller
): Effect.Effect<void, never, Scope.Scope | Socket.WebSocketConstructor> => {
  const handle = makeHandler(controller)

  const connection = Effect.gen(function*() {
    const socket = yield* Socket.makeWebSocket(url)
    const writer = yield* socket.writer
    const pull = yield* Socket.readerString(socket)
    const send = (message: Control.ToServer) =>
      writer.write(Control.encodeToServer(message))
    const state = Effect.suspend(() =>
      send({
        _tag: "State",
        sessions: Array.from(controller.roots.keys()),
        paused: controller.paused() ?? null,
        notRecording: controller.notRecording(),
        picks: controller.picks()
      })
    )
    yield* state
    yield* controller.changes.pipe(
      Stream.runForEach(() => state),
      Effect.ignore,
      Effect.forkScoped
    )
    return yield* Effect.forever(
      Effect.flatMap(pull, (chunks) =>
        Effect.forEach(chunks, (chunk) => {
          const decoded = Control.decodeToPage(chunk)
          if (decoded._tag === "None") return Effect.void
          const message = decoded.value
          return handle(message.request).pipe(
            Effect.matchEffect({
              onSuccess: (value) =>
                send({ _tag: "Reply", id: message.id, ok: true, value }),
              onFailure: (value) =>
                send({ _tag: "Reply", id: message.id, ok: false, value })
            }),
            Effect.ignore,
            Effect.forkScoped
          )
        }, { discard: true }))
    )
  }).pipe(Effect.scoped)

  return connection.pipe(
    Effect.retry(
      Schedule.min([
        Schedule.exponential("200 millis"),
        Schedule.spaced("5 seconds")
      ])
    ),
    Effect.forever,
    Effect.ignore,
    Effect.forkScoped,
    Effect.asVoid
  )
}
