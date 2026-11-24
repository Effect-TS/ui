/**
 * Runs the children a view writes inside `h.keepAlive`. A component carries it as its `~kept`, so the
 * kernel never imports it.
 *
 * A kept child belongs to its author, the instance whose view wrote it, at `Name[key]` under it wherever
 * it's drawn. A Rec that stops drawing it leaves it in its author's table, and once the flush's render
 * pass is over a child no Rec took has its nodes moved into a container and its mounts stopped.
 *
 * @internal
 */
import * as Cause from "effect/Cause"
import * as View from "../View.ts"
import type * as Kernel from "./kernel.ts"
import { segment } from "./paths.ts"

type Inst = Kernel.Instance
type Rec = Kernel.Rec
type Alive = (input: unknown) => boolean

/** @internal */
export interface Entry {
  readonly inst: Inst
  /** The Rec that draws it, or `undefined` while no view does. */
  rec: Rec | undefined
  alive: Alive | undefined
  /** The author's render that last wrote it, or -1 for a write outside one. */
  round: number
}

/** The kept children whose mounts are stopped: each a kept one holds, while it's kept. */
const off = new WeakSet<Inst>()

const blankView = View.text("")

const failLater = (inst: Inst, error: unknown): void =>
  inst.tree.schedule(() => inst.tree.ops.fail(inst, "view", Cause.die(error)))

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
      for (const entry of this.kids.values()) author.tree.ops.close(entry.inst)
    })
  }
  /**
   * Once the author's view is patched: fails it when an ordinary child of its view has the path of a
   * kept one it wrote, and asks the predicate of each kept one it didn't write, unless it's drawn where a
   * placement is held.
   */
  done(): void {
    const author = this.author
    const plain = new Set<string>()
    if (author.rendered !== undefined) plainOf(author.rendered, plain)
    for (const [named, entry] of this.kids) {
      if (entry.round === this.round) {
        if (plain.has(named)) failTwice(author, named)
      } else if (
        entry.alive !== undefined &&
        (entry.inst.under === undefined ||
          author.tree.held?.(entry.inst.under) !== true)
      ) {
        this.ask(entry.alive, entry.inst.at!.v as View.Child<any, any>, entry)
      }
    }
    this.round++
  }
  /** Whether the child lives on. A child the predicate ends is closed, and a Rec drawing it left blank. */
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
      failLater(author, error)
    }
    author.tree.ended?.(author, author.path + "/" + segment(view))
    if (entry !== undefined) {
      this.kids.delete(segment(view))
      if (entry.rec !== undefined) vacate(author, entry.rec, true)
      entry.rec = undefined
      author.tree.ops.close(entry.inst)
    }
    return false
  }
}

/** The segments of the ordinary children a view writes, whose paths are under its author's. */
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
  failLater(
    author,
    new Error(author.path + " writes " + named + " twice in one render")
  )

/** Leaves a blank where `rec` drew a kept child, dropping the child's nodes too when `drop`. */
const vacate = (author: Inst, rec: Rec, drop: boolean): void => {
  const { host, ops } = author.tree
  const first = ops.nodeOf(rec)
  const parent = host.parentOf(first)
  const blank = ops.create(author, blankView)
  const kids = rec.kids
  if (parent != null) {
    host.insert(parent, blank.node, first)
    if (drop || kids !== undefined) ops.unplace(host, parent, rec)
  }
  if (kids !== undefined) {
    for (let index = kids.length - 1; index >= 0; index--) {
      ops.release(author, kids[index]!)
    }
  }
  rec.kids = [blank]
  rec.inst = author
}

/** Starts or stops the mounts of a kept child's elements. */
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

/** Moves the nodes of each released child no Rec took into a container, once a render pass is over. */
const park = (tree: Kernel.Tree, entries: Array<Entry>): void => {
  for (const entry of entries.splice(0)) {
    const child = entry.inst
    if (entry.rec !== undefined || child.closed || off.has(child)) continue
    const make = tree.host.createContainer
    if (make === undefined) {
      failLater(
        child.parent!,
        new Error(child.path + " is kept, and this host has no createContainer")
      )
      continue
    }
    tree.ops.place(tree.host, make(), child.rendered!, null)
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
  if (!tree.scheduled) {
    tree.scheduled = true
    tree.schedule(() => tree.ops.flush(tree))
  }
}

const blank = (author: Inst, rec: Rec): void => {
  rec.kids = [author.tree.ops.create(author, blankView)]
}

/** @internal */
export const keeper: Kernel.Keeper = {
  mount(author, rec, at) {
    const view = rec.v as View.Child<any, any>
    const tree = author.tree
    const ops = tree.ops
    const table = (author.kept ??= new Table(author)) as Table
    const named = segment(view)
    const entry = table.kids.get(named)
    const alive = aliveOf(view)
    // A write outside the author's render, as a receiver draws a slot, can't be a second one.
    const round = author.writing > 0 ? table.round : -1
    if (
      entry !== undefined &&
      (round === entry.round && round >= 0 && entry.rec !== undefined ||
        // The component written, as a lazy one's instance runs the one it loaded.
        (entry.inst.at!.v as View.Child<any, any>).component !== view.component)
    ) {
      failTwice(author, named)
      return blank(author, rec)
    }
    // A receiver kept with an old write draws it again: it takes nothing the author wrote since.
    if (
      round < 0 && at !== undefined &&
      (entry === undefined || entry.inst.at!.v !== view)
    ) {
      for (const other of table.kids.values()) {
        if (off.has(other.inst) && at.startsWith(other.inst.path + "/")) {
          return blank(author, rec)
        }
      }
    }
    if (alive !== undefined && !table.ask(alive, view, entry)) {
      return blank(author, rec)
    }
    if (entry === undefined) {
      ops.mountChild(author, rec, true)
      table.kids.set(named, {
        inst: rec.inst,
        rec,
        alive,
        round
      })
      return
    }
    entry.alive = alive
    entry.round = round
    const child = entry.inst
    const last = child.at!
    if (entry.rec !== undefined) vacate(author, entry.rec, false)
    else if (last.kids !== undefined) {
      for (let index = last.kids.length - 1; index >= 0; index--) {
        ops.release(author, last.kids[index]!)
      }
      last.kids = undefined
    }
    rec.inst = child
    ;(child as { at: Rec }).at = rec
    child.under = at
    entry.rec = rec
    if (child.closed) {
      rec.kids = [ops.stand(child, child.failure!)]
      return
    }
    if (off.has(child)) {
      off.delete(child)
      toggle(child.rendered!, true)
      tree.log?.(child, { _tag: "Drawn" })
    }
    tree.drawn?.(child, true)
    ops.patchChild(author, rec, view)
  },
  patch(inst, old, view) {
    const table = inst.kept as Table | undefined
    const entry = table?.kids.get(segment(view))
    if (entry === undefined || entry.rec !== old) {
      // A blank, or a Rec whose child moved or ended: it's written again.
      return inst.tree.ops.replace(inst, old, view)
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
    if (rec.inst === owner) return true
    const entry = (owner.kept as Table | undefined)?.kids.get(
      segment(rec.v as View.Child<any, any>)
    )
    if (entry === undefined || entry.rec !== rec || owner.closed) return false
    entry.rec = undefined
    if (!entry.inst.closed) keep(owner.tree, entry)
    else {
      const kids = rec.kids!
      for (let index = kids.length - 1; index >= 0; index--) {
        owner.tree.ops.release(owner, kids[index]!)
      }
      rec.kids = undefined
    }
    return true
  }
}
