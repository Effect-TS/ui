/** @internal */
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Scope from "effect/Scope"
import * as Locator from "../testing/Locator.ts"
import * as TestHost from "../testing/TestHost.ts"
import type * as TestQuery from "../testing/TestQuery.ts"
import { domEventMessageCount } from "./runtime.ts"
import * as scene from "./scene.ts"
import * as engine from "./story.ts"

/** @internal */
export type StepError = TestHost.SettleError | TestHost.RootCrashed | TestQuery.ProblemsError

/** @internal */
export interface PlannedEvent {
  readonly node: TestHost.TestNode
  readonly description: string
  readonly event: string
  readonly payload: () => unknown
  readonly optional?: boolean | undefined
  readonly isDefault?: boolean | undefined
  readonly edit?: (() => void) | undefined
}

const callSite = (fn: Function): Error => {
  const site = new Error()
  ;(Error as { captureStackTrace?: (target: object, fn: Function) => void }).captureStackTrace?.(site, fn)
  return site
}

const atSite = (site: Error, f: () => void): void => {
  try {
    f()
  } catch (error) {
    if (error instanceof Error && site.stack !== undefined) {
      error.stack = `${error.name}: ${error.message}\n${site.stack.split("\n").slice(1).join("\n")}`
    }
    throw error
  }
}

/** @internal */
export const ancestors = (node: TestHost.TestNode): ReadonlyArray<TestHost.TestElement> => {
  const out: Array<TestHost.TestElement> = []
  for (let at = node._tag === "Element" ? node : node.parent; at !== undefined; at = at.parent) out.push(at)
  return out
}

const handlerOn = (node: TestHost.TestNode, event: string): TestHost.TestElement | undefined =>
  ancestors(node).find((at) => Object.hasOwn(at.handlers, event) && at.dispatch !== undefined)

/** @internal */
export class PlayCursor {
  private interaction: "handled" | "ignored" | undefined
  private ignored: string | undefined
  readonly module: string
  readonly root: TestHost.TestRoot<any, any, any>
  readonly settle: Effect.Effect<void, StepError>

  constructor(module: string, root: TestHost.TestRoot<any, any, any>, testHost: TestHost.TestHost) {
    this.module = module
    this.root = root
    this.settle = Effect.provideService(TestHost.settle, TestHost.TestHost, testHost)
  }

  protected name(step: string): string {
    return `${this.module}.${step}`
  }

  protected findOne(locator: Locator.Locator, step: string): TestHost.TestElement {
    const found = this.root.all(locator)
    if (found.length !== 1) {
      throw new Error(
        `${this.name(step)}: ${
          found.length === 0 ? "nothing matches" : `${found.length} elements match`
        } ${locator.description}${found.length === 0 ? "; " + this.candidates() : ""}`
      )
    }
    return found[0] as TestHost.TestElement
  }

  private candidates(): string {
    return engine.describeCandidates({ children: this.root.container.children })
  }

  protected interact(
    step: string,
    method: Function,
    plan: () => ReadonlyArray<PlannedEvent>
  ): Effect.Effect<void, StepError> {
    const site = callSite(method)
    return Effect.andThen(
      this.settle,
      Effect.andThen(Effect.sync(() => atSite(site, () => this.run(step, plan))), this.settle)
    )
  }

  private run(step: string, plan: () => ReadonlyArray<PlannedEvent>): void {
    const name = this.name(step)
    if (this.ignored !== undefined) {
      throw new Error(`${name}: the ${this.ignored} before it produced no message: acknowledge it with expectIgnored()`)
    }
    let reached = false
    let handled = false
    let cancelled = false
    const events = plan()
    for (const { description, edit, event, isDefault, node, optional, payload } of events) {
      if (isDefault === true && cancelled) continue
      edit?.()
      const target = handlerOn(node, event)
      if (target === undefined) {
        if (optional === true) continue
        throw new Error(`${name}: nothing handles "${event}" at ${description}`)
      }
      reached = true
      const preventDefault = target.eventOptions[event]?.preventDefault
      let prevented = event === "submit" || preventDefault === "always"
      const before = domEventMessageCount()
      target.dispatch!(
        event,
        target.handlers[event]!,
        payload(),
        preventDefault === true ?
          () => {
            prevented = true
          } :
          undefined
      )
      handled ||= domEventMessageCount() > before
      if (isDefault !== true) cancelled ||= prevented
    }
    if (!reached) throw new Error(`${name}: nothing handles "${events[0]?.event}" at ${events[0]?.description}`)
    this.interaction = handled ? "handled" : "ignored"
    this.ignored = handled ? undefined : step
  }

  protected one(
    step: string,
    method: Function,
    locator: Locator.Locator,
    event: string,
    payload: (node: TestHost.TestElement) => unknown,
    edit?: (node: TestHost.TestElement, payload: unknown) => void
  ): Effect.Effect<void, StepError> {
    return this.interact(step, method, () => {
      const node = this.findOne(locator, step)
      const value = payload(node)
      return [{
        node,
        description: locator.description,
        event,
        payload: () => value,
        edit: edit === undefined ? undefined : () => edit(node, value)
      }]
    })
  }

  click(target: string | Locator.Locator): Effect.Effect<void, StepError> {
    return this.one(
      "click",
      this.click,
      typeof target === "string" ? Locator.text(target) : target,
      "click",
      () => scene.pointer
    )
  }
  fire(locator: Locator.Locator, event: string, payload: unknown = {}): Effect.Effect<void, StepError> {
    return this.one("fire", this.fire, locator, event, () => payload)
  }

  expect(locator: Locator.Locator): object {
    return this.expectation(locator, scene.matchers)
  }
  protected expectation(
    locator: Locator.Locator,
    matchers: { readonly [name: string]: (...args: Array<any>) => scene.Matcher }
  ): object {
    const out: { [name: string]: (...args: Array<any>) => Effect.Effect<void, StepError> } = {}
    for (const [name, make] of Object.entries(matchers)) {
      const matcher = (...args: Array<any>) => {
        const site = callSite(matcher)
        return Effect.andThen(
          this.settle,
          Effect.sync(() =>
            atSite(site, () => {
              const failure = make(...args)(this.root.all(locator), this.root.container)
              if (failure !== undefined) {
                throw new Error(
                  `${this.name("expect")}(${locator.description}).${name}(${
                    args.map(scene.describeExpected).join(", ")
                  }): ${failure}; ${this.candidates()}`
                )
              }
            })
          )
        )
      }
      out[name] = matcher
    }
    return out
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
              `${this.name("make")}: the last ${this.ignored} produced no message: acknowledge it with expectIgnored()`
            )
          }
        })
      )
    )
  }
}

/** @internal */
export const begin = <S extends PlayCursor>(
  Ctor: new(module: string, root: TestHost.TestRoot<any, any, any>, testHost: TestHost.TestHost) => S,
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
    yield* Effect.addFinalizer((exit) => Exit.isSuccess(exit) ? play.finish(site) : Effect.void)
    return play
  }) as any
}
