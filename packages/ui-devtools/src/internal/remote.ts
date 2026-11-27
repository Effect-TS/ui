import type * as BrowserHost from "@effect/ui/html/BrowserHost"
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
    ? definitions[schema.$ref.slice(schema.$ref.lastIndexOf("/") + 1)]
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

// Bounds the padding for minLength and the items for minItems.
const most = 64

const placeholder: Json = Object.freeze({ "~redacted": true })

const holdsPlaceholder = (value: Json): boolean =>
  value === placeholder ||
  (typeof value === "object" && value !== null &&
    Object.values(value).some(holdsPlaceholder))

// The redacting codec's encoding of a `Schema.Redacted`.
const isPlaceholderSchema = (schema: Json | undefined): boolean =>
  isObject(schema) && isObject(schema.properties) &&
  Object.keys(schema.properties).length === 1 &&
  literalOf(schema.properties["~redacted"]) === true

const at = (schema: Json | undefined, key: string): Json | undefined =>
  isObject(schema) ? schema[key] : undefined

const nth = (list: Json | undefined, i: number): Json | undefined =>
  Array.isArray(list) ? list[i] : undefined

interface Document {
  readonly schema: Json
  readonly definitions: Record<string, Json>
}

// Stands in for a redacting node the walk lost track of.
const lost: Json = Object.freeze({})

/** What `exampleOf` returns when a value may hold a secret it couldn't mark. */
const unmasked: Json = Object.freeze({})

const valueKeys = new Set(["const", "enum", "examples", "default"])

/**
 * A value for a JSON Schema, or `undefined` when none is found: a constant,
 * an example, or the smallest value of its type, preferring the first union
 * member that has one and one item in an array. A `$ref` already being
 * walked has none, so a recursive type stops at an empty array or a `None`.
 *
 * `redacted` is the same node in the redacting codec's document. The walk
 * follows it alongside and puts `placeholder` where it has a
 * `Schema.Redacted`, so the value is the plain one with the placeholders in.
 * When a value comes from a node whose redacting side holds a placeholder the
 * walk can't reach, such as an `examples` annotation above a
 * `Schema.Redacted`, it returns `unmasked`.
 */
const exampleOf = (
  root: Json,
  definitions: Record<string, Json>,
  redacted?: Document
): Json | undefined => {
  const open = new Set<string>()
  let missed = false
  const masks = (node: Json | undefined, seen: Set<string>): boolean => {
    if (node === lost) return true
    if (redacted === undefined) return false
    if (Array.isArray(node)) return node.some((item) => masks(item, seen))
    if (!isObject(node)) return false
    if (typeof node.$ref === "string") {
      if (seen.has(node.$ref)) return false
      seen.add(node.$ref)
      return masks(resolve(node, redacted.definitions), seen)
    }
    return isPlaceholderSchema(node) ||
      Object.keys(node).some((key) =>
        !valueKeys.has(key) && masks(node[key], seen)
      )
  }
  const walk = (schema: Json, shadow: Json | undefined): Json | undefined => {
    if (redacted !== undefined) shadow = resolve(shadow, redacted.definitions)
    if (
      isPlaceholderSchema(shadow) &&
      JSON.stringify(schema) !== JSON.stringify(shadow)
    ) {
      return walk(schema, undefined) === undefined ? undefined : placeholder
    }
    const leaf = (value: Json | undefined) => {
      if (value !== undefined && masks(shadow, new Set())) missed = true
      return value
    }
    const sub = (node: Json | undefined) =>
      node === undefined && masks(shadow, new Set()) ? lost : node
    if (schema === true) return leaf(null)
    if (!isObject(schema)) return undefined
    if (typeof schema.$ref === "string") {
      const name = schema.$ref.slice(schema.$ref.lastIndexOf("/") + 1)
      if (open.has(name) || definitions[name] === undefined) return undefined
      open.add(name)
      const out = walk(definitions[name], shadow)
      open.delete(name)
      return out
    }
    if ("const" in schema) return leaf(schema.const)
    if (Array.isArray(schema.enum)) return leaf(schema.enum[0])
    if (Array.isArray(schema.examples) && schema.examples.length > 0) {
      return leaf(schema.examples[0])
    }
    if ("default" in schema) return leaf(schema.default)
    const members = schema.anyOf ?? schema.oneOf
    if (Array.isArray(members)) {
      const shadows = at(shadow, "anyOf") ?? at(shadow, "oneOf")
      for (let i = 0; i < members.length; i++) {
        const out = walk(members[i], sub(nth(shadows, i)))
        if (out !== undefined) return out
      }
      return undefined
    }
    if (Array.isArray(schema.allOf)) {
      const merge = (node: Json | undefined) => {
        if (!isObject(node) || !Array.isArray(node.allOf)) return node
        const { allOf, ...rest } = node
        return Object.assign(rest, ...allOf)
      }
      return walk(merge(schema)!, sub(merge(shadow)))
    }
    if (isObject(schema.not)) return undefined
    const number = (key: string) =>
      typeof schema[key] === "number" ? schema[key] : undefined
    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
    switch (type) {
      case "string":
        return leaf("a".repeat(Math.min(number("minLength") ?? 0, most)))
      case "number":
      case "integer": {
        let out = Math.max(0, number("minimum") ?? -Infinity)
        const above = number("exclusiveMinimum")
        if (above !== undefined && out <= above) out = above + 1
        out = Math.min(out, number("maximum") ?? Infinity)
        const below = number("exclusiveMaximum")
        if (below !== undefined && out >= below) out = below - 1
        return leaf(out)
      }
      case "boolean":
        return leaf(false)
      case "null":
        return leaf(null)
      case "array": {
        const out: Array<Json> = []
        const prefix = Array.isArray(schema.prefixItems)
          ? schema.prefixItems
          : []
        for (let i = 0; i < prefix.length; i++) {
          const value = walk(prefix[i], sub(nth(at(shadow, "prefixItems"), i)))
          if (value === undefined) return undefined
          out.push(value)
        }
        const minItems = number("minItems") ?? 0
        // Past the cap the decoder reports the length, not this walk.
        const length = Math.min(
          Math.max(out.length + 1, minItems),
          number("maxItems") ?? Infinity,
          out.length + most
        )
        const item = schema.items === undefined ? true : schema.items
        while (out.length < length) {
          const value = walk(item, sub(at(shadow, "items")))
          if (value === undefined) {
            return out.length < minItems ? undefined : out
          }
          out.push(value)
        }
        return out
      }
      case "object": {
        const out: Record<string, Json> = {}
        const required = Array.isArray(schema.required) ? schema.required : []
        const properties = isObject(schema.properties) ? schema.properties : {}
        for (const key of Object.keys(properties)) {
          const value = walk(
            properties[key],
            sub(at(at(shadow, "properties"), key))
          )
          if (value !== undefined) out[key] = value
          else if (required.includes(key)) return undefined
        }
        if (
          Object.keys(properties).length === 0 &&
          isObject(schema.additionalProperties)
        ) {
          const value = walk(
            schema.additionalProperties,
            sub(at(shadow, "additionalProperties"))
          )
          if (value !== undefined) out.key = value
        }
        return out
      }
      default:
        return leaf(null)
    }
  }
  const out = walk(root, redacted?.schema)
  return missed && out !== undefined ? unmasked : out
}

const documentOf = (schema: Schema.Top): Document =>
  Schema.toJsonSchemaDocument(
    Schema.toCodecJson(schema)
  ) as unknown as Document

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
    const redactedSchema = MessageLog.redactSchema(schema)
    const redacted = redactedSchema === schema
      ? undefined
      : documentOf(redactedSchema)
    const redactedMembers = redacted === undefined ? [] : membersOf(redacted)
    const codec = Schema.toCodecJson(schema as Schema.Codec<unknown>)
    const decode = Schema.decodeUnknownEffect(codec)
    const encode = Schema.encodeUnknownEffect(codec)
    const encodeRedacted = Schema.encodeUnknownEffect(
      Schema.toCodecJson(redactedSchema as Schema.Codec<unknown>)
    )
    const example = (i: number): Effect.Effect<Json> => {
      const none = (invalid: string) =>
        Effect.succeed({
          ...(typeof tags[i] === "string" ? { tag: tags[i] } : {}),
          invalid
        })
      const message = exampleOf(members[i], document.definitions)
      if (message === undefined) return none("No value fits this schema.")
      // Without a decoded value to encode, the walk follows the redacting
      // document beside the plain one to place the placeholders.
      const walked = (
        status: { invalid?: string }
      ): Effect.Effect<Json> => {
        if (redacted === undefined) {
          return Effect.succeed({ message, ...status })
        }
        const shown = exampleOf(members[i], document.definitions, {
          schema: redactedMembers[i],
          definitions: redacted.definitions
        })!
        return shown === unmasked
          ? none(
            "No safe example: a Schema.Redacted's value here comes from an " +
              "example, default or literal that can't be redacted."
          )
          : Effect.succeed({
            message: shown,
            ...(holdsPlaceholder(shown) ? { redacted: true } : {}),
            ...status
          })
      }
      return decode(message, { errors: "all" }).pipe(
        Effect.matchEffect({
          onFailure: (error) => walked({ invalid: error.message }),
          // The log's codec marks each Schema.Redacted in the decoded value,
          // whichever branch supplied it.
          onSuccess: (value) =>
            redacted === undefined
              ? Effect.succeed({ message })
              : Effect.all([encode(value), encodeRedacted(value)]).pipe(
                Effect.map(([plain, shown]): Json =>
                  JSON.stringify(plain) === JSON.stringify(shown)
                    ? { message }
                    : { message: shown as Json, redacted: true }
                ),
                Effect.catch(() => walked({}))
              )
        })
      )
    }
    return tag === undefined
      ? Effect.map(
        Effect.forEach(members, (_, i) => example(i)),
        (examples) => ({
          schema: document.schema,
          definitions: document.definitions,
          examples
        })
      )
      : Effect.map(example(index), (entry) => ({
        schema: members[index],
        definitions: document.definitions,
        examples: [entry]
      }))
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
          const decode = Schema.decodeUnknownEffect(
            Schema.toCodecJson(found.message as Schema.Codec<unknown>)
          )
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
        notRecording: controller.notRecording()
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
