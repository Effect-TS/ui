import type { FlowStep } from "#domain/FlowStep"
import { MessageLog } from "@effect/ui"
import { DialogEvents } from "@effect/ui-kit"
import { Context, Effect, Layer, Predicate, Queue, Schema, Stream } from "effect"

export class DialogTrace extends Context.Service<DialogTrace, {
  readonly steps: Stream.Stream<FlowStep>
}>()("launch/DialogTrace") {
  static readonly layer = Layer.unwrap(Effect.gen(function*() {
    const queue = yield* Queue.unbounded<FlowStep>()
    const log: MessageLog.MessageLog = {
      enabled: true,
      record: (entry) => {
        for (const flowStep of toSteps(entry)) Queue.offerUnsafe(queue, flowStep)
      }
    }
    return Layer.mergeAll(
      Layer.succeed(MessageLog.MessageLog, log),
      Layer.succeed(DialogTrace, { steps: Stream.fromQueue(queue) })
    )
  }))
}

const field = (value: unknown, name: string): unknown => Predicate.hasProperty(value, name) ? value[name] : undefined

const tagOf = (value: unknown): string => String(field(value, "_tag"))

const demoPath = (path: string): string | undefined => {
  const match = /\/DialogPage(\[[^\]]*\])?(?=\/|$)/.exec(path)
  return match === null ? undefined : path.slice(match.index).replaceAll("[]", "")
}

const pressCaptions: Record<string, string> = {
  ClickedTrigger: "You press the trigger. The press goes to the Dialog's own update, not the page's.",
  ClickedClose: "You press a close button. The Dialog's own update hears it first.",
  PressedEscape: "You press Escape. The Dialog's own update hears it first.",
  PressedOutside: "You press outside the popup. The Dialog's own update hears it first."
}

const pressLines: Record<string, string> = {
  ClickedTrigger: "dialog.trigger(",
  ClickedClose: "dialog.close(",
  PressedEscape: "dialog.portal(",
  PressedOutside: "dialog.backdrop("
}

const eventCaptions: Record<DialogEvents["_tag"], string> = {
  RequestedOpen: "The Dialog emits RequestedOpen. It doesn't open itself.",
  RequestedClose: "The Dialog emits RequestedClose. The page can refuse.",
  Settled: "The Dialog emits Settled: the transition finished. The page maps it to nothing."
}

const eventSteps = (events: ReadonlyArray<unknown>, where: string): Array<FlowStep> =>
  events.filter(Schema.is(DialogEvents)).map(({ _tag }) => ({
    kind: "event",
    at: "dialog",
    move: "up",
    name: _tag,
    where,
    caption: eventCaptions[_tag],
    line: `${_tag}: () =>`
  }))

const dialogState = (model: unknown): ReadonlyArray<string> => [
  `mounted: ${String(field(model, "mounted"))}`,
  `started: ${String(field(model, "started"))}`
]

const mountCaptions: Record<string, string> = {
  ShowedPortal: "The mount reports the <dialog> is showing. The Dialog records it in its own Model.",
  RenderedFirstFrame: "A frame later, data-starting-style comes off and the CSS transition runs.",
  FinishedTransition: "The mount saw the popup's transition finish."
}

export const toSteps = (entry: MessageLog.Entry): ReadonlyArray<FlowStep> => {
  if (!("path" in entry)) return []
  const where = demoPath(entry.path)
  if (where === undefined) return []
  const at = where.endsWith("/Dialog") ? "dialog" : "page"
  switch (entry._tag) {
    case "Update": {
      const name = tagOf(entry.message)
      if (at === "page") {
        const confirm = String(field(entry.model, "confirm"))
        return [{
          kind: "message",
          at,
          name,
          where,
          caption: `The page's onEmit turns the event into its own message, and its update sets confirm to ${confirm}.`,
          line: `${name}: (_model`,
          page: [`confirm: ${confirm}`]
        }]
      }
      const fromMount = entry.source._tag === "Mount"
      return [
        {
          kind: "message",
          at,
          name,
          where,
          caption: (fromMount ? mountCaptions[name] : pressCaptions[name]) ?? `The Dialog's update handles ${name}.`,
          line: fromMount ? (name === "ShowedPortal" ? "dialog.portal(" : "dialog.popup(") : pressLines[name],
          dialog: dialogState(entry.model),
          starts: !fromMount && entry.events.some(DialogEvents.is("RequestedOpen"))
        },
        ...eventSteps(entry.events, where)
      ]
    }
    case "PropsChanged": {
      const open = String(field(entry.props, "open"))
      return [{
        kind: "props",
        at,
        move: "down",
        name: `open: ${open}`,
        where,
        caption: `The page renders again and passes open: ${open} down. A prop change is a log entry, not a message.`,
        line: "props: { open: model.confirm }"
      }]
    }
    case "MountStarted":
      return [{
        kind: "mount",
        at,
        name: entry.name,
        where,
        caption:
          "The <dialog> is in the document now, so its mount starts. It does the focus, scroll lock and Escape work.",
        line: "dialog.portal("
      }]
    case "MountEnded":
      return [{
        kind: "mount",
        at,
        name: entry.name,
        where,
        caption: "The <dialog> leaves the document and its mount ends.",
        line: "dialog.portal("
      }]
    default:
      return []
  }
}
