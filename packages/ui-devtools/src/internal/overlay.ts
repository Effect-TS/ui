import { Tabs } from "@effect/ui-kit/Tabs"
import { VirtualList, VirtualListScrollTarget } from "@effect/ui-kit/VirtualList"
import * as Command from "@effect/ui/Command"
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as MessageLog from "@effect/ui/MessageLog"
import * as Renderer from "@effect/ui/Renderer"
import * as Subscription from "@effect/ui/Subscription"
import * as UiSchema from "@effect/ui/UiSchema"
import type * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Inspector from "../Inspector.ts"
import * as Read from "./read.ts"

export interface Feed {
  readonly inspector: Inspector.Inspector
  readonly origin: (session: string) => number | undefined
  readonly changes: Stream.Stream<void>
}

const FeedSchema = Schema.declare(
  (u: unknown): u is Feed => Predicate.hasProperty(u, "inspector") && Predicate.hasProperty(u, "changes")
)

const Filter = Schema.Literals(["messages", "commands", "all"])

const OverlayProps = Schema.Struct({ feed: FeedSchema })

type OverlayProps = typeof OverlayProps.Type

const OverlayModel = Schema.Struct({
  open: Schema.Boolean,
  revision: Schema.Number,
  selected: Schema.NullOr(Schema.Number),
  filter: Filter,
  instance: Schema.NullOr(Schema.Number),
  tab: Schema.String,
  copied: Schema.NullOr(Schema.Number),
  pinned: Schema.Boolean,
  atStart: Schema.Boolean,
  reveal: Schema.NullOr(Schema.Number),
  pins: Schema.Number
})

type OverlayModel = typeof OverlayModel.Type

const OverlayMessage = UiSchema.TaggedEnum({
  ReceivedFrames: {},
  ClickedOpen: {},
  ClickedClose: {},
  ClickedEntry: { seq: Schema.Number },
  ClickedLink: { seq: Schema.Number },
  ClickedInstance: { instance: Schema.Number },
  ClickedFilter: { filter: Filter },
  ClickedFollowLatest: {},
  ScrolledTimeline: { atStart: Schema.Boolean },
  SelectedTab: { value: Schema.String },
  ClickedCopyFrame: { seq: Schema.Number, text: Schema.String },
  SucceededCopyFrame: { seq: Schema.Number },
  FailedCopyFrame: {}
})

type OverlayMessage = typeof OverlayMessage.Type

const CopyButton = Html.ref("DevToolsCopyFrame", "button")

const CopyFrame = Command.make(
  "devtools/CopyFrame",
  { args: { seq: Schema.Number, text: Schema.String } },
  ({ seq, text }) =>
    Renderer.Refs.use((refs) => refs.lookup(CopyButton)).pipe(
      Effect.flatMap((button) =>
        Effect.tryPromise(() => {
          const clipboard = Option.getOrUndefined(button)?.ownerDocument.defaultView?.navigator.clipboard
          return clipboard === undefined ? Promise.reject() : clipboard.writeText(text)
        })
      ),
      Effect.match({
        onSuccess: () => OverlayMessage.SucceededCopyFrame({ seq }),
        onFailure: () => OverlayMessage.FailedCopyFrame()
      })
    )
)

type Children = View.Children<OverlayMessage, never>
type H = View.Helper<OverlayMessage, OverlayProps> & View.Tags<Html.Elements, OverlayMessage>
type Session = Inspector.Session
type Entry = Read.Entry
type Ref = Read.Ref

const filters: ReadonlyArray<readonly [Read.Filter, string]> = [
  ["messages", "Messages"],
  ["commands", "Commands"],
  ["all", "Everything"]
]

const ms = (value: number) => Math.round(value) + " ms"

const toneClass = (tone: Read.Tone | undefined) => tone === undefined ? null : "tone-" + tone

const SeqLink = (h: H, ref: Ref) =>
  ref.entry._tag === "Outside"
    ? h.span.class("ref", "outside").attr("title", "Outside the inspector's buffer").children("#" + ref.seq)
    : h.button.class("ref").attr("aria-label", "Go to #" + ref.seq + " " + Read.summaryOf(ref.entry))
      .onClick(OverlayMessage.ClickedLink({ seq: ref.seq })).children("#" + ref.seq)

const Json = (h: H, value: Schema.Json | undefined): Children => {
  if (value === undefined) return []
  if (MessageLog.isPlaceholder(value)) return [Placeholder(h, value)]
  if (value === null) return [h.span.class("t-kw").children("null")]
  if (typeof value === "string") return [h.span.class("t-str").children(JSON.stringify(value))]
  if (typeof value === "number") return [h.span.class("t-num").children(String(value))]
  if (typeof value === "boolean") return [h.span.class("t-kw").children(String(value))]
  if (Array.isArray(value)) {
    return [
      h.span.class("t-punct").children("["),
      ...value.flatMap((item, index) => [
        ...(index === 0 ? [] : [h.span.class("t-punct").children(", ")]),
        ...Json(h, item)
      ]),
      h.span.class("t-punct").children("]")
    ]
  }
  const keys = Object.keys(value)
  if (keys.length === 0) return [h.span.class("t-punct").children("{}")]
  return [
    h.span.class("t-punct").children("{ "),
    ...keys.flatMap((key, index) => [
      ...(index === 0 ? [] : [h.span.class("t-punct").children(", ")]),
      h.span.class("t-key").children(key + ": "),
      ...Json(h, (value as Schema.JsonObject)[key])
    ]),
    h.span.class("t-punct").children(" }")
  ]
}

const Placeholder = (h: H, value: MessageLog.Placeholder) =>
  "~redacted" in value
    ? h.span.class("placeholder").attr("title", "Redacted by the encoder: the value never left the app")
      .children("redacted")
    : "~truncated" in value
    ? h.span.class("placeholder").attr("title", "Over maxEntryBytes").children(
      "truncated, " + value["~truncated"] + " bytes"
    )
    : h.span.class("placeholder").attr("title", "No JSON form").children(
      "unserialisable " + value["~unserialisable"]
    )

const sessionOf = (feed: Feed): Session | undefined => {
  const sessions = feed.inspector.sessions()
  return sessions[sessions.length - 1]
}

const Header = (h: H, session: Session | undefined, count: number, model: OverlayModel) => {
  const following = model.selected === null && model.pinned
  return h.header.class("bar").children(
    h.h2.class("title").children("Effect UI inspector"),
    session?.app === undefined ? null : h.span.class("app").children(session.app),
    h.span.class("spacer"),
    h.span.class("count").children(count === 1 ? "1 entry" : count + " entries"),
    h.button.class("follow", following && "on").attr("aria-pressed", String(following))
      .onClick(OverlayMessage.ClickedFollowLatest()).children("Follow latest"),
    h.button.class("close").attr("aria-label", "Close the inspector").onClick(OverlayMessage.ClickedClose())
      .children("✕")
  )
}

const Instances = (
  h: H,
  session: Session,
  instances: ReadonlyArray<Inspector.Instance>,
  model: OverlayModel,
  owner: number | undefined
) =>
  h.section.class("instances").attr("aria-label", "Instances").children(
    h.h3.class("heading").children("Instances"),
    h.ul.children(
      instances.map((instance) =>
        h.li.key(String(instance.instance)).children(
          h.button.class("irow", model.instance === instance.instance && "on", owner === instance.instance && "owner")
            .attr("aria-pressed", String(model.instance === instance.instance))
            .attr("aria-current", owner === instance.instance ? "true" : undefined)
            .attr("data-instance", Read.nameOf(instance.path))
            .attr("title", "Show only " + Read.nameOf(instance.path) + "'s entries")
            .attr("style", "padding-left:" + (20 + Read.depthOf(instance.path) * 14) + "px")
            .onClick(OverlayMessage.ClickedInstance({ instance: instance.instance }))
            .children(
              h.span.class("iname").children(Read.nameOf(instance.path)),
              h.span.class("status").children(
                Read.statusesOf(session, instance).flatMap((status, index) => [
                  index === 0 ? null : ", ",
                  h.span.class(toneClass(status.tone)).children(status.text)
                ])
              )
            )
        )
      )
    )
  )

const Filters = (h: H, model: OverlayModel) =>
  h.div.class("filters").attr("role", "group").attr("aria-label", "Show in the timeline").children(
    filters.map(([filter, label]) =>
      h.button.key(filter).class("filter", model.filter === filter && "on").attr(
        "aria-pressed",
        String(model.filter === filter)
      )
        .onClick(OverlayMessage.ClickedFilter({ filter })).children(label)
    )
  )

const scrollOf = (model: OverlayModel, keys: ReadonlyArray<string>) =>
  model.reveal !== null
    ? {
      scrollTo: {
        target: VirtualListScrollTarget.Key({ key: String(model.reveal) }),
        align: "nearest" as const,
        id: "reveal:" + model.pins
      }
    }
    : model.pinned
    ? { scrollTo: { target: VirtualListScrollTarget.Offset({ offset: 0 }), id: (keys[0] ?? "") + ":" + model.pins } }
    : {}

const Timeline = (
  h: H,
  session: Session,
  model: OverlayModel,
  timeline: ReadonlyArray<Entry>,
  hidden: number,
  selected: number | undefined,
  chain: ReadonlySet<number>
) => {
  const keys = timeline.map((entry) => String(entry.seq))
  const railed = timeline.map((entry) => chain.has(entry.seq))
  const first = railed.indexOf(true)
  const last = railed.lastIndexOf(true)
  return VirtualList(h, {
    props: {
      keys,
      itemSize: 28,
      measure: false,
      initialCount: 40,
      dataset: model.filter + ":" + model.instance,
      ...scrollOf(model, keys)
    },
    onEmit: { Scrolled: ({ atStart }) => OverlayMessage.ScrolledTimeline({ atStart }) },
    view: (list) =>
      list.viewport(h.div.class("timeline").attr("aria-label", "Timeline, newest first")).children(
        list.list(h.div.class("rows")).children(
          list.items.map((index) => {
            const entry = timeline[index]!
            const label = Read.rowOf(session, entry)
            const rail = first === last || index < first || index > last
              ? null
              : index === first
              ? "top"
              : index === last
              ? "bot"
              : "mid"
            return list.item({
              element: h.div.key(keys[index]!).class(
                "row",
                entry.seq === selected && "selected",
                railed[index] && "linked"
              ),
              index
            }).attr("data-seq", String(entry.seq)).attr("data-tag", entry._tag).children(
              h.span.class("rail", rail).attr("aria-hidden", "true"),
              h.button.class("row-button").attr("aria-label", "#" + entry.seq + " " + Read.summaryOf(entry))
                .attr("aria-current", entry.seq === selected ? "true" : undefined)
                .onClick(OverlayMessage.ClickedEntry({ seq: entry.seq })).children(
                  h.span.class("seq").children(String(entry.seq)),
                  h.span.class("mark", toneClass(label.tone)).attr("aria-hidden", "true").children(
                    label.tone === "bad" ? "×" : label.tone === "open" ? "◌" : ""
                  ),
                  h.span.class("label").children(
                    label.text,
                    label.detail === undefined ? null : h.span.class("verb", toneClass(label.tone)).children(
                      " " + label.detail
                    )
                  ),
                  h.span.class("who").children("path" in entry ? Read.nameOf(entry.path) : "")
                )
            )
          })
        ),
        hidden === 0 ? null : h.p.class("hidden-note").children(
          (hidden === 1 ? "1 lifecycle entry" : hidden + " lifecycle entries") + " hidden. ",
          h.button.onClick(OverlayMessage.ClickedFilter({ filter: "all" })).children(
            hidden === 1 ? "Show it" : "Show them"
          )
        )
      )
  })
}

const sourceText = (source: Read.Source): string => {
  switch (source._tag) {
    case "DomEvent":
      return JSON.stringify(source.name) + " event"
    case "Command":
      return "Result of " + source.name
    case "Subscription":
      return "Subscription " + Read.subscriptionText(source)
    case "Query":
      return "Query " + source.name
    case "Emit":
      return "Emitted by " + source.path
    case "Failure":
      return "Failure of " + source.path
    case "Send":
      return "Sent from " + source.path
    case "Shared":
      return "Shared " + source.name + " of " + source.path
    case "Mount":
      return "Mount " + source.name
    case "Collected":
      return "Collected reports"
    case "Dispatch":
      return "Dispatched from outside the tree"
  }
}

const Label = (h: H, entry: Entry | Inspector.Outside, strong = false): Children => {
  if (entry._tag === "Outside") return []
  const label = Read.labelOf(entry)
  return [
    strong ? h.strong.children(label.text) : label.text,
    label.detail === undefined ? null : h.span.class("muted", toneClass(label.tone)).children(" " + label.detail)
  ]
}

const RefSummary = (h: H, ref: Ref): Children =>
  ref.entry._tag === "Outside"
    ? [SeqLink(h, ref), h.span.class("muted").children(" outside the buffer")]
    : [...Label(h, ref.entry), " ", SeqLink(h, ref)]

const Stopped = (h: H, refs: ReadonlyArray<Ref>): Children =>
  refs.length === 0
    ? []
    : [h.span.class("muted").children(", stopped "), ...refs.flatMap((ref) => [SeqLink(h, ref), " "])]

type Tone = "this" | Read.Tone

const Step = (h: H, step: Read.Step, body: Children, tone?: Tone, extra?: Children) =>
  h.li.class("step", tone === undefined ? null : "step-" + tone).attr("data-step", step._tag).attr(
    "data-index",
    step._tag === "Command" ? String(step.index) : undefined
  ).children(
    h.span.class("node").attr("aria-hidden", "true"),
    h.div.class("what").children(...body),
    extra === undefined ? null : h.div.class("args").children(...extra)
  )

const endText = (end: Entry | Inspector.Outside): string => {
  switch (end._tag) {
    case "CommandEnded":
      return "Ended"
    case "CommandInterrupted":
      return Read.interruption(end.reason).replace("i", "I")
    case "CommandDropped":
      return "Dropped on the server"
    case "Failed":
      return "Failed in " + end.in
    default:
      return "Ended"
  }
}

const linkText: { readonly [what: string]: string } = {
  causedBy: "Caused by",
  "issued by": "Issued by",
  source: "Result of",
  started: "Started from"
}

const Chain = (h: H, steps: ReadonlyArray<Read.Step>) =>
  h.ol.class("chain").attr("aria-label", "Causal chain").children(
    steps.map((step, index) => {
      switch (step._tag) {
        case "Source":
          return Step(h, step, [
            sourceText(step.source),
            ...(step.link === undefined ? [] : [" ", SeqLink(h, step.link)])
          ])
        case "Link":
          return Step(h, step, [linkText[step.what] ?? step.what, " ", ...RefSummary(h, step.ref)])
        case "Entry":
          return Step(
            h,
            step,
            [
              ...Label(h, step.ref.entry, step.selected),
              " ",
              step.selected ? h.span.class("muted").children("this entry") : SeqLink(h, step.ref),
              ...Stopped(h, step.stopped ?? [])
            ],
            step.selected ? "this" : undefined
          )
        case "Command":
          return step.command._tag === "Interrupt"
            ? Step(h, step, [
              "Interrupt " + step.command.name,
              step.command.group === null ? null : h.span.class("muted").children(" " + step.command.group),
              ...Stopped(h, step.stopped)
            ])
            : Step(h, step, ["Issued " + step.command.name], undefined, Json(h, step.command.args))
        case "Started":
          return Step(h, step, ["Started ", SeqLink(h, step.ref)], step.selected ? "this" : undefined)
        case "NotStarted":
          return Step(
            h,
            step,
            [step.ended ? "Stopped before it started" : "Waiting to start"],
            step.ended ? undefined : "open"
          )
        case "Result":
          return Step(h, step, ["Result ", ...RefSummary(h, step.ref)])
        case "Running":
          return Step(
            h,
            step,
            step.since === undefined
              ? ["Not started yet"]
              : ["Still running since ", SeqLink(h, step.since), h.span.class("muted").children(", no end logged yet")],
            "open"
          )
        case "End": {
          const end = step.ref.entry
          const bad = end._tag === "CommandInterrupted" || end._tag === "CommandDropped" || end._tag === "Failed"
          const next = steps[index + 1]
          return Step(
            h,
            step,
            [
              endText(end),
              step.after === undefined ? "" : " after " + ms(step.after),
              " ",
              SeqLink(h, step.ref),
              end._tag === "Failed" ? h.span.class("muted").children(", which failed its instance") : null,
              ...(next?._tag === "CausedBy" ? [h.span.class("cause").children(" by ", ...RefSummary(h, next.ref))] : [])
            ],
            bad ? "bad" : step.selected ? "this" : undefined
          )
        }
        case "CausedBy":
          return steps[index - 1]?._tag === "End"
            ? null
            : Step(h, step, ["Caused by ", ...RefSummary(h, step.ref)])
        case "Names":
          return Step(h, step, [
            "Linked from ",
            ...step.links.flatMap((link, at) => [
              at === 0 ? null : ", ",
              ...Label(h, link.entry),
              " ",
              SeqLink(h, { seq: link.seq, entry: link.entry }),
              h.span.class("muted").children(" (" + link.rel + ")")
            ])
          ])
      }
    })
  )

const treeRow = (h: H, row: Read.Row) => {
  const change = row.change
  const kind = change?.kind === "unknown" ? undefined : change?.kind
  return h.div.key(row.id).class("tl", kind !== undefined && "chg").attr(
    "style",
    "padding-left:" + (row.depth * 16 + 12) + "px"
  ).attr("data-change", kind).children(
    h.span.class("k").children(row.key === undefined ? "" : String(row.key)),
    h.span.class("v").children(
      row.open ?? row.close ?? null,
      ...(kind === "changed"
        ? [
          h.del.class("old").children(...Json(h, change!.before)),
          h.span.class("arrow").attr("aria-hidden", "true").children(" → "),
          h.ins.class("new").children(...Json(h, change!.after))
        ]
        : row.open === undefined && row.close === undefined
        ? Json(h, row.value)
        : []),
      kind === "added" || kind === "removed" ? h.span.class("muted").children(" " + kind) : null
    )
  )
}

const Tree = (h: H, value: Schema.Json, changes: ReadonlyArray<Inspector.Change>) =>
  h.div.class("tree").children(Read.treeOf(value, changes).map((row) => treeRow(h, row)))

const VirtualTree = (h: H, label: string, dataset: string, rows: ReadonlyArray<Read.Row>) =>
  VirtualList(h, {
    props: { keys: rows.map((row) => row.id), itemSize: 22, initialCount: 60, dataset },
    view: (list) =>
      list.viewport(h.div.class("tree", "scroll").attr("aria-label", label)).children(
        list.list(h.div).children(
          list.items.map((index) => list.item({ element: treeRow(h, rows[index]!), index }))
        )
      )
  })

const propsText = {
  same: "Same as ",
  changed: "Changed since ",
  unknown: "Redacted parts can't be compared with "
}

const runText = (run: Inspector.Record) =>
  run.end !== undefined
    ? run.reason === "ended"
      ? "ended"
      : run.reason === "failed"
      ? "failed"
      : run.reason === "server"
      ? "dropped on the server"
      : Read.interruption(run.reason ?? "interrupt")
    : run.start === undefined
    ? "not started"
    : "running"

const reasonText: { readonly [R in Inspector.Reason]: string } = {
  ended: "ended",
  completed: "completed",
  closed: "closed",
  ready: "ready",
  stopped: "stopped",
  failed: "failed",
  server: "dropped on the server",
  interrupt: "interrupted",
  switch: "interrupted (switch)",
  unmount: "interrupted (unmount)",
  layer: "interrupted (layer)",
  self: "interrupted (self)"
}

const recordWords: { readonly [K in Inspector.Record["kind"]]: readonly [kind: string, verb: string] } = {
  layer: ["Layer", "pending "],
  subscription: ["Subscription", "started "],
  mount: ["Mount", "started "],
  command: ["Command", "issued "]
}

const recordRow = (h: H, session: Session, record: Inspector.Record) => {
  const start = record.kind === "command" ? record.issued?.seq : record.start
  const startRef = start === undefined ? undefined : Read.refOf(session, start)
  const endRef = record.end === undefined ? undefined : Read.refOf(session, record.end)
  const startEntry = startRef?.entry
  const endEntry = endRef?.entry
  const took = startEntry !== undefined && startEntry._tag !== "Outside" && endEntry !== undefined &&
      endEntry._tag !== "Outside"
    ? endEntry.at - startEntry.at
    : 0
  const [kind, verb] = recordWords[record.kind]
  const what = record.kind === "subscription" && startEntry !== undefined && startEntry._tag === "SubscriptionStarted"
    ? Read.subscriptionText(startEntry)
    : record.name
  const derived = record.reason === "unmount" && endEntry !== undefined && endEntry._tag === "Unmounted"
  const tone: Read.Tone | undefined = record.end === undefined
    ? record.kind === "command" ? "open" : undefined
    : !derived && record.reason !== undefined && Read.reasonTone[record.reason] === "bad"
    ? "bad"
    : undefined
  return h.tr.key(record.kind + ":" + (start ?? record.name) + ":" + (record.issued?.index ?? "")).attr(
    "data-kind",
    record.kind
  ).children(
    h.th.attr("scope", "row").children(kind),
    h.td.children(what),
    h.td.children(
      verb,
      startRef === undefined ? "" : SeqLink(h, startRef),
      record.kind === "command" && record.start !== undefined
        ? h.span.children(", started ", SeqLink(h, Read.refOf(session, record.start)))
        : null
    ),
    h.td.class(toneClass(tone)).children(
      record.end === undefined
        ? record.kind === "command" ? record.start === undefined ? "not started" : "running" : "open"
        : derived
        ? h.span.children("closed by unmount ", SeqLink(h, endRef!))
        : h.span.children(
          reasonText[record.reason ?? "ended"],
          took >= 1 ? " after " + ms(took) : "",
          " ",
          SeqLink(h, endRef!)
        )
    )
  )
}

const Lifecycle = (h: H, session: Session, info: Inspector.Instance) => {
  const unmounted = info.unmounted === undefined ? undefined : session.resolve(info.unmounted)
  const cause = unmounted === undefined || unmounted._tag === "Outside" || unmounted.causedBy === undefined
    ? undefined
    : Read.refOf(session, unmounted.causedBy)
  return h.table.class("life").attr("aria-label", "Lifecycle of " + Read.nameOf(info.path)).children(
    h.tbody.children(
      h.tr.attr("data-kind", "instance").children(
        h.th.attr("scope", "row").children("Instance"),
        h.td.children(info.path),
        h.td.children(
          info.mounted === undefined
            ? "mounted before the buffer"
            : h.span.children("mounted ", SeqLink(h, Read.refOf(session, info.mounted)))
        ),
        h.td.class(info.unmounted === undefined ? null : "tone-bad").children(
          info.unmounted === undefined
            ? "mounted"
            : h.span.children(
              "unmounted ",
              SeqLink(h, Read.refOf(session, info.unmounted)),
              cause === undefined || cause.entry._tag === "Outside"
                ? ""
                : " by " + Read.labelOf(cause.entry).text
            )
        )
      ),
      session.records(info.instance).map((record) => recordRow(h, session, record))
    )
  )
}

const Details = (
  h: H,
  session: Session,
  entry: Entry,
  info: Inspector.Instance | undefined,
  frame: string,
  model: OverlayModel
) => {
  const state = entry._tag === "Update" || entry._tag === "Mounted" || entry._tag === "Waiting" ? entry : undefined
  const previous = state === undefined ? undefined : session.previous(entry.seq)
  const resolved = previous === undefined ? undefined : session.resolve(previous.seq)
  const before = resolved !== undefined && resolved._tag !== "Outside" && "model" in resolved ? resolved : undefined
  const unavailable = previous !== undefined && before === undefined
  const changes = state === undefined || before === undefined ? [] : Inspector.diff(before.model, state.model)
  const changed = changes.filter((change) => change.kind !== "unknown").length
  const propChanges = state === undefined || before === undefined ? [] : Inspector.diff(before.props, state.props)
  const commands = Read.isIssuing(entry) ? entry.commands : []
  const events = Read.isIssuing(entry) ? entry.events : []
  const name = "path" in entry ? Read.nameOf(entry.path) : "this instance"
  const Props = (): Children =>
    state === undefined ? [] : [
      h.h4.children(
        "Props",
        before === undefined ? null : h.span.class("muted").children(
          " · " + propsText[Read.statusOf(propChanges)],
          SeqLink(h, Read.refOf(session, before.seq))
        )
      ),
      Tree(h, state.props, propChanges)
    ]
  const sections = [
    ...(state === undefined ? [] : [{
      value: "model",
      label: "Model",
      count: unavailable
        ? "no diff"
        : previous === undefined
        ? undefined
        : changed === 1
        ? "1 change"
        : changed + " changes",
      element: h.div.class("pane", "model"),
      body: (): Children => [
        h.p.class("note").children(
          previous === undefined
            ? "First state of " + name
            : unavailable
            ? h.span.children(
              previous.changed === true ? "Changed since " : "No diff against ",
              SeqLink(h, Read.refOf(session, previous.seq)),
              ", which is outside the buffer"
            )
            : h.span.children(
              "Since ",
              SeqLink(h, Read.refOf(session, previous.seq)),
              ", the previous state of " + name
            )
        ),
        VirtualTree(h, "Model after #" + entry.seq, String(entry.seq), Read.treeOf(state.model, changes))
      ]
    }]),
    ...(entry._tag === "Update"
      ? [{
        value: "message",
        label: "Message",
        count: undefined,
        element: h.div.class("pane"),
        body: (): Children => [
          h.p.class("note").children("From " + sourceText(entry.source)),
          Tree(h, entry.message, []),
          ...Props()
        ]
      }]
      : state === undefined
      ? []
      : [{ value: "props", label: "Props", count: undefined, element: h.div.class("pane"), body: Props }]),
    ...(Read.isIssuing(entry)
      ? [{
        value: "commands",
        label: "Commands",
        count: commands.length === 0 ? undefined : String(commands.length),
        element: h.div.class("pane"),
        body: (): Children =>
          commands.length === 0
            ? [h.p.class("note").children("This entry issued no command.")]
            : [
              h.ol.class("commands").children(
                commands.map((command, index) => {
                  const run = command._tag === "Interrupt" ? undefined : session.run({ seq: entry.seq, index })
                  return h.li.key(String(index)).children(
                    h.div.children(
                      command._tag === "Interrupt" ? "Interrupt " + command.name : command.name,
                      run === undefined ? null : h.span.class("muted").children(" " + runText(run) + " "),
                      run?.end === undefined ? null : SeqLink(h, Read.refOf(session, run.end))
                    ),
                    h.div.class("args").children(
                      ...(command._tag === "Interrupt" ? [] : Json(h, command.args)),
                      command.group === null ? null : h.span.class("muted").children(" group " + command.group)
                    )
                  )
                })
              )
            ]
      }]
      : []),
    ...(events.length === 0 ? [] : [{
      value: "events",
      label: "Events",
      count: String(events.length),
      element: h.div.class("pane"),
      body: (): Children => [
        h.ol.class("commands").children(
          events.map((event, index) => h.li.key(String(index)).class("args").children(...Json(h, event)))
        )
      ]
    }]),
    ...(info === undefined ? [] : [{
      value: "lifecycle",
      label: "Lifecycle",
      count: undefined,
      element: h.div.class("pane"),
      body: (): Children => [Lifecycle(h, session, info)]
    }]),
    {
      value: "raw",
      label: "Raw",
      count: undefined,
      element: h.div.class("pane"),
      body: (): Children => [
        h.div.class("raw-head").children(
          h.p.class("note").children("The frame as the log encoded it"),
          h.button.class("copy").ref(CopyButton).onClick(
            OverlayMessage.ClickedCopyFrame({ seq: entry.seq, text: frame })
          ).children(model.copied === entry.seq ? "Copied" : "Copy frame")
        ),
        h.pre.class("raw").children(frame)
      ]
    }
  ]
  return Tabs(h, {
    props: {
      value: sections.some((section) => section.value === model.tab) ? model.tab : sections[0]!.value,
      tabs: sections.map(({ value }) => ({ value }))
    },
    onEmit: { Selected: ({ value }) => OverlayMessage.SelectedTab({ value }) },
    view: (t) =>
      t.root(h.div.class("details")).children(
        t.list(h.div.class("tabs").attr("aria-label", "Entry details")).children(
          ...sections.map((section) =>
            t.tab({
              element: h.button.class("tab").children(
                section.label,
                section.count === undefined ? null : h.small.children(" " + section.count)
              ),
              value: section.value
            })
          )
        ),
        ...sections.map((section) =>
          t.panel({ element: section.element, value: section.value })?.children(section.body())
        )
      )
  })
}

const Inspected = (
  h: H,
  feed: Feed,
  session: Session,
  entry: Entry,
  info: Inspector.Instance | undefined,
  steps: ReadonlyArray<Read.Step>,
  model: OverlayModel
) => {
  const label = Read.labelOf(entry)
  const origin = feed.origin(entry.session)
  const kind = entry._tag === "Update" ? "Update" : label.text === entry._tag ? "Entry" : entry._tag
  return [
    h.section.class("ehead").children(
      h.h3.class("headline").children(label.text, label.detail === undefined ? null : " " + label.detail),
      h.p.class("sub").children(
        kind + " #" + entry.seq,
        "path" in entry ? " on " + Read.nameOf(entry.path) : "",
        origin === undefined ? "" : ", " + ms(entry.at - origin) + " after start"
      ),
      Chain(h, steps)
    ),
    Details(h, session, entry, info, JSON.stringify(entry, null, 2), model)
  ]
}

const Panel = (h: H, model: OverlayModel) => {
  const feed = h.props.feed
  const session = sessionOf(feed)
  if (session === undefined) {
    return h.div.class("panel", "empty").attr("role", "dialog").attr("aria-label", "Effect UI inspector").children(
      h.span.class("grip").attr("aria-hidden", "true"),
      Header(h, undefined, 0, model),
      h.p.class("empty-note").children("Nothing logged yet. Entries appear here as the app runs.")
    )
  }
  const entries = session.entries()
  const instances = session.instances()
  const scoped = entries.filter((entry) => Read.matches(entry, "all", model.instance))
  const timeline = scoped.filter((entry) => Read.matches(entry, model.filter, null)).reverse()
  const hidden = model.filter === "messages" ? scoped.length - timeline.length : 0
  const selected = model.selected === null ? timeline[0] : session.resolve(model.selected)
  const entry = selected === undefined || selected._tag === "Outside" ? undefined : selected
  const steps = entry === undefined ? [] : Read.chainOf(session, entry)
  const owner = entry === undefined ? undefined : Read.instanceOf(entry)
  const shown = model.instance ?? owner
  return h.div.class("panel").attr("role", "dialog").attr("aria-label", "Effect UI inspector").children(
    h.span.class("grip").attr("aria-hidden", "true"),
    Header(h, session, entries.length, model),
    h.div.class("body").children(
      h.div.class("left").children(
        Instances(h, session, instances, model, owner),
        Filters(h, model),
        Timeline(h, session, model, timeline, hidden, selected?.seq, Read.chainSeqs(steps))
      ),
      h.div.class("right").children(
        entry === undefined
          ? h.section.class("ehead").children(
            h.h3.class("headline").children(selected === undefined ? "No entry" : "#" + selected.seq),
            h.p.class("sub").children(selected === undefined ? "Nothing matches the filter." : "Outside the buffer.")
          )
          : Inspected(h, feed, session, entry, instances.find((instance) => instance.instance === shown), steps, model)
      )
    )
  )
}

export const Overlay = Component.define({
  name: "DevToolsOverlay",
  scoped: false,
  props: OverlayProps,
  model: OverlayModel,
  message: OverlayMessage,
  elements: Html
}).make({
  init: () => ({
    open: false,
    revision: 0,
    selected: null,
    filter: "messages",
    instance: null,
    tab: "model",
    copied: null,
    pinned: true,
    atStart: true,
    reveal: null,
    pins: 0
  }),
  update: {
    ReceivedFrames: (model, _message, $) =>
      $.evolve({
        revision: (revision) => revision + 1,
        ...(model.reveal === null ? {} : { reveal: null, pinned: model.atStart, pins: (pins) => pins + 1 })
      }),
    ClickedOpen: (_model, _message, $) =>
      $.evolve({ open: true, pinned: true, atStart: true, reveal: null, pins: (pins) => pins + 1 }),
    ClickedClose: (_model, _message, $) => $.evolve({ open: false }),
    ClickedEntry: (model, { seq }, $) =>
      $.evolve({ selected: seq, ...(model.pinned ? { pins: (pins: number) => pins + 1 } : {}) }),
    ClickedLink: (_model, { seq }, $) =>
      $.evolve({ selected: seq, filter: "all", instance: null, pinned: false, reveal: seq, pins: (pins) => pins + 1 }),
    ClickedInstance: (model, { instance }, $) => $.evolve({ instance: model.instance === instance ? null : instance }),
    ClickedFilter: (_model, { filter }, $) => $.evolve({ filter }),
    ClickedFollowLatest: (_model, _message, $) =>
      $.evolve({ selected: null, pinned: true, reveal: null, pins: (pins) => pins + 1 }),
    ScrolledTimeline: (model, { atStart }, $) =>
      atStart
        ? model.reveal !== null || model.pinned
          ? $.evolve({ atStart })
          : $.evolve({ atStart, pinned: true, pins: (pins) => pins + 1 })
        : $.evolve({ atStart, pinned: false, reveal: null }),
    SelectedTab: (_model, { value }, $) => $.evolve({ tab: value }),
    ClickedCopyFrame: (_model, { seq, text }, $) => $.evolve({ copied: null }).run(CopyFrame.make({ seq, text })),
    SucceededCopyFrame: (_model, { seq }, $) => $.evolve({ copied: seq }),
    FailedCopyFrame: (_model, _message, $) => $.evolve({ copied: null })
  },
  subscriptions: (_model, props) => [
    Subscription.make("devtools/frames", props.feed.changes.pipe(Stream.map(() => OverlayMessage.ReceivedFrames())))
  ],
  view: (model, h) =>
    h.div.class("overlay").children(
      model.open
        ? Panel(h, model)
        : h.button.class("launcher").attr("aria-label", "Open the Effect UI inspector").onClick(
          OverlayMessage.ClickedOpen()
        )
          .children(
            "Effect UI",
            h.span.class("launcher-count").children(String(sessionOf(h.props.feed)?.entries().length ?? 0))
          )
    )
})
