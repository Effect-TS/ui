/** @internal */
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Scope from "effect/Scope"
import * as Locator from "../testing/Locator.ts"
import type { StepError } from "../testing/Play.ts"
import * as TestHost from "../testing/TestHost.ts"
import * as controlled from "./controlled.ts"
import * as scene from "./scene.ts"
import { atSite, callSite } from "./steps.ts"
import * as engine from "./story.ts"

/** @internal */
export interface PlannedEvent {
  readonly node: TestHost.TestNode
  readonly description: string
  readonly event: string
  readonly payload: () => unknown
  readonly edit?: (() => ReadonlyArray<TestHost.TestElement>) | undefined
}

/** @internal */
export const ancestors = (
  node: TestHost.TestNode
): ReadonlyArray<TestHost.TestElement> => {
  const out: Array<TestHost.TestElement> = []
  for (
    let at = node._tag === "Element" ? node : node.parent;
    at !== undefined;
    at = at.parent
  ) out.push(at)
  return out
}

/** @internal */
export class PlayCursor {
  private interaction: "handled" | "ignored" | undefined
  private ignored: string | undefined
  readonly module: string
  readonly root: TestHost.TestRoot<any, any, any>
  readonly settle: Effect.Effect<void, StepError>

  constructor(
    module: string,
    root: TestHost.TestRoot<any, any, any>,
    testHost: TestHost.TestHost
  ) {
    this.module = module
    this.root = root
    this.settle = Effect.provideService(
      TestHost.settle,
      TestHost.TestHost,
      testHost
    )
  }

  protected bubbles(_event: string): boolean {
    return true
  }

  private handlerOn(
    node: TestHost.TestNode,
    event: string
  ): TestHost.TestElement | undefined {
    const path = ancestors(node)
    return (this.bubbles(event) ? path : path.slice(0, 1)).find((at) =>
      Object.hasOwn(at.handlers, event)
    )
  }

  protected name(step: string): string {
    return `${this.module}.${step}`
  }

  private listed(): Locator.Node {
    return { children: this.root.container.children }
  }

  protected findOne(
    locator: Locator.Locator,
    step: string
  ): TestHost.TestElement {
    return engine.findOne(
      { all: this.root.all, root: this.listed() },
      locator,
      this.name(step)
    ) as TestHost.TestElement
  }

  protected interact(
    step: string,
    plan: () => ReadonlyArray<PlannedEvent>
  ): Effect.Effect<void, StepError> {
    const site = callSite(this[step as keyof this] as Function)
    return Effect.gen({ self: this }, function*() {
      yield* this.settle
      const edited = yield* Effect.sync(() =>
        atSite(site, () => this.run(step, plan))
      )
      yield* this.settle
      this.restoreControlled(edited)
    })
  }

  protected checkReady(name: string): void {
    if (this.ignored !== undefined) {
      throw new Error(
        `${name}: the ${this.ignored} before it produced no message: acknowledge it with expectIgnored()`
      )
    }
  }

  protected dispatchEvent(
    node: TestHost.TestNode,
    event: string,
    payload: () => unknown
  ):
    | { readonly handled: boolean; readonly prevented: boolean }
    | undefined
  {
    const target = this.handlerOn(node, event)
    if (target === undefined) return undefined
    let prevented = event === "submit" ||
      target.eventOptions[event]?.preventDefault === "always"
    const handled = target.dispatch!(
      event,
      target.handlers[event]!,
      payload(),
      (options) => {
        if (options.preventDefault === true) prevented = true
      }
    )
    return { handled, prevented }
  }

  protected recordInteraction(step: string, handled: boolean): void {
    this.interaction = handled ? "handled" : "ignored"
    this.ignored = handled ? undefined : step
  }

  protected restoreControlled(
    edited: ReadonlyArray<TestHost.TestElement>
  ): void {
    for (const node of edited) {
      for (const [name, value] of controlled.wantedOf(node) ?? []) {
        node.props[name] = value
      }
    }
  }

  private run(
    step: string,
    plan: () => ReadonlyArray<PlannedEvent>
  ): ReadonlyArray<TestHost.TestElement> {
    const name = this.name(step)
    this.checkReady(name)
    let reached = false
    let handled = false
    const edited: Array<TestHost.TestElement> = []
    const events = plan()
    for (const { edit, event, node, payload } of events) {
      if (edit !== undefined) edited.push(...edit())
      const fired = this.dispatchEvent(node, event, payload)
      if (fired === undefined) continue
      reached = true
      handled ||= fired.handled
    }
    if (!reached) {
      throw new Error(
        `${name}: nothing handles "${events[0]?.event}" at ${
          events[0]?.description
        }`
      )
    }
    this.recordInteraction(step, handled)
    return edited
  }

  protected one<P>(
    step: string,
    locator: Locator.Locator,
    event: string,
    payload: (node: TestHost.TestElement) => P,
    edit?: (node: TestHost.TestElement, payload: P) => void
  ): Effect.Effect<void, StepError> {
    return this.interact(step, () => {
      const node = this.findOne(locator, step)
      const value = payload(node)
      return [{
        node,
        description: locator.description,
        event,
        payload: () => value,
        edit: edit === undefined ? undefined : () => {
          edit(node, value)
          return [node]
        }
      }]
    })
  }

  click(target: string | Locator.Locator): Effect.Effect<void, StepError> {
    return this.one(
      "click",
      typeof target === "string" ? Locator.text(target) : target,
      "click",
      () => scene.pointer
    )
  }
  fire(
    locator: Locator.Locator,
    event: string,
    payload: unknown = {}
  ): Effect.Effect<void, StepError> {
    return this.one("fire", locator, event, () => payload)
  }

  expect(locator: Locator.Locator): object {
    return this.expectation(locator, scene.matchers)
  }
  protected expectation(
    locator: Locator.Locator,
    matchers: {
      readonly [name: string]: (...args: Array<any>) => scene.Matcher
    }
  ): object {
    return scene.makeExpectation(
      this.name("expect"),
      locator,
      matchers,
      (check, method) => {
        const site = callSite(method)
        return Effect.andThen(
          this.settle,
          Effect.sync(() =>
            atSite(
              site,
              () =>
                check(
                  this.root.all(locator),
                  this.root.container,
                  this.listed()
                )
            )
          )
        )
      }
    )
  }

  expectIgnored(): Effect.Effect<void> {
    const site = callSite(this.expectIgnored)
    return Effect.sync(() =>
      atSite(site, () => {
        if (this.interaction !== "ignored") {
          throw new Error(
            `${this.name("expectIgnored")}: ${
              this.interaction === undefined
                ? "no interaction has run"
                : "the last interaction produced a message"
            }`
          )
        }
        this.ignored = undefined
      })
    )
  }

  finish(site: Error): Effect.Effect<void> {
    return Effect.andThen(
      Effect.orDie(this.settle),
      Effect.sync(() =>
        atSite(site, () => {
          if (this.ignored !== undefined) {
            throw new Error(
              `${
                this.name("make")
              }: the last ${this.ignored} produced no message: acknowledge it with expectIgnored()`
            )
          }
        })
      )
    )
  }
}

/** @internal */
export const begin = <S extends PlayCursor>(
  Ctor: new(
    module: string,
    root: TestHost.TestRoot<any, any, any>,
    testHost: TestHost.TestHost
  ) => S,
  module: string,
  make: Function,
  component: any,
  props: unknown
): Effect.Effect<S, StepError, TestHost.TestHost | Scope.Scope> => {
  const site = callSite(make)
  return Effect.gen(function*() {
    const testHost = yield* TestHost.TestHost
    const root = yield* TestHost.mount(component, props as any)
    const play = new Ctor(module, root, testHost)
    yield* play.settle
    yield* Effect.addFinalizer((exit) =>
      Exit.isSuccess(exit) ? play.finish(site) : Effect.void
    )
    return play
  }) as any
}
