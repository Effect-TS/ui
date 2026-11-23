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

const Filter = Schema.Literals(["all", "updates", "commands", "lifecycle"])

const OverlayProps = Schema.Struct({ feed: FeedSchema })

type OverlayProps = typeof OverlayProps.Type

const OverlayModel = Schema.Struct({
  open: Schema.Boolean,
  revision: Schema.Number,
  selected: Schema.NullOr(Schema.Number),
  filter: Filter,
  instance: Schema.NullOr(Schema.Number),
  tab: Schema.String,
  copied: Schema.NullOr(Schema.Number)
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

const filters: ReadonlyArray<readonly [Read.Filter, string]> = [
  ["all", "All entries"],
  ["updates", "Updates"],
  ["commands", "Commands"],
  ["lifecycle", "Lifecycle"]
]

const ms = (value: number) => Math.round(value) + "ms"

const clock = (feed: Feed, entry: Entry | Inspector.Outside) => {
  if (entry._tag === "Outside") return ""
  const origin = feed.origin(entry.session)
  return origin === undefined ? "" : "+" + ms(entry.at - origin)
}

const toneClass = (tone: Read.Tone) => "tone-" + tone

const SeqLink = (h: H, ref: Read.Ref) =>
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
      .children("(redacted)")
    : "~truncated" in value
    ? h.span.class("placeholder").attr("title", "Over maxEntryBytes").children(
      "(truncated " + value["~truncated"] + " bytes)"
    )
    : h.span.class("placeholder").attr("title", "No JSON form").children(
      "(unserialisable " + value["~unserialisable"] + ")"
    )

const sessionOf = (feed: Feed): Session | undefined => {
  const sessions = feed.inspector.sessions()
  return sessions[sessions.length - 1]
}

const timelineOf = (session: Session, model: OverlayModel): ReadonlyArray<Entry> =>
  session.entries().filter((entry) => Read.matches(entry, model.filter, model.instance)).reverse()

const selectedOf = (session: Session, model: OverlayModel, timeline: ReadonlyArray<Entry>) =>
  model.selected === null ? timeline[0] : session.resolve(model.selected)

const Header = (
  h: H,
  feed: Feed,
  session: Session | undefined,
  selected: Entry | Inspector.Outside | undefined,
  model: OverlayModel
) => {
  const entries = session?.entries() ?? []
  const last = entries[entries.length - 1]
  return h.header.class("bar").children(
    h.h2.class("title").children("Effect UI inspector"),
    session?.app === undefined ? null : h.span.class("chip").children(session.app),
    session === undefined ? null : h.span.class("chip").children("session " + session.id),
    h.span.class("spacer"),
    h.span.class("chip").children(
      entries.length + " entries" + (last === undefined ? "" : " · last #" + last.seq + " " + clock(feed, last))
    ),
    selected === undefined ? null : h.span.class("chip").children("Inspecting #" + selected.seq),
    h.button.class("chip", "button", model.selected === null && "on").attr(
      "aria-pressed",
      String(model.selected === null)
    )
      .onClick(OverlayMessage.ClickedFollowLatest()).children("Follow latest →"),
    h.span.class("chip", "dashed").children("read-only"),
    h.button.class("chip", "button").attr("aria-label", "Close the inspector").onClick(OverlayMessage.ClickedClose())
      .children("✕")
  )
}

const Instances = (h: H, session: Session, model: OverlayModel, owner: number | undefined) => {
  const instances = session.instances()
  const open = instances.filter((instance) => instance.unmounted === undefined).length
  return h.section.class("instances").attr("aria-label", "Instances").children(
    h.div.class("sect").children(
      h.span.children("Instances"),
      h.span.children(instances.length + " seen · " + open + " without Unmounted · click to filter")
    ),
    h.ul.class("instance-list").children(
      instances.map((instance) =>
        h.li.key(String(instance.instance)).children(
          h.button.class("irow", model.instance === instance.instance && "on", owner === instance.instance && "owner")
            .attr("aria-pressed", String(model.instance === instance.instance))
            .attr("aria-current", owner === instance.instance ? "true" : undefined)
            .attr("data-instance", Read.nameOf(instance.path))
            .attr("style", "padding-left:" + (12 + Read.depthOf(instance.path) * 14) + "px")
            .onClick(OverlayMessage.ClickedInstance({ instance: instance.instance }))
            .children(
              h.span.class("iname").children(
                Read.nameOf(instance.path),
                h.span.class("hash").children(" #" + instance.instance)
              ),
              h.span.class("badges").children(
                Read.badgesOf(session, instance).flatMap((badge, index) => [
                  index === 0 ? null : h.span.class("sep").children(" · "),
                  h.span.class("badge-text", toneClass(badge.tone)).children(
                    (badge.glyph === "" ? "" : badge.glyph + " ") + badge.text
                  )
                ])
              )
            )
        )
      )
    )
  )
}

const Filters = (h: H, model: OverlayModel) =>
  h.div.class("filters").attr("role", "group").attr("aria-label", "Filter entries").children(
    filters.map(([filter, label]) =>
      h.button.key(filter).class("seg", model.filter === filter && "on").attr(
        "aria-pressed",
        String(model.filter === filter)
      )
        .onClick(OverlayMessage.ClickedFilter({ filter })).children(label)
    )
  )

const Timeline = (
  h: H,
  feed: Feed,
  session: Session,
  model: OverlayModel,
  timeline: ReadonlyArray<Entry>,
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
      itemSize: 25,
      measure: false,
      initialCount: 40,
      dataset: model.filter + ":" + model.instance,
      ...(model.selected === null || selected === undefined
        ? {}
        : { scrollTo: { target: VirtualListScrollTarget.Key({ key: String(selected) }), align: "nearest" as const } })
    },
    view: (list) =>
      list.viewport(h.div.class("timeline").attr("aria-label", "Timeline, newest first")).children(
        list.list(h.div.class("rows")).children(
          list.items.map((index) => {
            const entry = timeline[index]!
            const previous = session.previous(entry.seq)
            const mark = Read.glyphOf(entry, previous?.changed)
            const label = Read.labelOf(entry)
            const rail = first === -1 || index < first || index > last
              ? ""
              : index === first && index === last
              ? "solo"
              : index === first
              ? "top"
              : index === last
              ? "bot"
              : "mid"
            return list.item({
              element: h.div.key(keys[index]!).class(
                "row",
                entry.seq === selected && "selected",
                railed[index] && "linked",
                Read.isRun(entry) || entry._tag === "Update" || entry._tag === "Failed" ? null : "life"
              ),
              index
            }).attr("data-seq", String(entry.seq)).attr("data-tag", entry._tag).children(
              h.span.class("rail", rail, railed[index] && "dot"),
              h.button.class("row-button").attr("aria-label", "#" + entry.seq + " " + Read.summaryOf(entry))
                .attr("aria-current", entry.seq === selected ? "true" : undefined)
                .onClick(OverlayMessage.ClickedEntry({ seq: entry.seq })).children(
                  h.span.class("seq").children(String(entry.seq)),
                  h.span.class("glyph", toneClass(mark.tone)).attr("aria-hidden", "true").children(mark.glyph),
                  h.span.class("label").children(
                    label.text,
                    label.detail === undefined ? null : h.i.children(" " + label.detail),
                    label.commands === undefined ? null : h.span.class("cmdn").children(label.commands + " cmd")
                  ),
                  h.span.class("inst").children("path" in entry ? Read.nameOf(entry.path) : ""),
                  h.span.class("time").children(clock(feed, entry))
                )
            )
          })
        )
      )
  })
}

const sourceText = (source: Extract<Entry, { readonly _tag: "Update" }>["source"]): string => {
  switch (source._tag) {
    case "DomEvent":
      return "DomEvent " + JSON.stringify(source.name)
    case "Command":
      return "Command " + source.name + " result"
    case "Subscription":
      return "Subscription " + Read.subscriptionText(source)
    case "Query":
      return "Query " + source.name
    case "Emit":
      return "Emit from " + source.path
    case "Failure":
      return "Failure of " + source.path
    case "Send":
      return "Send from " + source.path
    case "Shared":
      return "Shared " + source.name + " of " + source.path
    case "Mount":
      return "Mount " + source.name
    case "Collected":
      return "Collected reports"
    case "Dispatch":
      return "Dispatch from outside the tree"
  }
}

const Step = (
  h: H,
  what: string,
  body: Children,
  options: {
    readonly tone?: "this" | "stop" | "open" | undefined
    readonly dot?: Read.Tone | undefined
    readonly meta?: Children | undefined
    readonly indent?: boolean | undefined
  } = {}
) =>
  h.li.class("step", options.tone, options.indent && "indent").children(
    h.span.class("dot", toneClass(options.dot ?? "plain")).attr("aria-hidden", "true").children(
      options.tone === "stop" ? "×" : options.tone === "open" ? "◌" : options.indent ? "└" : "●"
    ),
    h.span.class("what").children(what),
    h.span.class("step-body").children(...body),
    h.span.class("meta").children(...(options.meta ?? []))
  )

const RefSummary = (h: H, ref: Read.Ref): Children => {
  if (ref.entry._tag === "Outside") return [SeqLink(h, ref), h.span.class("note").children(" outside the buffer")]
  const label = Read.labelOf(ref.entry)
  return [
    SeqLink(h, ref),
    " ",
    ref.entry._tag === "Update" ? "Update " : "",
    h.span.class(ref.entry._tag === "Update" ? "t-msg" : "t-tag").children(label.text),
    label.detail === undefined ? null : h.span.class("note").children(" " + label.detail)
  ]
}

const placeMeta = (feed: Feed, entry: Entry | Inspector.Outside) =>
  entry._tag === "Outside" ? "" : ("path" in entry ? Read.nameOf(entry.path) + " · " : "") + clock(feed, entry)

const Chain = (h: H, feed: Feed, steps: ReadonlyArray<Read.Step>) =>
  h.section.class("chain").attr("aria-label", "Causal chain").children(
    h.div.class("sect").children(h.span.children("Causal chain"), h.span.children("every #n jumps to that entry")),
    h.ol.class("steps").children(
      steps.map((step) => {
        switch (step._tag) {
          case "Source":
            return Step(h, "source", [sourceText(step.source)], {
              dot: "muted",
              meta: step.link === undefined
                ? []
                : [
                  step.source._tag === "Subscription" ? "started " : "",
                  SeqLink(h, step.link),
                  step.source._tag === "Subscription" ? " on this instance" : ""
                ]
            })
          case "Link":
            return Step(h, step.what, RefSummary(h, step.ref), {
              dot: "muted",
              meta: [placeMeta(feed, step.ref.entry)]
            })
          case "Entry":
            return Step(
              h,
              step.ref.entry._tag,
              RefSummary(h, step.ref).slice(2).concat(
                step.selected ? [h.span.class("tag-this").children("THIS ENTRY")] : []
              ),
              {
                tone: step.selected ? "this" : undefined,
                meta: [
                  ...(step.stopped === undefined || step.stopped.length === 0
                    ? []
                    : ["stopped ", ...step.stopped.flatMap((ref) => [SeqLink(h, ref), " "]), "· "]),
                  SeqLink(h, step.ref),
                  " · ",
                  placeMeta(feed, step.ref.entry)
                ]
              }
            )
          case "Command":
            return Step(
              h,
              (step.command._tag === "Interrupt" ? "command " : "issued command ") + step.index,
              [
                step.command._tag === "Interrupt" ? h.span.class("t-kw").children("Interrupt ") : null,
                h.span.class("t-msg").children(step.command.name),
                " ",
                ...(step.command._tag === "Interrupt" ? [] : Json(h, step.command.args)),
                step.command.group === null ? null : h.span.class("note").children(" group " + step.command.group)
              ],
              {
                indent: true,
                meta: step.stopped.length === 0
                  ? []
                  : ["stopped ", ...step.stopped.flatMap((ref) => [SeqLink(h, ref), " "])]
              }
            )
          case "Started": {
            const started = step.ref.entry
            return Step(h, "started", [
              SeqLink(h, step.ref),
              " CommandStarted",
              started._tag === "CommandStarted" ? h.span.class("note").children(" span " + started.spanId) : null
            ], { indent: true, tone: step.selected ? "this" : undefined, meta: [placeMeta(feed, started)] })
          }
          case "NotStarted":
            return Step(h, "started", [
              h.span.class("note").children(
                step.ended
                  ? "no CommandStarted: stopped before its work began"
                  : "no CommandStarted yet: waiting to start"
              )
            ], { indent: true, dot: "muted" })
          case "Result":
            return Step(h, "result", RefSummary(h, step.ref), {
              indent: true,
              dot: "ok",
              meta: [placeMeta(feed, step.ref.entry)]
            })
          case "Running":
            return Step(h, "end", [
              h.span.class("strong").children(step.since === undefined ? "not started" : "running"),
              step.since === undefined ? null : h.span.children(" since "),
              step.since === undefined ? null : SeqLink(h, step.since),
              h.span.class("note").children(" · no end observed")
            ], { tone: "open", dot: "open" })
          case "End": {
            const end = step.ref.entry
            const stop = end._tag === "CommandInterrupted" || end._tag === "CommandDropped" || end._tag === "Failed"
            return Step(h, "end", [
              SeqLink(h, step.ref),
              " ",
              h.span.class("strong").children(end._tag === "Outside" ? "" : end._tag),
              end._tag === "CommandInterrupted"
                ? h.span.children(" reason ", h.span.class("reason").children(end.reason))
                : end._tag === "Failed"
                ? h.span.children(" in ", h.span.class("reason").children(end.in), " · the run failed its instance")
                : null,
              step.after === undefined ? null : h.span.class("note").children(" · " + ms(step.after) + " after issue")
            ], {
              tone: stop ? "stop" : step.selected ? "this" : undefined,
              dot: stop ? "bad" : "ok",
              meta: [
                end._tag === "CommandInterrupted" || end._tag === "CommandEnded"
                  ? end.spanId === null ? "no span" : "span " + end.spanId
                  : ""
              ]
            })
          }
          case "CausedBy":
            return Step(h, "causedBy", RefSummary(h, step.ref), {
              indent: true,
              dot: "muted",
              meta: [placeMeta(feed, step.ref.entry)]
            })
          case "Names":
            return Step(
              h,
              "named by",
              step.links.flatMap((link) => [
                SeqLink(h, { seq: link.seq, entry: link.entry }),
                h.span.class("note").children(" " + link.rel + " "),
                link.entry._tag === "Outside" ? "" : Read.labelOf(link.entry).text + "  "
              ]),
              { dot: "muted" }
            )
        }
      })
    )
  )

const treeRow = (h: H, row: Read.Row) => {
  const change = row.change
  const kind = change?.kind === "unknown" ? undefined : change?.kind
  const gutter = kind === "changed" ? "~" : kind === "added" ? "+" : kind === "removed" ? "-" : ""
  return h.div.key(row.id).class("tl", kind !== undefined && "chg").attr(
    "style",
    "padding-left:" + (row.depth * 14 + 4) + "px"
  ).attr("data-change", kind).children(
    h.span.class("g").attr("aria-hidden", "true").children(gutter),
    h.span.class("v").children(
      row.key === undefined ? null : h.span.class("t-key").children(String(row.key) + ": "),
      row.open ?? row.close ?? null,
      ...(kind === "changed"
        ? [
          h.del.class("old").children(...Json(h, change!.before)),
          h.span.class("arrow").attr("aria-hidden", "true").children(" → "),
          h.ins.class("new").children(...Json(h, change!.after))
        ]
        : row.open === undefined && row.close === undefined
        ? Json(h, row.value)
        : [])
    ),
    kind === undefined ? h.span : h.span.class("badge").children(kind)
  )
}

const ModelTree = (h: H, value: Schema.Json, changes: ReadonlyArray<Inspector.Change>) =>
  h.div.class("tree").children(Read.treeOf(value, changes).map((row) => treeRow(h, row)))

const VirtualTree = (h: H, label: string, dataset: string, rows: ReadonlyArray<Read.Row>) =>
  VirtualList(h, {
    props: { keys: rows.map((row) => row.id), itemSize: 20, initialCount: 60, dataset },
    view: (list) =>
      list.viewport(h.div.class("tree", "scroll").attr("aria-label", label)).children(
        list.list(h.div.class("tree-rows")).children(
          list.items.map((index) => list.item({ element: treeRow(h, rows[index]!), index }))
        )
      )
  })

const Details = (h: H, session: Session, entry: Entry, model: OverlayModel) => {
  const state = entry._tag === "Update" || entry._tag === "Mounted" || entry._tag === "Waiting" ? entry : undefined
  const previous = state === undefined ? undefined : session.previous(entry.seq)
  const resolved = previous === undefined ? undefined : session.resolve(previous.seq)
  const before = resolved !== undefined && resolved._tag !== "Outside" && "model" in resolved ? resolved : undefined
  const unavailable = previous !== undefined && before === undefined
  const changes = state === undefined || before === undefined ? [] : Inspector.diff(before.model, state.model)
  const changed = changes.filter((change) => change.kind !== "unknown").length
  const props = state === undefined || before === undefined ? undefined : Read.compare(before.props, state.props)
  const commands = Read.isIssuing(entry) ? entry.commands : []
  const events = Read.isIssuing(entry) ? entry.events : []
  const tabs = state === undefined
    ? [{ value: "raw" }]
    : [{ value: "model" }, { value: "message" }, { value: "commands" }, { value: "events" }, { value: "raw" }]
  const active = tabs.some((tab) => tab.value === model.tab) ? model.tab : tabs[0]!.value
  const frame = JSON.stringify(entry, null, 2)
  const tab = (label: string, count?: string) =>
    h.button.class("tab").children(label, count === undefined ? null : h.small.children(" " + count))
  return Tabs(h, {
    props: { value: active, tabs },
    onEmit: { Selected: ({ value }) => OverlayMessage.SelectedTab({ value }) },
    view: (t) =>
      t.root(h.div.class("details")).children(
        t.list(h.div.class("tabs").attr("aria-label", "Entry details")).children(
          state === undefined ? null : t.tab({
            element: tab(
              "Model",
              unavailable ? "diff unavailable" : previous === undefined ? "first" : changed + " changed"
            ),
            value: "model"
          }),
          state === undefined ? null : t.tab({ element: tab("Message"), value: "message" }),
          state === undefined ? null : t.tab({ element: tab("Commands", String(commands.length)), value: "commands" }),
          state === undefined ? null : t.tab({ element: tab("Events", String(events.length)), value: "events" }),
          t.tab({ element: tab("Raw frame"), value: "raw" })
        ),
        state === undefined ? null : t.panel({ element: h.div.class("panes"), value: "model" })?.children(
          h.div.class("pane", "model").children(
            h.h4.children(
              h.span.children("Model after #" + entry.seq),
              previous === undefined
                ? h.span.children("first state of this instance")
                : unavailable
                ? h.span.class("unavailable").children(
                  "diff unavailable: this instance's previous entry ",
                  SeqLink(h, Read.refOf(session, previous.seq)),
                  " is outside the buffer"
                )
                : h.span.children(
                  "compared with ",
                  SeqLink(h, Read.refOf(session, previous.seq)),
                  ", this instance's previous entry"
                )
            ),
            VirtualTree(h, "Model after #" + entry.seq, String(entry.seq), Read.treeOf(state.model, changes))
          ),
          h.div.class("pane").children(
            h.h4.children(
              h.span.children("Props seen"),
              before === undefined || props === undefined
                ? h.span
                : props === "same"
                ? h.span.children("same as ", SeqLink(h, Read.refOf(session, before.seq)))
                : props === "changed"
                ? h.span.children("changed since ", SeqLink(h, Read.refOf(session, before.seq)))
                : h.span.children(
                  "redacted parts can't be compared with ",
                  SeqLink(h, Read.refOf(session, before.seq))
                )
            ),
            ModelTree(h, state.props, before === undefined ? [] : Inspector.diff(before.props, state.props)),
            entry._tag === "Update"
              ? h.h4.children(h.span.children("Message"), h.span.children("as encoded on the wire"))
              : null,
            entry._tag === "Update" ? ModelTree(h, entry.message, []) : null
          )
        ),
        state === undefined ? null : t.panel({ element: h.div.class("pane", "solo"), value: "message" })?.children(
          entry._tag === "Update"
            ? [
              h.h4.children(h.span.children("Source"), h.span.children(sourceText(entry.source))),
              h.h4.children(h.span.children("Message"), h.span.children("as encoded on the wire")),
              ModelTree(h, entry.message, [])
            ]
            : [h.p.class("note").children("A " + entry._tag + " entry has no message.")]
        ),
        state === undefined ? null : t.panel({ element: h.div.class("pane", "solo"), value: "commands" })?.children(
          commands.length === 0
            ? h.p.class("note").children("This entry issued no Command.")
            : h.ol.class("commands").children(
              commands.map((command, index) => {
                const run = command._tag === "Interrupt" ? undefined : session.run({ seq: entry.seq, index })
                return h.li.key(String(index)).children(
                  h.span.class("t-num").children(index + " "),
                  command._tag === "Interrupt" ? h.span.class("t-kw").children("Interrupt ") : null,
                  h.span.class("t-msg").children(command.name),
                  " ",
                  ...(command._tag === "Interrupt"
                    ? [h.span.class("note").children(command.group === null ? "" : "group " + command.group)]
                    : Json(h, command.args)),
                  run === undefined ? null : h.span.class("note").children(" · " + runText(run)),
                  run?.end === undefined ? null : SeqLink(h, Read.refOf(session, run.end))
                )
              })
            )
        ),
        state === undefined ? null : t.panel({ element: h.div.class("pane", "solo"), value: "events" })?.children(
          events.length === 0
            ? h.p.class("note").children("This entry emitted no event.")
            : h.ol.class("commands").children(
              events.map((event, index) => h.li.key(String(index)).children(...Json(h, event)))
            )
        ),
        t.panel({ element: h.div.class("pane", "solo"), value: "raw" })?.children(
          h.h4.children(h.span.children("Raw frame"), h.span.children("what Copy frame copies")),
          h.pre.class("raw").children(frame)
        )
      )
  })
}

const runText = (run: Inspector.Record) =>
  run.end !== undefined
    ? run.reason === "ended"
      ? "ended"
      : run.reason === "failed"
      ? "failed"
      : run.reason === "server"
      ? "dropped on the server"
      : "interrupted · " + run.reason
    : run.start === undefined
    ? "not started"
    : "running, no end observed"

const recordRow = (h: H, session: Session, record: Inspector.Record) => {
  const start = record.kind === "command" ? record.issued?.seq : record.start
  const startRef = start === undefined ? undefined : Read.refOf(session, start)
  const endRef = record.end === undefined ? undefined : Read.refOf(session, record.end)
  const startEntry = startRef?.entry
  const endEntry = endRef?.entry
  const after = startEntry !== undefined && startEntry._tag !== "Outside" && endEntry !== undefined &&
      endEntry._tag !== "Outside"
    ? " after " + ms(endEntry.at - startEntry.at)
    : ""
  const kind = record.kind === "layer"
    ? "Layer"
    : record.kind === "subscription"
    ? "Subscription"
    : record.kind === "mount"
    ? "Mount"
    : "Command"
  const what = record.kind === "subscription" && startEntry !== undefined && startEntry._tag === "SubscriptionStarted"
    ? Read.subscriptionText(startEntry)
    : record.name
  const verb = record.kind === "command" ? "issued " : record.kind === "layer" ? "pending " : "started "
  const derived = record.reason === "unmount" && endEntry !== undefined && endEntry._tag === "Unmounted"
  const bad = record.reason === "failed" || record.reason === "interrupt" || record.reason === "switch" ||
    record.reason === "unmount" || record.reason === "layer" || record.reason === "self" || record.reason === "server"
  return h.tr.key(record.kind + ":" + (start ?? record.name) + ":" + (record.issued?.index ?? "")).attr(
    "data-kind",
    record.kind
  ).children(
    h.th.attr("scope", "row").children(kind),
    h.td.class("mono").children(what),
    h.td.class("mono").children(
      verb,
      startRef === undefined ? "" : SeqLink(h, startRef),
      record.kind === "command" && record.start !== undefined
        ? h.span.children(" · started ", SeqLink(h, Read.refOf(session, record.start)))
        : null
    ),
    h.td.class("mono", toneClass(record.end === undefined ? "open" : bad ? "bad" : "ok")).children(
      record.end === undefined
        ? record.kind === "command"
          ? record.start === undefined ? "◌ not started" : "◌ running · no end observed"
          : "◌ open"
        : derived
        ? h.span.children(
          "■ closed by Unmounted ",
          SeqLink(h, endRef!),
          h.span.class("note").children(
            record.kind === "subscription" ? " (no SubscriptionStopped entry)" : " (no LayerReady)"
          )
        )
        : h.span.children(
          (bad ? "× " : "✓ ") + (record.reason ?? "") + " ",
          SeqLink(h, endRef!),
          after
        )
    )
  )
}

const LifecyclePanel = (h: H, session: Session, instance: number | undefined) => {
  const lifecycle = instance === undefined ? undefined : Read.lifecycleOf(session, instance)
  if (lifecycle === undefined) {
    return h.section.class("lifecycle").attr("aria-label", "Lifecycle").children(
      h.div.class("sect").children(h.span.children("Lifecycle"), h.span.children("select an entry of an instance"))
    )
  }
  const info = lifecycle.instance
  const unmounted = info.unmounted === undefined ? undefined : session.resolve(info.unmounted)
  const cause = unmounted === undefined || unmounted._tag === "Outside" || unmounted.causedBy === undefined
    ? undefined
    : Read.refOf(session, unmounted.causedBy)
  return h.section.class("lifecycle").attr("aria-label", "Lifecycle of " + Read.nameOf(info.path)).children(
    h.div.class("sect").children(
      h.span.children("Lifecycle of " + Read.nameOf(info.path) + " #" + info.instance),
      h.span.children("layers, subscriptions, mounts and command runs in the buffer")
    ),
    h.table.class("life-table").children(
      h.tbody.children(
        h.tr.children(
          h.th.attr("scope", "row").children("Instance"),
          h.td.class("mono").children(info.path),
          h.td.class("mono").children(
            info.mounted === undefined
              ? "mounted before the buffer"
              : h.span.children("mounted ", SeqLink(h, Read.refOf(session, info.mounted)))
          ),
          h.td.class("mono", info.unmounted === undefined ? "tone-ok" : "tone-bad").children(
            info.unmounted === undefined
              ? "● mounted"
              : h.span.children(
                "⏏ unmounted ",
                SeqLink(h, Read.refOf(session, info.unmounted)),
                cause === undefined
                  ? ""
                  : h.span.children(
                    ", causedBy ",
                    ...RefSummary(h, cause).slice(0, 1),
                    " ",
                    cause.entry._tag === "Outside" ? "" : Read.labelOf(cause.entry).text
                  )
              )
          )
        ),
        lifecycle.records.map((record) => recordRow(h, session, record))
      )
    )
  )
}

const Legend = (h: H) =>
  h.footer.class("legend").children(
    h.span.children("~ changed"),
    h.span.children("● mounted"),
    h.span.children("✓ ended"),
    h.span.children("× interrupted"),
    h.span.children("◌ open"),
    h.span.children("⏏ unmounted"),
    h.span.children(h.span.class("placeholder").children("(redacted)"), " never left the app"),
    h.span.class("spacer"),
    h.span.children("the rail in the timeline marks the selected entry's chain")
  )

const Panel = (h: H, model: OverlayModel) => {
  const feed = h.props.feed
  const session = sessionOf(feed)
  if (session === undefined) {
    return h.div.class("panel", "empty").children(
      Header(h, feed, undefined, undefined, model),
      h.p.class("note").children("Nothing logged yet.")
    )
  }
  const timeline = timelineOf(session, model)
  const selected = selectedOf(session, model, timeline)
  const entry = selected === undefined || selected._tag === "Outside" ? undefined : selected
  const steps = entry === undefined ? [] : Read.chainOf(session, entry)
  const chain = Read.chainSeqs(steps)
  const instance = model.instance ?? (entry === undefined ? undefined : Read.instanceOf(entry))
  return h.div.class("panel").attr("role", "dialog").attr("aria-label", "Effect UI inspector").children(
    Header(h, feed, session, selected, model),
    h.div.class("body").children(
      h.div.class("left").children(
        Instances(h, session, model, entry === undefined ? undefined : Read.instanceOf(entry)),
        Filters(h, model),
        Timeline(h, feed, session, model, timeline, selected?.seq, chain)
      ),
      h.div.class("right").children(
        entry === undefined
          ? h.div.class("ehead").children(
            h.span.class("big").children(selected === undefined ? "No entry" : "#" + selected.seq),
            h.span.class("note").children(selected === undefined ? "nothing matches the filter" : "outside the buffer")
          )
          : h.div.class("ehead").children(
            h.span.class("big").children("#" + entry.seq + " " + entry._tag),
            entry._tag === "Update" ? h.span.class("chip").children(Read.labelOf(entry).text) : null,
            "path" in entry ? h.span.class("chip").children(entry.path) : null,
            "instance" in entry ? h.span.class("chip").children("instance " + entry.instance) : null,
            h.span.class("chip").children(clock(feed, entry)),
            h.span.class("spacer"),
            h.button.class("chip", "button").ref(CopyButton).onClick(
              OverlayMessage.ClickedCopyFrame({ seq: entry.seq, text: JSON.stringify(entry, null, 2) })
            ).children(model.copied === entry.seq ? "Copied" : "Copy frame")
          ),
        entry === undefined ? null : Chain(h, feed, steps),
        entry === undefined ? null : Details(h, session, entry, model),
        LifecyclePanel(h, session, instance)
      )
    ),
    Legend(h)
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
  init: () => ({ open: false, revision: 0, selected: null, filter: "all", instance: null, tab: "model", copied: null }),
  update: {
    ReceivedFrames: (_model, _message, $) => $.evolve({ revision: (revision) => revision + 1 }),
    ClickedOpen: (_model, _message, $) => $.evolve({ open: true }),
    ClickedClose: (_model, _message, $) => $.evolve({ open: false }),
    ClickedEntry: (_model, { seq }, $) => $.evolve({ selected: seq }),
    ClickedLink: (_model, { seq }, $) => $.evolve({ selected: seq, filter: "all", instance: null }),
    ClickedInstance: (model, { instance }, $) => $.evolve({ instance: model.instance === instance ? null : instance }),
    ClickedFilter: (_model, { filter }, $) => $.evolve({ filter }),
    ClickedFollowLatest: (_model, _message, $) => $.evolve({ selected: null }),
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
            h.span.class("launcher-mark").attr("aria-hidden", "true").children("◆"),
            "Effect UI",
            h.span.class("launcher-count").children(String(sessionOf(h.props.feed)?.entries().length ?? 0))
          )
    )
})
