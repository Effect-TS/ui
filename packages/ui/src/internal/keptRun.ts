import * as View from "../View.ts"
import * as Kernel from "./kernel.ts"
import * as lazy from "./lazy.ts"
import { checkFallbackPaths, heldPaths, segment } from "./paths.ts"

type Inst = Kernel.Instance
type Rec = Kernel.Rec
type Alive = (input: unknown) => boolean

/** @internal */
export interface Entry {
  readonly inst: Inst
  rec: Rec | undefined
  loading: Rec | undefined
  under: string | undefined
  parked: boolean
  alive: Alive | undefined
  round: number
}

const atOf = (entry: Entry): Rec => entry.loading ?? entry.inst.at!

const underOf = (entry: Entry): string | undefined =>
  entry.loading === undefined ? entry.inst.under : entry.under

const off = new WeakSet<Inst>()

const blankView = View.text("")

const aliveOf = (view: View.Child<any, any>): Alive | undefined =>
  view.alive === true ? undefined : view.alive

/** @internal */
export class Table {
  readonly author: Inst
  readonly kids = new Map<string, Entry>()
  round = 0
  constructor(author: Inst) {
    this.author = author
    ;(author.closers ??= []).push(() => {
      for (const entry of this.kids.values()) drop(author, entry)
    })
  }
  parked(): ReadonlyArray<Rec> {
    const out: Array<Rec> = []
    for (const entry of this.kids.values()) {
      if (entry.loading !== undefined && entry.rec === undefined) {
        out.push(entry.loading)
      }
    }
    return out
  }
  done(): void {
    const author = this.author
    const plain = new Set<string>()
    if (author.rendered !== undefined) plainOf(author.rendered, plain)
    for (const [named, entry] of this.kids) {
      if (entry.round === this.round) {
        if (plain.has(named)) failTwice(author, named)
      } else if (entry.alive !== undefined) {
        const under = underOf(entry)
        if (under === undefined || author.tree.held?.(under) !== true) {
          this.ask(entry.alive, atOf(entry).v as View.Child<any, any>, entry)
        }
      }
    }
    this.round++
  }
  ask(
    alive: Alive,
    view: View.Child<any, any>,
    entry: Entry | undefined
  ): boolean {
    const author = this.author
    let read = false
    try {
      const result = alive({
        key: view.key,
        get model() {
          read = true
          return author.model
        },
        get props() {
          read = true
          return author.props
        },
        get queries() {
          read = true
          return author.results
        }
      })
      if (!read) {
        throw new Error(
          author.path +
            ": an h.keepAlive predicate reads the Model from its argument: ({ model, key }) => key in model.items"
        )
      }
      if (result === true) return true
    } catch (error) {
      Kernel.failLater(author, error)
    }
    author.tree.ended?.(author, author.path + "/" + segment(view))
    if (entry !== undefined) end(this, segment(view), entry)
    return false
  }
}

const end = (table: Table, named: string, entry: Entry): void => {
  table.kids.delete(named)
  if (entry.rec !== undefined) vacate(table.author, entry.rec, true)
  entry.rec = undefined
  drop(table.author, entry)
}

const drop = (author: Inst, entry: Entry): void => {
  const at = entry.loading
  if (at === undefined) return Kernel.close(entry.inst)
  lazy.unwatch(at)
  if (entry.rec === undefined) Kernel.release(author, at)
}

const plainOf = (rec: Rec, out: Set<string>): void => {
  const view = rec.v
  if (view._tag === "Child") {
    if (view.alive === undefined) out.add(segment(view))
  } else if (view._tag === "Element" && rec.kids !== undefined) {
    for (let index = 0; index < rec.kids.length; index++) {
      plainOf(rec.kids[index]!, out)
    }
  }
}

const failTwice = (author: Inst, named: string): void =>
  Kernel.failLater(
    author,
    new Error(author.path + " writes " + named + " twice in one render")
  )

const vacate = (author: Inst, rec: Rec, drop: boolean): void => {
  const host = author.tree.host
  const first = Kernel.nodeOf(rec)
  const parent = host.parentOf(first)
  const blank = Kernel.create(author, blankView)
  const kids = rec.kids
  if (parent != null) {
    host.insert(parent, blank.node, first)
    if (drop || kids !== undefined) Kernel.unplace(host, parent, rec)
  }
  if (kids !== undefined) {
    for (let index = kids.length - 1; index >= 0; index--) {
      Kernel.release(author, kids[index]!)
    }
  }
  rec.kids = [blank]
  rec.inst = author
}

const toggle = (rec: Rec, on: boolean): void => {
  const view = rec.v
  if (view._tag === "Child") {
    if (on) off.delete(rec.inst)
    else off.add(rec.inst)
  }
  if (view._tag === "Element" && view.mount !== undefined) {
    const mount = view.mount as unknown as Kernel.Attachable
    if (on) mount["~attach"](rec)
    else mount["~detach"](rec)
  }
  const kids = rec.kids
  if (kids !== undefined) {
    for (let index = 0; index < kids.length; index++) toggle(kids[index]!, on)
  } else if (view._tag === "Child" && rec.inst.rendered !== undefined) {
    toggle(rec.inst.rendered, on)
  }
}

const keeping = new WeakMap<Kernel.Tree, Array<Entry>>()

const parkLoading = (tree: Kernel.Tree, entry: Entry): void => {
  const author = entry.inst
  const at = entry.loading!
  const named = segment(at.v as View.Child<any, any>)
  if (
    entry.rec !== undefined || entry.parked || author.closed ||
    (author.kept as Table).kids.get(named) !== entry
  ) return
  const make = tree.host.createContainer
  if (make === undefined) {
    return Kernel.failLater(
      author,
      new Error(
        author.path + "/" + named +
          " is kept, and this host has no createContainer"
      )
    )
  }
  const fallback = at.kids![0]!
  Kernel.place(tree.host, make(), fallback, null)
  entry.parked = true
  toggle(fallback, false)
}

const park = (tree: Kernel.Tree, entries: Array<Entry>): void => {
  for (const entry of entries.splice(0)) {
    if (entry.loading !== undefined) {
      parkLoading(tree, entry)
      continue
    }
    const child = entry.inst
    if (entry.rec !== undefined || child.closed || off.has(child)) continue
    const make = tree.host.createContainer
    if (make === undefined) {
      Kernel.failLater(
        child.parent!,
        new Error(child.path + " is kept, and this host has no createContainer")
      )
      continue
    }
    Kernel.place(tree.host, make(), child.rendered!, null)
    off.add(child)
    toggle(child.rendered!, false)
    tree.drawn?.(child, false)
    tree.log?.(child, { _tag: "Kept" })
  }
}

const keep = (tree: Kernel.Tree, entry: Entry): void => {
  let entries = keeping.get(tree)
  if (entries === undefined) {
    const list: Array<Entry> = entries = []
    keeping.set(tree, list)
    const work = tree.work
    tree.work = (idle) => {
      park(tree, list)
      return work?.(idle) === true
    }
  }
  entries.push(entry)
  Kernel.wake(tree)
}

const held = (author: Inst, rec: Rec): boolean =>
  rec.inst === author && rec.kids![0]!.v !== blankView

const blank = (author: Inst, rec: Rec): void => {
  rec.kids = [Kernel.create(author, blankView)]
}

const draw = (
  author: Inst,
  entry: Entry,
  rec: Rec,
  at: string | undefined,
  view: View.Child<any, any>
): void => {
  const from = entry.loading!
  const fallback = from.kids![0]!
  lazy.unwatch(from)
  if (entry.rec === undefined) from.kids = undefined
  else {
    const host = author.tree.host
    const first = Kernel.nodeOf(fallback)
    const parent = host.parentOf(first)
    const left = Kernel.create(author, blankView)
    if (parent != null) {
      host.insert(parent, left.node, first)
      Kernel.unplace(host, parent, fallback)
    }
    from.kids = [left]
  }
  rec.inst = author
  rec.kids = [fallback]
  entry.loading = entry.rec = rec
  entry.under = at
  if (entry.parked) {
    entry.parked = false
    toggle(fallback, true)
  }
  if (lazy.stateOf(view.component as any)._tag !== "Failed") {
    ;(view.component as Kernel.Runnable)["~load"]!(author, rec, at)
  }
  Kernel.patchChild(author, rec, view)
}

const holders = (
  author: Inst,
  rec: Rec,
  out: Array<View.Child<any, any>>
): void => {
  const view = rec.v
  const kids = rec.kids
  if (view._tag === "Element") {
    if (kids !== undefined) {
      for (let index = 0; index < kids.length; index++) {
        holders(author, kids[index]!, out)
      }
    }
  } else if (view._tag === "Child" && view.alive === undefined) {
    if (kids === undefined) out.push(view)
    else {
      if (rec.inst === author) out.push(view)
      holders(author, kids[0]!, out)
    }
  }
}

const heldBy = (
  author: Inst,
  named: string
): Array<View.Child<any, any>> => {
  const out: Array<View.Child<any, any>> = []
  if (author.rendered !== undefined) holders(author, author.rendered, out)
  const table = author.kept as Table | undefined
  if (table !== undefined) {
    for (const [key, entry] of table.kids) {
      if (key === named) continue
      out.push(atOf(entry).v as View.Child<any, any>)
      if (entry.loading !== undefined) {
        holders(author, entry.loading.kids![0]!, out)
      }
    }
  }
  return out
}

/** @internal */
export const keeper: Kernel.Keeper = {
  mount(author, rec, at) {
    const view = rec.v as View.Child<any, any>
    const tree = author.tree
    const table = (author.kept ??= new Table(author)) as Table
    const named = segment(view)
    let entry = table.kids.get(named)
    if (entry !== undefined && entry.loading === rec) {
      table.kids.delete(named)
      entry = undefined
    }
    const alive = aliveOf(view)
    const round = author.writing > 0 ? table.round : -1
    if (
      entry !== undefined &&
      (round === entry.round && round >= 0 && entry.rec !== undefined ||
        (atOf(entry).v as View.Child<any, any>).component !== view.component)
    ) {
      failTwice(author, named)
      return blank(author, rec)
    }
    if (
      round < 0 && at !== undefined &&
      (entry === undefined || atOf(entry).v !== view)
    ) {
      for (const other of table.kids.values()) {
        if (
          other.loading === undefined && off.has(other.inst) &&
          at.startsWith(other.inst.path + "/")
        ) {
          return blank(author, rec)
        }
      }
    }
    if (alive !== undefined && !table.ask(alive, view, entry)) {
      return blank(author, rec)
    }
    if (
      entry?.loading !== undefined &&
      lazy.stateOf(view.component as any)._tag === "Loaded"
    ) {
      end(table, named, entry)
      entry = undefined
    }
    if (entry === undefined) {
      Kernel.mountChild(author, rec, true)
      if (rec.inst !== author) {
        table.kids.set(named, {
          inst: rec.inst,
          rec,
          loading: undefined,
          under: undefined,
          parked: false,
          alive,
          round
        })
      } else if (lazy.isLazy(view.component)) {
        table.kids.set(named, {
          inst: author,
          rec,
          loading: rec,
          under: at,
          parked: false,
          alive,
          round
        })
      }
      return
    }
    entry.alive = alive
    entry.round = round
    if (entry.loading !== undefined) return draw(author, entry, rec, at, view)
    const child = entry.inst
    const last = child.at!
    if (entry.rec !== undefined) vacate(author, entry.rec, false)
    else if (last.kids !== undefined) {
      for (let index = last.kids.length - 1; index >= 0; index--) {
        Kernel.release(author, last.kids[index]!)
      }
      last.kids = undefined
    }
    rec.inst = child
    ;(child as { at: Rec }).at = rec
    child.under = at
    entry.rec = rec
    if (child.closed) {
      rec.kids = [Kernel.stand(child, child.failure!)]
      return
    }
    if (off.has(child)) {
      off.delete(child)
      toggle(child.rendered!, true)
      tree.log?.(child, { _tag: "Drawn" })
    }
    tree.drawn?.(child, true)
    Kernel.patchChild(author, rec, view)
  },
  patch(inst, old, view, at) {
    const named = segment(view)
    let table = inst.kept as Table | undefined
    let entry = table?.kids.get(named)
    if (view.alive === undefined) {
      if (entry === undefined || entry.rec !== old) {
        return Kernel.replace(inst, old, view)
      }
      table!.kids.delete(named)
      return underOf(entry) === undefined
        ? undefined
        : Kernel.replace(inst, old, view)
    }
    const loading = old.inst === inst && old.kids !== undefined
    if (
      (old.v as View.Child<any, any>).alive === undefined &&
      entry === undefined && !old.inst.closed &&
      (loading
        ? at === undefined
        : old.kids === undefined && old.inst.parent === inst &&
          old.inst.under === undefined)
    ) {
      table = (inst.kept ??= new Table(inst)) as Table
      table.kids.set(
        named,
        entry = {
          inst: old.inst,
          rec: old,
          loading: loading ? old : undefined,
          under: undefined,
          parked: false,
          alive: undefined,
          round: -1
        }
      )
    }
    if (entry === undefined || entry.rec !== old) {
      if (held(inst, old)) return undefined
      return Kernel.replace(inst, old, view)
    }
    const alive = aliveOf(view)
    if (alive !== undefined && !table!.ask(alive, view, entry)) {
      old.v = view
      return old
    }
    entry.alive = alive
    entry.round = inst.writing > 0 ? table!.round : -1
    return undefined
  },
  release(owner, rec) {
    const entry = (owner.kept as Table | undefined)?.kids.get(
      segment(rec.v as View.Child<any, any>)
    )
    if (rec.inst === owner) {
      if (
        entry === undefined || entry.loading !== rec || entry.rec !== rec ||
        owner.closed
      ) return !held(owner, rec)
      entry.rec = undefined
      lazy.unwatch(rec)
      keep(owner.tree, entry)
      return true
    }
    if (entry === undefined || entry.rec !== rec || owner.closed) return false
    entry.rec = undefined
    if (!entry.inst.closed) keep(owner.tree, entry)
    else {
      const kids = rec.kids!
      for (let index = kids.length - 1; index >= 0; index--) {
        Kernel.release(owner, kids[index]!)
      }
      rec.kids = undefined
    }
    return true
  },
  shows(author, view, fallback) {
    try {
      checkFallbackPaths(
        heldPaths(author, heldBy(author, segment(view))),
        view,
        fallback
      )
      return fallback
    } catch (error) {
      Kernel.failLater(author, error)
      return blankView
    }
  }
}
