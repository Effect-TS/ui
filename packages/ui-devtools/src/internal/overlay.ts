import { Tabs } from "@effect/ui-kit/Tabs"
import {
  VirtualList,
  VirtualListScrollTarget
} from "@effect/ui-kit/VirtualList"
import * as Command from "@effect/ui/Command"
import * as Component from "@effect/ui/Component"
import type * as BrowserHost from "@effect/ui/html/BrowserHost"
import * as Html from "@effect/ui/html/Html"
import * as MessageLog from "@effect/ui/MessageLog"
import * as Renderer from "@effect/ui/Renderer"
import * as Subscription from "@effect/ui/Subscription"
import * as UiSchema from "@effect/ui/UiSchema"
import type * as View from "@effect/ui/View"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Inspector from "../Inspector.ts"
import { Paused } from "./control.ts"
import * as Read from "./read.ts"

export interface Feed {
  readonly inspector: Inspector.Inspector
  readonly origin: (session: string) => number | undefined
  readonly changes: Stream.Stream<void>
  readonly paintable: (session: string, seq: number) => boolean
  readonly paused: () => typeof Paused.Type | undefined
  readonly failures: () => number
  readonly open: boolean
}

export class Pages extends Context.Service<Pages, {
  readonly paint: (
    session: string,
    seq: number
  ) => Effect.Effect<BrowserHost.Painted | undefined>
  readonly resume: Effect.Effect<void>
  readonly clear: (session: string) => Effect.Effect<void>
  readonly setOpen: (open: boolean) => Effect.Effect<void>
}>()("@effect/ui-devtools/Pages") {}

const FeedSchema = Schema.declare(
  (u: unknown): u is Feed =>
    Predicate.hasProperty(u, "inspector") && Predicate.hasProperty(u, "changes")
)

const Filter = Schema.Literals(["messages", "commands", "all"])

const Pane = Schema.Literals(["timeline", "entry"])

const OverlayProps = Schema.Struct({ feed: FeedSchema })

type OverlayProps = typeof OverlayProps.Type

const OverlayModel = Schema.Struct({
  open: Schema.Boolean,
  revision: Schema.Number,
  selected: Schema.NullOr(Schema.Number),
  filter: Filter,
  scope: Schema.NullOr(Schema.String),
  browse: Schema.Boolean,
  find: Schema.String,
  branches: Schema.Array(Schema.String),
  failures: Schema.Number,
  tab: Schema.String,
  copied: Schema.NullOr(Schema.Number),
  pinned: Schema.Boolean,
  atStart: Schema.Boolean,
  reveal: Schema.NullOr(Schema.Number),
  pins: Schema.Number,
  pane: Pane,
  paused: Schema.NullOr(Paused),
  expanded: Schema.Array(Schema.String)
})

type OverlayModel = typeof OverlayModel.Type

const OverlayMessage = UiSchema.TaggedEnum({
  ReceivedFrames: {},
  ClickedOpen: {},
  ClickedClose: {},
  ClickedEntry: { seq: Schema.Number },
  ClickedLink: { seq: Schema.Number },
  ClickedScope: { path: Schema.String },
  TypedFind: { text: Schema.String },
  ClickedBrowse: {
    browse: Schema.Boolean,
    branches: Schema.Array(Schema.String)
  },
  ToggledBranch: { path: Schema.String },
  ClickedFilter: { filter: Filter },
  ClickedFollowLatest: {},
  ClickedBack: {},
  ScrolledTimeline: { atStart: Schema.Boolean },
  SelectedTab: { value: Schema.String },
  ToggledModelPath: { path: Schema.String },
  ClickedCopyFrame: { seq: Schema.Number, text: Schema.String },
  SucceededCopyFrame: { seq: Schema.Number },
  FailedCopyFrame: {},
  ClickedTimeTravel: { session: Schema.String, seq: Schema.Number },
  ScrubbedPage: { seq: Schema.Number },
  ClickedResume: {},
  ClickedClear: {},
  Cleared: {},
  Painted: Paused.fields
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
          const clipboard = Option.getOrUndefined(button)?.ownerDocument
            .defaultView?.navigator.clipboard
          return clipboard === undefined
            ? Promise.reject()
            : clipboard.writeText(text)
        })
      ),
      Effect.match({
        onSuccess: () => OverlayMessage.SucceededCopyFrame({ seq }),
        onFailure: () => OverlayMessage.FailedCopyFrame()
      })
    )
)

export class Paint extends Command.Service<Paint>()(
  "devtools/Paint",
  {
    args: { session: Schema.String, seq: Schema.NullOr(Schema.Number) },
    mode: "switch"
  },
  Effect.gen(function*() {
    const pages = yield* Pages
    return ({ seq, session }) =>
      seq === null
        ? Effect.as(pages.resume, Component.noop)
        : Effect.map(
          pages.paint(session, seq),
          (painted) =>
            painted === undefined
              ? Component.noop
              : OverlayMessage.Painted({ session, seq, ...painted })
        )
  })
) {}

export class Clear extends Command.Service<Clear>()(
  "devtools/Clear",
  { args: { session: Schema.String } },
  Effect.gen(function*() {
    const pages = yield* Pages
    return ({ session }) =>
      Effect.as(pages.clear(session), OverlayMessage.Cleared())
  })
) {}

export class SaveOpen extends Command.Service<SaveOpen>()(
  "devtools/SaveOpen",
  { args: { open: Schema.Boolean } },
  Effect.gen(function*() {
    const pages = yield* Pages
    return ({ open }) => Effect.as(pages.setOpen(open), Component.noop)
  })
) {}

type Children = View.Children<OverlayMessage, never>
type H =
  & View.Helper<OverlayMessage, OverlayProps>
  & View.Tags<Html.Elements, OverlayMessage>
type Session = Inspector.Session
type Entry = Read.Entry
type Ref = Read.Ref

const filters: ReadonlyArray<readonly [Read.Filter, string]> = [
  ["messages", "Messages"],
  ["commands", "Commands"],
  ["all", "Everything"]
]

const increment = (n: number) => n + 1
const following = {
  pinned: true,
  reveal: null,
  pins: increment,
  pane: "timeline"
} as const

const toneClass = (tone: Read.Tone | undefined) =>
  tone === undefined ? null : "tone-" + tone

const Mark = (
  h: H,
  mark: Read.Mark,
  ...classes: ReadonlyArray<string | null>
) =>
  h.span.class("mk", "mk-" + mark, ...classes).attr("aria-hidden", "true").attr(
    "data-mark",
    mark
  )

const Code = (h: H, text: string) => h.span.class("code").children(text)

const Name = (h: H, entry: Entry, text: string) =>
  text === entry._tag ? text : Code(h, text)

const plural = (count: number, one: string, many: string) =>
  count.toLocaleString("en-US") + (count === 1 ? one : many)

const SeqLink = (h: H, ref: Ref) =>
  ref.entry._tag === "Outside"
    ? h.span.class("ref", "outside").attr(
      "title",
      "Outside the inspector's buffer"
    ).children("#" + ref.seq)
    : h.button.class("ref").attr(
      "aria-label",
      "Go to #" + ref.seq + " " + Read.summaryOf(ref.entry)
    )
      .onClick(OverlayMessage.ClickedLink({ seq: ref.seq })).children(
        "#" + ref.seq
      )

const Json = (h: H, value: Schema.Json | undefined): Children => {
  if (value === undefined) return []
  if (MessageLog.isPlaceholder(value)) return [Placeholder(h, value)]
  if (value === null || typeof value !== "object") {
    return [
      typeof value === "string"
        ? h.span.class("t-str").children(JSON.stringify(value))
        : h.span.class(value === null ? null : "t-num").children(String(value))
    ]
  }
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
    ? h.span.class("placeholder").attr(
      "title",
      "Redacted by the encoder: the value never left the app"
    )
      .children("redacted")
    : "~truncated" in value
    ? h.span.class("placeholder").attr("title", "Over maxEntryBytes").children(
      "truncated, " + value["~truncated"] + " bytes"
    )
    : h.span.class("placeholder").attr("title", "No JSON form").children(
      "unserialisable " + value["~unserialisable"]
    )

const sessionOf = (feed: Feed, model: OverlayModel): Session | undefined => {
  const sessions = feed.inspector.sessions()
  const paused = model.paused?.session
  return (paused === undefined
    ? undefined
    : sessions.find((session) => session.id === paused)) ?? sessions.at(-1)
}

const shows = (model: OverlayModel, session: string, seq: number) =>
  model.paused?.session === session && model.paused.seq === seq

const PausedBadge = (h: H, seq: number) =>
  h.span.class("paused").children(
    h.span.class("paused-label").children("Paused at #" + seq),
    h.button.class("resume").attr("aria-label", "Resume the live page").onClick(
      OverlayMessage.ClickedResume()
    )
      .children("Resume")
  )

const paths = (h: H, list: ReadonlyArray<string>) =>
  list.flatMap((
    path,
    at
  ) => [at === 0 ? null : ", ", h.code.class("path").children(path)])

const PausedBar = (
  h: H,
  paused: typeof Paused.Type,
  timeline: ReadonlyArray<Entry>,
  paintable: Feed["paintable"]
) => {
  const stops = timeline.filter((entry) => paintable(entry.session, entry.seq))
    .reverse()
  const at = stops.findIndex((entry) => entry.seq === paused.seq)
  return h.section.class("pausebar").attr(
    "aria-label",
    "Page shown at an earlier entry"
  ).children(
    h.div.class("scrub").children(
      h.span.class("muted").children("Page at"),
      h.input.attr("type", "range").attr(
        "aria-label",
        "Entry shown on the page"
      ).attr("min", "0")
        .attr("max", String(Math.max(0, stops.length - 1))).attr(
          "aria-valuetext",
          "#" + paused.seq
        )
        .value(String(Math.max(0, at)))
        .onInput(({ value }) => {
          const entry = stops[Number(value)]
          return entry === undefined
            ? undefined
            : OverlayMessage.ScrubbedPage({ seq: entry.seq })
        }),
      h.span.class("at").children("#" + paused.seq)
    ),
    paused.fellBack.length === 0 ?
      null :
      h.p.class("pause-note", "tone-open").children(
        "No state at #" + paused.seq + ", shown from init: ",
        paths(h, paused.fellBack)
      ),
    paused.fallbacks.length === 0 ?
      null :
      h.p.class("pause-note", "tone-open").children(
        "A feature slot shows its fallback, since its Layer isn't built on the painted page, in: ",
        paths(h, paused.fallbacks)
      )
  )
}

const Header = (
  h: H,
  session: Session | undefined,
  count: number,
  model: OverlayModel
) => {
  const following = model.selected === null && model.pinned
  const canClear = session !== undefined && count > 0 && model.paused === null
  return h.header.class("bar").children(
    h.span.class("logo").attr("aria-hidden", "true"),
    h.h2.class("title").children("Effect UI inspector"),
    session?.app === undefined
      ? null
      : h.span.class("app").children(session.app),
    h.span.class("spacer"),
    model.paused === null ? null : PausedBadge(h, model.paused.seq),
    h.span.class("count").children(
      count === 1 ? "1 entry" : count + " entries"
    ),
    h.button.class("clear").disabled(!canClear)
      .attr(
        "title",
        model.paused !== null ? "Resume before clearing" : "Clear the timeline"
      )
      .onClick(OverlayMessage.ClickedClear()).children("Clear"),
    h.button.class("follow", following && "on").attr(
      "aria-pressed",
      String(following)
    )
      .onClick(OverlayMessage.ClickedFollowLatest()).children(
        h.span.class("dot").attr("aria-hidden", "true"),
        "Follow latest"
      ),
    h.button.class("close").attr("aria-label", "Close the inspector").onClick(
      OverlayMessage.ClickedClose()
    )
      .children("✕")
  )
}

interface InstanceRow {
  readonly summary: Inspector.Summary
  readonly depth: number
  readonly expanded: boolean
  readonly split: boolean
}

const rankOf = (summary: Inspector.Summary) => {
  const tone = Read.toneOf(summary)
  return tone === "bad" ? 0 : tone === "open" ? 1 : 2
}

const flat = (
  summaries: ReadonlyArray<Inspector.Summary>
): Array<InstanceRow> =>
  summaries.map((summary, index) => ({
    summary,
    depth: 0,
    expanded: false,
    split: index > 0 && rankOf(summaries[index - 1]!) < 2 &&
      rankOf(summary) === 2
  }))

const activeRows = (
  session: Session,
  extra: ReadonlyArray<Inspector.Summary | undefined>
) => {
  const active = session.active()
  const listed = [0, 1, 2].flatMap((rank) =>
    active.filter((summary) => rankOf(summary) === rank)
  )
  for (const summary of extra) {
    if (
      summary !== undefined &&
      !listed.some((other) => other.instance === summary.instance)
    ) listed.push(summary)
  }
  return flat(listed)
}

const treeRows = (session: Session, branches: ReadonlySet<string>) => {
  const rows: Array<InstanceRow> = []
  const walked = new Set<string>()
  const walk = (path: string, depth: number) => {
    for (const summary of session.children(path)) {
      const expanded = summary.below.instances > 0 &&
        branches.has(summary.path) && !walked.has(summary.path)
      rows.push({ summary, depth, expanded, split: false })
      if (!expanded) continue
      walked.add(summary.path)
      walk(summary.path, depth + 1)
    }
  }
  walk("", 0)
  return rows
}

const ancestorsOf = (path: string) => {
  const paths: Array<string> = []
  for (let at = Read.parentOf(path); at !== ""; at = Read.parentOf(at)) {
    paths.push(at)
  }
  return paths
}

const Statuses = (h: H, summary: Inspector.Summary) => {
  const statuses = Read.statusesOf(summary)
  return h.span.class("status").attr(
    "title",
    statuses.map((status) => status.text).join(", ") || undefined
  ).children(
    statuses.flatMap((status, index) => [
      index === 0 ? null : ", ",
      h.span.class(toneClass(status.tone)).children(status.text)
    ])
  )
}

const Rollup = (h: H, below: Inspector.Summary["below"]) =>
  h.span.class("rollup").children(
    h.span.class("under").children(
      below.instances.toLocaleString("en-US"),
      h.span.class("sr").children(
        below.instances === 1 ? " instance under it" : " instances under it"
      )
    ),
    below.failing === 0 ? null : h.span.class("roll", "tone-bad").children(
      Mark(h, "bad"),
      String(below.failing),
      h.span.class("sr").children(" failed or interrupted")
    ),
    below.running === 0 ? null : h.span.class("roll", "tone-open").children(
      Mark(h, "start"),
      String(below.running),
      h.span.class("sr").children(" running")
    )
  )

const instanceMark = (summary: Inspector.Summary): Read.Mark => {
  const tone = Read.toneOf(summary)
  return tone === "bad" ? "bad" : tone === "open" ? "start" : "message"
}

const InstanceItem = (
  h: H,
  row: InstanceRow,
  model: OverlayModel,
  owner: number | undefined,
  tree: boolean
) => {
  const { summary } = row
  const name = Read.nameOf(summary.path)
  const parent = Read.parentOf(summary.path)
  const scoped = model.scope === summary.path
  const tone = Read.toneOf(summary)
  return [
    !tree ? null : summary.below.instances === 0
      ? h.span.class("chev").attr("aria-hidden", "true")
      : h.button.class("chev").attr("aria-expanded", String(row.expanded))
        .attr("aria-label", "Instances under " + name)
        .onClick(OverlayMessage.ToggledBranch({ path: summary.path })).children(
          row.expanded ? "▾" : "▸"
        ),
    h.button.class(
      "irow",
      scoped && "on",
      owner === summary.instance && "owner"
    )
      .attr("aria-pressed", String(scoped))
      .attr("aria-current", owner === summary.instance ? "true" : undefined)
      .attr("data-instance", name)
      .attr("title", "Show only " + name + " and the instances under it")
      .onClick(OverlayMessage.ClickedScope({ path: summary.path }))
      .children(
        tree ? null : Mark(h, instanceMark(summary), "imark", toneClass(tone)),
        h.span.class("id").children(
          h.span.class("iname", "code").children(name),
          tree || parent === ""
            ? null
            : h.span.class("in").children(" in ", Code(h, Read.nameOf(parent)))
        ),
        tree && summary.below.instances > 0
          ? Rollup(h, summary.below)
          : Statuses(h, summary)
      )
  ]
}

const InstanceList = (
  h: H,
  rows: ReadonlyArray<InstanceRow>,
  model: OverlayModel,
  owner: number | undefined,
  mode: "active" | "tree" | "find"
) => {
  const keys = rows.map((row) => String(row.summary.instance))
  const target = owner === undefined || model.selected === null
    ? undefined
    : String(owner)
  return VirtualList(h, {
    key: "instances",
    props: {
      keys,
      itemSize: 26,
      measure: false,
      initialCount: 12,
      dataset: mode,
      ...(target === undefined || !keys.includes(target) ? {} : {
        scrollTo: {
          target: VirtualListScrollTarget.Key({ key: target }),
          align: "nearest" as const,
          id: mode + ":" + model.selected
        }
      })
    },
    view: (list) =>
      list.viewport(
        h.div.class("ilist", mode === "tree" && "tree-list").attr(
          "aria-label",
          "Instances"
        )
      ).children(
        list.list(h.ul).children(
          list.items.map((index) => {
            const row = rows[index]!
            return list.item({
              element: h.li.key(keys[index]!).class(
                "iitem",
                row.split && "split"
              ).attr(
                "style",
                mode === "tree"
                  ? "padding-left:" + (8 + row.depth * 14) + "px"
                  : undefined
              ),
              index
            }).children(...InstanceItem(h, row, model, owner, mode === "tree"))
          })
        )
      )
  })
}

const Instances = (
  h: H,
  session: Session,
  model: OverlayModel,
  owner: Inspector.Summary | undefined
) => {
  const count = session.instanceCount()
  const find = model.find.trim()
  const mode = find !== "" ? "find" : model.browse ? "tree" : "active"
  const rows = mode === "find"
    ? flat(session.find(find))
    : mode === "tree"
    ? treeRows(session, new Set(model.branches))
    : activeRows(session, [
      owner,
      model.scope === null ? undefined : session.summaryAt(model.scope)
    ])
  return h.section.class("instances").attr("aria-label", "Instances").children(
    h.div.class("ihead").children(
      h.h3.class("heading").children("Instances"),
      h.span.class("icount").children(count.toLocaleString("en-US")),
      h.input.class("find").attr("type", "search").attr(
        "aria-label",
        "Find an instance"
      )
        .attr("placeholder", "Find an instance").attr("spellcheck", "false")
        .value(model.find)
        .onInput(({ value }) => OverlayMessage.TypedFind({ text: value }))
    ),
    rows.length === 0
      ? h.p.class("inote").children(
        mode === "find"
          ? "No instance matches."
          : "No instance has run a Command or taken a message yet."
      )
      : InstanceList(h, rows, model, owner?.instance, mode),
    mode === "find" ? null : h.button.class("browse").onClick(
      OverlayMessage.ClickedBrowse({
        browse: !model.browse,
        branches: model.browse || owner === undefined
          ? []
          : ancestorsOf(owner.path)
      })
    ).children(
      model.browse
        ? "Back to active instances"
        : "Browse all " + count.toLocaleString("en-US")
    )
  )
}

const Filters = (h: H, model: OverlayModel) =>
  h.div.class("filters").attr("role", "group").attr(
    "aria-label",
    "Show in the timeline"
  ).children(
    filters.map(([filter, label]) =>
      h.button.key(filter).class("filter", model.filter === filter && "on")
        .attr(
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
    ? {
      scrollTo: {
        target: VirtualListScrollTarget.Offset({ offset: 0 }),
        id: (keys[0] ?? "") + ":" + model.pins
      }
    }
    : {}

const holdsCommand = (steps: ReadonlyArray<Read.Step>) =>
  steps.some((step) =>
    step._tag === "Command"
      ? step.command._tag !== "Interrupt"
      : step._tag === "Started"
  )

const Timeline = (
  h: H,
  session: Session,
  model: OverlayModel,
  timeline: ReadonlyArray<Entry>,
  newest: number,
  hidden: number,
  selected: number | undefined,
  steps: ReadonlyArray<Read.Step>
) => {
  const chain = Read.chainSeqs(steps)
  const keys = timeline.map((entry) => String(entry.seq))
  const railed = timeline.map((entry) => chain.has(entry.seq))
  const first = railed.indexOf(true)
  const last = railed.lastIndexOf(true)
  return h.div.class("timeline-box", holdsCommand(steps) && "cmd").attr(
    "style",
    "--seq-digits:" + String(newest).length
  ).children(
    VirtualList(h, {
      key: "timeline",
      props: {
        keys,
        itemSize: 28,
        measure: false,
        initialCount: 40,
        dataset: model.filter + ":" + model.scope,
        ...scrollOf(model, keys)
      },
      onEmit: {
        Scrolled: ({ atStart }) => OverlayMessage.ScrolledTimeline({ atStart })
      },
      view: (list) =>
        list.viewport(
          h.div.class("timeline").attr("aria-label", "Timeline, newest first")
        ).children(
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
              }).attr("data-seq", String(entry.seq)).attr(
                "data-tag",
                entry._tag
              ).children(
                h.span.class("rail", rail).attr("aria-hidden", "true"),
                h.button.class("row-button").attr(
                  "aria-label",
                  "#" + entry.seq + " " + Read.summaryOf(entry)
                )
                  .attr(
                    "aria-current",
                    entry.seq === selected ? "true" : undefined
                  )
                  .onClick(OverlayMessage.ClickedEntry({ seq: entry.seq }))
                  .children(
                    h.span.class("seq").children(String(entry.seq)),
                    Mark(h, Read.markOf(entry), "mark", toneClass(label.tone)),
                    h.span.class("lw").children(
                      h.span.class("label").children(
                        Name(h, entry, label.text),
                        label.detail === undefined ?
                          null :
                          h.span.class("verb", toneClass(label.tone)).children(
                            " " + label.detail
                          )
                      ),
                      "path" in entry
                        ? h.span.class("who", "code").attr("title", entry.path)
                          .children(Read.nameOf(entry.path))
                        : null
                    )
                  )
              )
            })
          ),
          hidden === 0 ? null : h.p.class("hidden-note").children(
            (hidden === 1
              ? "1 lifecycle entry"
              : hidden + " lifecycle entries") + " hidden. ",
            h.button.onClick(OverlayMessage.ClickedFilter({ filter: "all" }))
              .children(
                hidden === 1 ? "Show it" : "Show them"
              )
          )
        )
    })
  )
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

const Label = (
  h: H,
  entry: Entry | Inspector.Outside,
  strong = false
): Children => {
  if (entry._tag === "Outside") return []
  const label = Read.labelOf(entry)
  return [
    strong
      ? h.strong.class(label.text === entry._tag ? null : "code").children(
        label.text
      )
      : Name(h, entry, label.text),
    label.detail === undefined
      ? null
      : h.span.class("muted", toneClass(label.tone)).children(
        " " + label.detail
      )
  ]
}

const RefSummary = (h: H, ref: Ref): Children =>
  ref.entry._tag === "Outside"
    ? [SeqLink(h, ref), h.span.class("muted").children(" outside the buffer")]
    : [...Label(h, ref.entry), " ", SeqLink(h, ref)]

const Stopped = (h: H, refs: ReadonlyArray<Ref>): Children =>
  refs.length === 0
    ? []
    : [
      h.span.class("muted").children(", stopped "),
      ...refs.flatMap((ref) => [SeqLink(h, ref), " "])
    ]

type Tone = "this" | Read.Tone

const markOfStep = (step: Read.Step): Read.Mark => {
  switch (step._tag) {
    case "Source":
    case "NotStarted":
    case "Names":
      return "ring"
    case "Command":
      return "issue"
    case "Started":
    case "Running":
      return "start"
    case "Link":
    case "Entry":
    case "Result":
    case "End":
    case "CausedBy":
      return Read.markOf(step.ref.entry)
  }
}

const Step = (
  h: H,
  step: Read.Step,
  body: Children,
  tone?: Tone,
  extra?: Children,
  run = false
) =>
  h.li.class("step", tone === undefined ? null : "step-" + tone, run && "run")
    .attr("data-step", step._tag).attr(
      "data-index",
      step._tag === "Command" ? String(step.index) : undefined
    ).children(
      h.span.class("node").children(Mark(h, markOfStep(step))),
      h.div.class("what").children(...body),
      extra === undefined ? null : h.div.class("args").children(...extra)
    )

const endText = (end: Entry | Inspector.Outside): string => {
  switch (end._tag) {
    case "CommandInterrupted":
      return Read.reasonText[end.reason].replace("i", "I")
    case "CommandDropped":
      return "Dropped on the server"
    case "Failed":
      return "Failed in " + end.in
    default:
      return "Ended"
  }
}

const linkText: { readonly [R in Inspector.Link["rel"]]: string } = {
  causedBy: "Caused by",
  issued: "Issued by",
  source: "Result of",
  started: "Started from"
}

const runSteps = (steps: ReadonlyArray<Read.Step>) => {
  const inRun = new Set<number>()
  let open = false
  steps.forEach((step, index) => {
    if (step._tag === "Command") open = step.command._tag !== "Interrupt"
    else if (
      step._tag === "End" || step._tag === "Running" ||
      step._tag === "Source" || step._tag === "Entry"
    ) {
      open = false
    }
    if (open) inRun.add(index)
  })
  return inRun
}

const Chain = (h: H, steps: ReadonlyArray<Read.Step>) => {
  const inRun = runSteps(steps)
  return h.ol.class("chain").attr("aria-label", "Causal chain").children(
    steps.map((step, index) => {
      const run = inRun.has(index)
      switch (step._tag) {
        case "Source":
          return Step(h, step, [
            sourceText(step.source),
            ...(step.link === undefined ? [] : [" ", SeqLink(h, step.link)])
          ])
        case "Link":
          return Step(h, step, [
            linkText[step.rel],
            " ",
            ...RefSummary(h, step.ref)
          ])
        case "Entry":
          return Step(
            h,
            step,
            [
              ...Label(h, step.ref.entry, step.selected),
              " ",
              step.selected
                ? h.span.class("muted").children("this entry")
                : SeqLink(h, step.ref),
              ...Stopped(h, step.stopped ?? [])
            ],
            step.selected ? "this" : undefined
          )
        case "Command":
          return step.command._tag === "Interrupt"
            ? Step(h, step, [
              "Interrupt " + step.command.name,
              step.command.group === null
                ? null
                : h.span.class("muted").children(" " + step.command.group),
              ...Stopped(h, step.stopped)
            ])
            : Step(
              h,
              step,
              ["Issued ", Code(h, step.command.name)],
              undefined,
              Json(h, step.command.args),
              run
            )
        case "Started":
          return Step(
            h,
            step,
            ["Started ", SeqLink(h, step.ref)],
            step.selected ? "this" : undefined,
            undefined,
            run
          )
        case "NotStarted":
          return Step(
            h,
            step,
            [step.ended ? "Stopped before it started" : "Waiting to start"],
            step.ended ? undefined : "open",
            undefined,
            run
          )
        case "Result":
          return Step(
            h,
            step,
            ["Result ", ...RefSummary(h, step.ref)],
            undefined,
            undefined,
            run
          )
        case "Running":
          return Step(
            h,
            step,
            step.since === undefined
              ? ["Not started yet"]
              : [
                "Still running since ",
                SeqLink(h, step.since),
                h.span.class("muted").children(", no end logged yet")
              ],
            "open"
          )
        case "End": {
          const end = step.ref.entry
          const bad = end._tag === "CommandInterrupted" ||
            end._tag === "CommandDropped" || end._tag === "Failed"
          const next = steps[index + 1]
          return Step(
            h,
            step,
            [
              endText(end),
              step.after === undefined
                ? ""
                : " after " + Read.duration(step.after),
              " ",
              SeqLink(h, step.ref),
              end._tag === "Failed"
                ? h.span.class("muted").children(", which failed its instance")
                : null,
              ...(next?._tag === "CausedBy"
                ? [
                  h.span.class("cause").children(
                    " by ",
                    ...RefSummary(h, next.ref)
                  )
                ]
                : [])
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
}

const changesText = (count: number) =>
  count + (count === 1 ? " change" : " changes")

const treeRow = (h: H, row: Read.Row) => {
  const { branch, change } = row
  const kind = change?.kind
  const key = row.key === undefined ? "" : String(row.key)
  const closed = branch !== undefined && !branch.expanded
  const label = kind === "added" || kind === "removed"
    ? kind
    : closed && branch.changes > 0
    ? changesText(branch.changes)
    : undefined
  return h.div.key(row.id).class("tl", (kind ?? label) !== undefined && "chg")
    .attr(
      "style",
      "padding-left:" + (row.depth * 16 + 12) + "px"
    ).attr("data-change", kind).children(
      branch === undefined
        ? h.span.class("k").children(key)
        : h.button.class("k", "toggle").attr(
          "aria-expanded",
          String(branch.expanded)
        ).attr(
          "aria-label",
          label === undefined ? key : key + ", " + label
        ).onClick(OverlayMessage.ToggledModelPath({ path: branch.path }))
          .children(
            h.span.class("chev").attr("aria-hidden", "true").children(
              branch.expanded ? "▾" : "▸"
            ),
            key
          ),
      h.span.class("v").children(
        closed
          ? h.span.class("t-punct").children(branch.preview)
          : row.open ?? row.close ?? null,
        ...(kind === "changed"
          ? [
            h.del.class("old").children(...Json(h, change!.before)),
            h.span.class("arrow").attr("aria-hidden", "true").children(" → "),
            h.ins.class("new").children(...Json(h, change!.after))
          ]
          : row.open === undefined && row.close === undefined
          ? Json(h, row.value)
          : []),
        label === undefined ? null : h.span.class("muted").children(" " + label)
      )
    )
}

const Tree = (
  h: H,
  value: Schema.Json,
  changes: ReadonlyArray<Inspector.Change>
) =>
  h.div.class("tree").children(
    Read.treeOf(value, changes).map((row) => treeRow(h, row))
  )

const VirtualTree = (
  h: H,
  label: string,
  dataset: string,
  rows: ReadonlyArray<Read.Row>
) =>
  VirtualList(h, {
    props: {
      keys: rows.map((row) => row.id),
      itemSize: 22,
      initialCount: 60,
      dataset
    },
    view: (list) =>
      list.viewport(h.div.class("tree", "scroll").attr("aria-label", label))
        .children(
          list.list(h.div).children(
            list.items.map((index) =>
              list.item({ element: treeRow(h, rows[index]!), index })
            )
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
    ? Read.reasonText[run.reason ?? "interrupt"]
    : run.start === undefined
    ? "not started"
    : "running"

const recordWords: {
  readonly [K in Inspector.Record["kind"]]: readonly [
    kind: string,
    verb: string
  ]
} = {
  layer: ["Layer", "pending "],
  subscription: ["Subscription", "started "],
  mount: ["Mount", "started "],
  command: ["Command", "issued "]
}

const recordRow = (h: H, session: Session, record: Inspector.Record) => {
  const start = record.kind === "command" ? record.issued?.seq : record.start
  const startRef = start === undefined ? undefined : Read.refOf(session, start)
  const endRef = record.end === undefined
    ? undefined
    : Read.refOf(session, record.end)
  const startEntry = startRef?.entry
  const endEntry = endRef?.entry
  const took = startEntry !== undefined && startEntry._tag !== "Outside" &&
      endEntry !== undefined &&
      endEntry._tag !== "Outside"
    ? endEntry.at - startEntry.at
    : 0
  const [kind, verb] = recordWords[record.kind]
  const what = record.kind === "subscription" && startEntry !== undefined &&
      startEntry._tag === "SubscriptionStarted"
    ? Read.subscriptionText(startEntry)
    : record.name
  const derived = record.reason === "unmount" && endEntry !== undefined &&
    endEntry._tag === "Unmounted"
  const tone: Read.Tone | undefined = record.end === undefined
    ? record.kind === "command" ? "open" : undefined
    : !derived && record.reason !== undefined &&
        Read.reasonTone[record.reason] === "bad"
    ? "bad"
    : undefined
  return h.tr.key(
    record.kind + ":" + (start ?? record.name) + ":" +
      (record.issued?.index ?? "")
  ).attr(
    "data-kind",
    record.kind
  ).children(
    h.th.attr("scope", "row").children(kind),
    h.td.children(what),
    h.td.children(
      verb,
      startRef === undefined ? "" : SeqLink(h, startRef),
      record.kind === "command" && record.start !== undefined
        ? h.span.children(
          ", started ",
          SeqLink(h, Read.refOf(session, record.start))
        )
        : null
    ),
    h.td.class(toneClass(tone)).children(
      record.end === undefined
        ? record.kind === "command"
          ? record.start === undefined ? "not started" : "running"
          : "open"
        : derived
        ? h.span.children("closed by unmount ", SeqLink(h, endRef!))
        : h.span.children(
          Read.reasonText[record.reason ?? "ended"],
          took >= 1 ? " after " + Read.duration(took) : "",
          " ",
          SeqLink(h, endRef!)
        )
    )
  )
}

const Lifecycle = (h: H, session: Session, info: Inspector.Instance) => {
  const unmounted = info.unmounted === undefined
    ? undefined
    : session.resolve(info.unmounted)
  const cause = unmounted === undefined || unmounted._tag === "Outside" ||
      unmounted.causedBy === undefined
    ? undefined
    : Read.refOf(session, unmounted.causedBy)
  return h.table.class("life").attr(
    "aria-label",
    "Lifecycle of " + Read.nameOf(info.path)
  ).children(
    h.tbody.children(
      h.tr.attr("data-kind", "instance").children(
        h.th.attr("scope", "row").children("Instance"),
        h.td.children(info.path),
        h.td.children(
          info.mounted === undefined
            ? "mounted before the buffer"
            : h.span.children(
              "mounted ",
              SeqLink(h, Read.refOf(session, info.mounted))
            )
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
      session.records(info.instance).map((record) =>
        recordRow(h, session, record)
      )
    )
  )
}

interface Section {
  readonly value: string
  readonly label: string
  readonly count?: string
  readonly unit?: string
  readonly body: () => Children
}

const Details = (
  h: H,
  session: Session,
  entry: Entry,
  info: Inspector.Instance | undefined,
  model: OverlayModel
) => {
  const state = entry._tag === "Update" || entry._tag === "Mounted" ||
      entry._tag === "Waiting"
    ? entry
    : undefined
  const previous = state === undefined ? undefined : session.previous(entry.seq)
  const resolved = previous === undefined
    ? undefined
    : session.resolve(previous.seq)
  const before =
    resolved !== undefined && resolved._tag !== "Outside" && "model" in resolved
      ? resolved
      : previous?.model !== undefined && previous.props !== undefined
      ? { seq: previous.seq, model: previous.model, props: previous.props }
      : undefined
  const unavailable = previous !== undefined && before === undefined
  const changes = state === undefined || before === undefined
    ? []
    : Inspector.diff(before.model, state.model)
  const changed = changes.filter((change) => change.kind !== "unknown").length
  const commands = Read.isIssuing(entry) ? entry.commands : []
  const events = Read.isIssuing(entry) ? entry.events : []
  const name = "path" in entry ? Read.nameOf(entry.path) : "this instance"
  const Props = (): Children => {
    if (state === undefined) return []
    const propChanges = before === undefined
      ? []
      : Inspector.diff(before.props, state.props)
    return [
      h.h4.children(
        "Props",
        before === undefined ? null : h.span.class("muted").children(
          " · " + propsText[Read.statusOf(propChanges)],
          SeqLink(h, Read.refOf(session, before.seq))
        )
      ),
      Tree(h, state.props, propChanges)
    ]
  }
  const sections: ReadonlyArray<Section> = [
    ...(state === undefined ? [] : [{
      value: "model",
      label: "Model",
      ...(unavailable
        ? { count: "no diff" }
        : previous === undefined
        ? {}
        : {
          count: String(changed),
          unit: changed === 1 ? "change" : "changes"
        }),
      body: () => [
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
        VirtualTree(
          h,
          "Model after #" + entry.seq,
          String(entry.seq),
          Read.treeOf(state.model, changes, new Set(model.expanded))
        )
      ]
    }]),
    ...(entry._tag === "Update"
      ? [{
        value: "message",
        label: "Message",
        body: () => [
          h.p.class("note").children("From " + sourceText(entry.source)),
          Tree(h, entry.message, []),
          ...Props()
        ]
      }]
      : state === undefined
      ? []
      : [{ value: "props", label: "Props", body: Props }]),
    ...(Read.isIssuing(entry)
      ? [{
        value: "commands",
        label: "Commands",
        ...(commands.length === 0 ? {} : { count: String(commands.length) }),
        body: () =>
          commands.length === 0
            ? [h.p.class("note").children("This entry issued no command.")]
            : [
              h.ol.class("commands").children(
                commands.map((command, index) => {
                  const run = command._tag === "Interrupt"
                    ? undefined
                    : session.run({ seq: entry.seq, index })
                  return h.li.key(String(index)).children(
                    h.div.children(
                      command._tag === "Interrupt"
                        ? "Interrupt " + command.name
                        : command.name,
                      run === undefined
                        ? null
                        : h.span.class("muted").children(
                          " " + runText(run) + " "
                        ),
                      run?.end === undefined
                        ? null
                        : SeqLink(h, Read.refOf(session, run.end))
                    ),
                    h.div.class("args").children(
                      ...(command._tag === "Interrupt"
                        ? []
                        : Json(h, command.args)),
                      command.group === null
                        ? null
                        : h.span.class("muted").children(
                          " group " + command.group
                        )
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
      body: () => [
        h.ol.class("commands").children(
          events.map((event, index) =>
            h.li.key(String(index)).class("args").children(...Json(h, event))
          )
        )
      ]
    }]),
    ...(info === undefined ? [] : [{
      value: "lifecycle",
      label: "Lifecycle",
      body: () => [Lifecycle(h, session, info)]
    }]),
    {
      value: "raw",
      label: "Raw",
      body: () => {
        const frame = JSON.stringify(entry, null, 2)
        return [
          h.div.class("raw-head").children(
            h.p.class("note").children("The frame as the log encoded it"),
            h.button.class("copy").ref(CopyButton).onClick(
              OverlayMessage.ClickedCopyFrame({ seq: entry.seq, text: frame })
            ).children(model.copied === entry.seq ? "Copied" : "Copy frame")
          ),
          h.pre.class("raw").children(frame)
        ]
      }
    }
  ]
  return Tabs(h, {
    props: {
      value: sections.some((section) => section.value === model.tab)
        ? model.tab
        : sections[0]!.value,
      tabs: sections.map(({ value }) => ({ value }))
    },
    onEmit: { Selected: ({ value }) => OverlayMessage.SelectedTab({ value }) },
    view: (t) =>
      t.root(h.div.class("details")).children(
        t.list(h.div.class("tabs").attr("aria-label", "Entry details"))
          .children(
            ...sections.map((section) =>
              t.tab({
                element: h.button.class("tab").children(
                  section.label,
                  section.count === undefined ? null : " ",
                  section.count === undefined ?
                    null :
                    h.small.class("pill").children(
                      section.count,
                      section.unit === undefined
                        ? null
                        : h.span.class("unit").children(" " + section.unit)
                    )
                ),
                value: section.value
              })
            )
          ),
        ...sections.map((section) =>
          t.panel({
            element: h.div.class("pane", section.value === "model" && "model"),
            value: section.value
          })
            ?.children(section.body())
        )
      )
  })
}

const Crumbs = (h: H, path: string, scope: string | null) => {
  const segments = path.split("/").slice(1)
  return h.nav.class("crumbs").attr("aria-label", "Path of the instance")
    .children(
      segments.flatMap((segment, index) => {
        const at = "/" + segments.slice(0, index + 1).join("/")
        return [
          index === 0
            ? null
            : h.span.class("slash").attr("aria-hidden", "true").children("/"),
          h.button.class(
            "crumb",
            "code",
            index === segments.length - 1 && "here"
          ).attr(
            "aria-pressed",
            String(scope === at)
          )
            .attr(
              "title",
              "Show only " + segment + " and the instances under it"
            )
            .onClick(OverlayMessage.ClickedScope({ path: at })).children(
              segment
            )
        ]
      })
    )
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
  const kind = entry._tag === "Update"
    ? "Update"
    : label.text === entry._tag
    ? "Entry"
    : entry._tag
  const paintable = feed.paintable(entry.session, entry.seq)
  const shown = shows(model, entry.session, entry.seq)
  return [
    h.section.class("ehead").children(
      h.div.class("ehead-top").children(
        h.h3.class("headline").children(
          Name(h, entry, label.text),
          label.detail === undefined ? null : " " + label.detail
        ),
        h.button.class("show", shown && "on").attr(
          "aria-pressed",
          String(shown)
        ).disabled(!paintable)
          .attr(
            "title",
            paintable
              ? "Open the time travel slider at this entry"
              : "No longer held, or no page to show it on"
          )
          .onClick(
            OverlayMessage.ClickedTimeTravel({
              session: entry.session,
              seq: entry.seq
            })
          ).children(
            "Time travel"
          )
      ),
      h.p.class("sub").children(
        kind + " #" + entry.seq,
        origin === undefined
          ? ""
          : ", " + Read.position(entry.at - origin) + " after start"
      ),
      "path" in entry ? Crumbs(h, entry.path, model.scope) : null,
      Chain(h, steps)
    ),
    Details(h, session, entry, info, model)
  ]
}

const Panel = (h: H, model: OverlayModel) => {
  const feed = h.props.feed
  const session = sessionOf(feed, model)
  if (session === undefined) {
    return h.div.class("panel", "empty").attr("role", "dialog").attr(
      "aria-label",
      "Effect UI inspector"
    ).children(
      h.span.class("grip").attr("aria-hidden", "true"),
      Header(h, undefined, 0, model),
      h.p.class("empty-note").children(
        "Nothing logged yet. Entries appear here as the app runs."
      )
    )
  }
  const entries = session.entries()
  const scope = model.scope
  const scoped = scope === null
    ? entries
    : entries.filter((entry) =>
      "path" in entry && Read.isUnder(entry.path, scope)
    )
  const timeline = scoped.filter((entry) => Read.matches(entry, model.filter))
    .reverse()
  const hidden = model.filter === "messages"
    ? scoped.length - timeline.length
    : 0
  const selected = model.selected === null
    ? timeline[0]
    : session.resolve(model.selected)
  const entry = selected === undefined || selected._tag === "Outside"
    ? undefined
    : selected
  const steps = entry === undefined ? [] : Read.chainOf(session, entry)
  const at = entry === undefined ? undefined : Read.instanceOf(entry)
  const owner = at === undefined ? undefined : session.summary(at)
  const shown = scope === null ? owner : session.summaryAt(scope)
  return h.div.class("panel", model.paused !== null && "pausing").attr(
    "role",
    "dialog"
  ).attr(
    "aria-label",
    "Effect UI inspector"
  ).attr("data-pane", model.pane).children(
    h.span.class("grip").attr("aria-hidden", "true"),
    Header(h, session, entries.length, model),
    model.paused === null
      ? null
      : PausedBar(h, model.paused, timeline, feed.paintable),
    h.div.class("body").children(
      h.div.class("left").children(
        Instances(h, session, model, owner),
        Filters(h, model),
        Timeline(
          h,
          session,
          model,
          timeline,
          entries.at(-1)?.seq ?? 0,
          hidden,
          selected?.seq,
          steps
        )
      ),
      h.div.class("right").children(
        h.button.class("back").attr("aria-label", "Back to the timeline")
          .onClick(OverlayMessage.ClickedBack())
          .children("← Timeline"),
        entry === undefined
          ? h.section.class("ehead").children(
            h.h3.class("headline").children(
              selected === undefined ? "No entry" : "#" + selected.seq
            ),
            h.p.class("sub").children(
              selected === undefined
                ? "Nothing matches the filter."
                : "Outside the buffer."
            )
          )
          : Inspected(h, feed, session, entry, shown, steps, model)
      )
    )
  )
}

const synced = (model: OverlayModel, feed: Feed) => {
  const paused = feed.paused() ?? null
  return paused?.session === model.paused?.session &&
      paused?.seq === model.paused?.seq
    ? {}
    : { paused }
}

const Launcher = (h: H, model: OverlayModel) => {
  const failures = h.props.feed.failures() - model.failures
  return h.div.class("launch").children(
    h.button.class("launcher").attr(
      "aria-label",
      "Open the Effect UI inspector"
    ).onClick(OverlayMessage.ClickedOpen())
      .children(
        h.span.class("logo").attr("aria-hidden", "true"),
        "Effect UI",
        h.span.class("launcher-count").children(
          String(sessionOf(h.props.feed, model)?.entries().length ?? 0)
        )
      ),
    failures <= 0 ?
      null :
      h.span.class("alert").attr(
        "title",
        plural(failures, " failure", " failures") +
          " since the inspector was closed"
      )
        .children(
          Mark(h, "bad"),
          String(failures),
          h.span.class("sr").children(failures === 1 ? " failure" : " failures")
        ),
    model.paused === null ? null : PausedBadge(h, model.paused.seq)
  )
}

const resumePage = () => Paint.make({ session: "", seq: null })

const repaint = (model: OverlayModel, feed: Feed, seq: number) => {
  const session = sessionOf(feed, model)
  return model.paused !== null && session !== undefined &&
      feed.paintable(session.id, seq)
    ? [Paint.make({ session: session.id, seq })]
    : []
}

export const Overlay = Component.define({
  name: "DevToolsOverlay",
  scoped: false,
  props: OverlayProps,
  model: OverlayModel,
  message: OverlayMessage,
  elements: Html
}).make({
  init: ($) => ({
    open: $.props.feed.open,
    revision: 0,
    selected: null,
    filter: "messages",
    scope: null,
    browse: false,
    find: "",
    branches: [],
    failures: 0,
    tab: "model",
    copied: null,
    pinned: true,
    atStart: true,
    reveal: null,
    pins: 0,
    pane: "timeline",
    paused: null,
    expanded: []
  }),
  update: {
    ReceivedFrames: ($) =>
      $.evolve({
        revision: increment,
        ...($.model.reveal === null
          ? {}
          : { reveal: null, pinned: $.model.atStart, pins: increment }),
        ...synced($.model, $.props.feed)
      }),
    ClickedOpen: ($) =>
      $.evolve({ open: true, atStart: true, ...following }).run(
        SaveOpen.make({ open: true })
      ),
    ClickedClose: ($) =>
      $.evolve({ open: false, failures: $.props.feed.failures() }).run(
        SaveOpen.make({ open: false })
      ),
    ClickedEntry: ($, { seq }) =>
      $.evolve({
        selected: seq,
        pane: "entry",
        ...($.model.pinned ? { pins: increment } : {})
      })
        .run(...repaint($.model, $.props.feed, seq)),
    ClickedLink: ($, { seq }) =>
      $.evolve({
        selected: seq,
        filter: "all",
        scope: null,
        pinned: false,
        reveal: seq,
        pins: increment
      })
        .run(...repaint($.model, $.props.feed, seq)),
    ClickedScope: ($, { path }) =>
      $.evolve({ scope: $.model.scope === path ? null : path }),
    TypedFind: ($, { text }) => $.evolve({ find: text }),
    ClickedBrowse: ($, { branches, browse }) => $.evolve({ browse, branches }),
    ToggledBranch: ($, { path }) =>
      $.evolve({
        branches: (paths) =>
          paths.includes(path)
            ? paths.filter((open) => open !== path)
            : [...paths, path]
      }),
    ClickedFilter: ($, { filter }) => $.evolve({ filter }),
    ClickedFollowLatest: ($) => {
      const next = $.evolve({ selected: null, ...following })
      return $.model.paused === null
        ? next
        : next.evolve({ paused: null }).run(resumePage())
    },
    ClickedBack: ($) => $.evolve({ pane: "timeline" }),
    ScrolledTimeline: ($, { atStart }) =>
      atStart
        ? $.model.reveal !== null || $.model.pinned
          ? $.evolve({ atStart })
          : $.evolve({ atStart, pinned: true, pins: increment })
        : $.evolve({ atStart, pinned: false, reveal: null }),
    SelectedTab: ($, { value }) => $.evolve({ tab: value }),
    ToggledModelPath: ($, { path }) =>
      $.evolve({
        expanded: (paths) =>
          paths.includes(path)
            ? paths.filter((open) => open !== path)
            : [...paths, path]
      }),
    ClickedCopyFrame: ($, { seq, text }) =>
      $.evolve({ copied: null }).run(CopyFrame.make({ seq, text })),
    SucceededCopyFrame: ($, { seq }) => $.evolve({ copied: seq }),
    FailedCopyFrame: ($) => $.evolve({ copied: null }),
    ClickedTimeTravel: ($, { session, seq }) =>
      shows($.model, session, seq)
        ? $.evolve({ paused: null }).run(resumePage())
        : $.run(Paint.make({ session, seq })),
    ScrubbedPage: ($, { seq }) =>
      $.evolve({ selected: seq, pinned: false, reveal: seq, pins: increment })
        .run(
          Paint.make({
            session: sessionOf($.props.feed, $.model)?.id ?? "",
            seq
          })
        ),
    ClickedResume: ($) => $.evolve({ paused: null }).run(resumePage()),
    ClickedClear: ($) => {
      const session = sessionOf($.props.feed, $.model)
      return $.model.paused !== null || session === undefined
        ? $.model
        : $.run(Clear.make({ session: session.id }))
    },
    Cleared: ($) => {
      const session = sessionOf($.props.feed, $.model)
      const hasScope = $.model.scope !== null &&
        session?.summaryAt($.model.scope) !== undefined
      return $.evolve({
        revision: increment,
        selected: null,
        scope: hasScope ? $.model.scope : null,
        atStart: true,
        ...following
      })
    },
    Painted: ($, paused) => $.evolve({ paused })
  },
  subscriptions: ({ props }) => [
    Subscription.make(
      "devtools/frames",
      props.feed.changes.pipe(Stream.map(() => OverlayMessage.ReceivedFrames()))
    )
  ],
  view: (h, model) =>
    h.div.class("overlay").children(
      model.open
        ? Panel(h, model)
        : Launcher(h, model)
    )
})
