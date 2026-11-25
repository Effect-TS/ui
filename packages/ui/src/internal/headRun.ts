import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import type * as Component from "../Component.ts"
import type * as Head from "../Head.ts"
import type * as View from "../View.ts"
import { skipsEmpty } from "./headFold.ts"
import * as heads from "./heads.ts"
import * as Kernel from "./kernel.ts"
import { report } from "./queryCore.ts"

const none: ReadonlyArray<never> = []

const foldOf = (inst: Kernel.Instance): View.HeadFold | undefined => {
  const elements = (inst.component as unknown as Component.Any).elements
  return elements?.head ??
    (heads.html !== undefined && elements?.name === "html"
      ? heads.html
      : undefined)
}

const placed = (rec: Kernel.Rec, out: Array<Kernel.Instance>): void => {
  const kids = rec.kids
  if (rec.v._tag === "Child" && kids === undefined) {
    if (rec.inst !== undefined) out.push(rec.inst)
    return
  }
  if (kids !== undefined) {
    for (let index = 0; index < kids.length; index++) {
      placed(kids[index]!, out)
    }
  }
}

const foldings = new WeakMap<Kernel.Tree, Folding>()

class Folding {
  readonly root: Kernel.Instance
  readonly neutral: View.HeadFold
  readonly active = new Set<Kernel.Instance>()
  given: string | undefined = undefined
  constructor(root: Kernel.Instance, neutral: View.HeadFold) {
    this.root = root
    this.neutral = neutral
  }
  run(): boolean {
    const tree = this.root.tree
    const failed: Array<Kernel.Instance | unknown> = []
    let fold = foldOf(this.root) ?? this.neutral
    const skip = skipsEmpty(fold.merge) && (
      fold !== this.neutral ||
      (heads.html === undefined && !heads.hasCustomFold(tree))
    )
    const walk = !skip || this.active.size > 1 ||
      (this.active.size === 1 && !this.active.has(this.root))
    const node = (inst: Kernel.Instance): Head.Tree<unknown> | undefined => {
      if (inst.closed || inst.failure !== undefined) {
        return skip
          ? undefined
          : { path: inst.path, entries: none, children: none }
      }
      const head = (inst.component as unknown as Component.Any).head
      if (fold === this.neutral) fold = foldOf(inst) ?? fold
      const hasKids = walk && inst.rendered !== undefined &&
        Kernel.authorOf(inst).live > 0
      if (skip && head === undefined && !hasKids) return undefined
      let entries: ReadonlyArray<unknown> = none
      if (head !== undefined) {
        try {
          entries = head(inst.model, inst.props, inst.results as never)
        } catch (error) {
          failed.push(inst, error)
          return undefined
        }
      }
      let children: Array<Head.Tree<unknown>> | undefined
      if (hasKids) {
        const below: Array<Kernel.Instance> = []
        placed(inst.rendered!, below)
        for (let index = 0; index < below.length; index++) {
          const child = node(below[index]!)
          if (child !== undefined) (children ??= []).push(child)
        }
      }
      if (skip && entries.length === 0 && children === undefined) {
        return undefined
      }
      return {
        path: inst.path,
        entries,
        children: children ?? none,
        onError: (error) => failed.push(inst, error)
      }
    }
    const conflicts: Array<Head.Conflict> = []
    const folded = node(this.root) ?? { entries: none, children: none }
    const value = fold.merge(folded, {
      onConflict: (conflict) => conflicts.push(conflict)
    })
    if (failed.length > 0) {
      for (let index = 0; index < failed.length; index += 2) {
        Kernel.fail(
          failed[index] as Kernel.Instance,
          "head",
          Cause.die(failed[index + 1])
        )
      }
      return true
    }
    const title = fold.title(value)
    tree.head = { value, title }
    const ctx = this.root.env.ctx ?? Context.empty()
    for (const conflict of conflicts) report(ctx, conflict)
    const give = tree.host.head
    if (give !== undefined) {
      const signature = JSON.stringify(value)
      if (signature !== this.given) {
        this.given = signature
        give(value)
      }
    }
    return false
  }
}

/** @internal */
export const make =
  (neutral: View.HeadFold) => (inst: Kernel.Instance): void => {
    const tree = inst.tree
    let folding = foldings.get(tree)
    if (folding === undefined) {
      let root = inst
      while (root.parent !== undefined) root = root.parent
      const made = folding = new Folding(root, neutral)
      foldings.set(tree, made)
      tree.head = { value: undefined, title: undefined }
      const work = tree.work
      tree.work = (idle) =>
        work?.(idle) === true ||
        (idle && tree.drew === true && !(tree.drew = false) && made.run())
    }
    folding.active.add(inst)
    ;(inst.closers ??= []).push(() => folding.active.delete(inst))
  }
