import { type Attributed, flag } from "./attributes.ts"

export const finite = (animation: Animation): boolean => {
  const end = animation.effect?.getComputedTiming().endTime
  return typeof end === "number" && Number.isFinite(end)
}

export const frameOf = (view: Window | null) => (f: () => void): void => {
  if (view === null) setTimeout(f, 0)
  else view.requestAnimationFrame(f)
}

export const whenFinished = (
  elements: () => ReadonlyArray<Element | null>,
  frame: (f: () => void) => void,
  live: () => boolean,
  done: () => void
): void => {
  if (!live()) return
  const running = elements().flatMap((element) =>
    element?.getAnimations?.() ?? []
  ).filter(finite)
  Promise.all(running.map((animation) => animation.finished)).then(
    () => {
      if (live()) done()
    },
    () => frame(() => whenFinished(elements, frame, live, done))
  )
}

export type TransitionStatus = "starting" | "ending" | null

export const statusOf = (
  model: { readonly mounted: boolean; readonly started: boolean },
  props: { readonly open: boolean }
): TransitionStatus =>
  props.open
    ? (model.started ? null : "starting")
    : model.mounted
    ? "ending"
    : null

export const transitionAttrs = <B extends Attributed<B>>(
  builder: B,
  open: boolean,
  status: TransitionStatus
): B =>
  builder
    .attrs({
      "data-open": flag(open),
      "data-closed": flag(!open),
      "data-starting-style": flag(status === "starting"),
      "data-ending-style": flag(status === "ending")
    })

export interface Phase {
  readonly open: boolean
  readonly mounted: boolean
  readonly started: boolean
  readonly holdExit: boolean
}

const waits = (phase: Phase): boolean | undefined =>
  phase.open
    ? (phase.started ? true : undefined)
    : phase.mounted && !phase.holdExit
    ? false
    : undefined

export interface Settling {
  readonly follow: (previous: Phase, next: Phase) => void
  readonly cancel: () => void
}

export const settling = (
  node: Element,
  element: () => Element,
  frame: (f: () => void) => void,
  done: (open: boolean) => void
): Settling => {
  let generation = 0
  const settle = (open: boolean) => {
    const mine = ++generation
    frame(() =>
      whenFinished(
        () => [element()],
        frame,
        () => mine === generation && node.isConnected,
        () => done(open)
      )
    )
  }
  const cancel = () => {
    generation++
  }
  return {
    follow: (previous, next) => {
      const wait = waits(next)
      if (wait === waits(previous)) return
      if (wait === undefined) cancel()
      else settle(wait)
    },
    cancel
  }
}
