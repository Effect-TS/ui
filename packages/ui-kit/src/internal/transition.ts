const finite = (animation: Animation): boolean => {
  const end = animation.effect?.getComputedTiming().endTime
  return typeof end === "number" && Number.isFinite(end)
}

export const frameOf = (view: Window | null) => (f: () => void): void => {
  if (view === null) setTimeout(f, 0)
  else view.requestAnimationFrame(f)
}

export interface Settling {
  readonly settle: (open: boolean) => void
  readonly cancel: () => void
}

export const settling = (
  node: Element,
  element: () => Element,
  frame: (f: () => void) => void,
  done: (open: boolean) => void
): Settling => {
  let generation = 0
  return {
    settle: (open) => {
      const mine = ++generation
      const read = () => {
        if (mine !== generation || !node.isConnected) return
        const running = element().getAnimations().filter(finite).map((animation) => animation.finished)
        Promise.all(running).then(
          () => {
            if (mine === generation && node.isConnected) done(open)
          },
          () => frame(read)
        )
      }
      frame(read)
    },
    cancel: () => {
      generation++
    }
  }
}
