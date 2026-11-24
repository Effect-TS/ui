/**
 * How a Command or a mount on the kernel reaches the elements of its instance. What runs them carries it,
 * so an app that issues neither doesn't.
 *
 * @internal
 */
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type * as Renderer from "../Renderer.ts"
import type * as Kernel from "./kernel.ts"

/**
 * Runs `f` once the flush running or scheduled commits, or at once when none is.
 *
 * @internal
 */
export const afterCommit = (tree: Kernel.Tree, f: () => void): void => {
  if (tree.scheduled) (tree.committed ??= []).push(f)
  else f()
}

const find = (rec: Kernel.Rec, key: string, inst: Kernel.Instance): unknown => {
  const view = rec.v
  if (view._tag === "Element") {
    if (rec.inst === inst && view.refKey === key) return rec.node
  } else if (view._tag === "Child" && rec.kids === undefined) {
    const placed = rec.inst.placed
    if (placed === undefined) return undefined
    for (const entry of placed.values()) {
      const found = findIn(entry.rec.kids, key, inst)
      if (found !== undefined) return found
    }
    return undefined
  }
  return findIn(rec.kids, key, inst)
}

const findIn = (
  kids: ReadonlyArray<Kernel.Rec> | undefined,
  key: string,
  inst: Kernel.Instance
): unknown => {
  if (kids === undefined) return undefined
  for (let index = 0; index < kids.length; index++) {
    const found = find(kids[index]!, key, inst)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * The refs `inst` put on the elements it renders, read once the render the caller follows from commits.
 *
 * @internal
 */
export const refsOf = (inst: Kernel.Instance): Renderer.Refs => ({
  lookup: <Node>(ref: Renderer.Ref<Node>) =>
    Effect.callback<Option.Option<Node>>((resume) =>
      afterCommit(inst.tree, () => {
        const rendered = inst.closed ? undefined : inst.rendered
        resume(Effect.succeed(Option.fromUndefinedOr(
          (rendered === undefined
            ? undefined
            : find(rendered, ref.key, inst)) as Node | undefined
        )))
      })
    )
})
