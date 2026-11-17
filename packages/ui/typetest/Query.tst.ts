import { Query } from "@effect/ui"
import { Context, Effect, Layer, Option, Schema, type Stream } from "effect"
import type { AsyncResult } from "effect/reactivity"
import { describe, expect, it } from "tstyche"

class Api extends Context.Service<Api, { readonly name: (id: string) => Effect.Effect<string> }>()("Api") {}

const User = Schema.Struct({ id: Schema.String, name: Schema.String })
type User = typeof User.Type
class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}

class GetUser extends Query.Service<GetUser>()(
  "GetUser",
  {
    args: { id: Schema.String },
    success: User,
    error: NotFound,
    staleTime: "30 seconds",
    refetchInterval: (result, args) => {
      expect(result).type.toBe<AsyncResult.Success<User, NotFound> | AsyncResult.Failure<User, NotFound>>()
      expect(args).type.toBe<{ readonly id: string }>()
      return undefined
    }
  },
  Effect.gen(function*() {
    const api = yield* Api
    return ({ id }) => Effect.map(api.name(id), (name) => ({ id, name }))
  })
) {}

class Count extends Query.Service<Count>()("Count", {
  args: Schema.String,
  success: Schema.Number,
  error: Schema.Never,
  staleTime: 0
}, Effect.succeed((prefix) => Effect.succeed(prefix.length))) {}

declare const fetcher: Effect.Effect<(args: {}) => Effect.Effect<string>>
declare const needsApi: Effect.Effect<(args: {}) => Effect.Effect<string, never, Api>>

describe("Query", () => {
  it("a read's statics require the read and the cache, never what its fetcher uses", () => {
    expect(GetUser.get({ id: "1" })).type.toBe<Effect.Effect<User, NotFound, GetUser | Query.Cache>>()
    expect(GetUser.prefetch({ id: "1" })).type.toBe<Effect.Effect<void, never, GetUser | Query.Cache>>()
    expect(GetUser.changes({ id: "1" })).type.toBe<
      Stream.Stream<AsyncResult.AsyncResult<User, NotFound>, never, GetUser | Query.Cache>
    >()
    expect(GetUser.peek({ id: "1" })).type.toBe<
      Effect.Effect<AsyncResult.AsyncResult<User, NotFound>, never, Query.Cache>
    >()
    expect(GetUser.invalidate()).type.toBe<Effect.Effect<void, never, Query.Cache>>()
    expect(GetUser.layer).type.toBe<Layer.Layer<GetUser, never, Api>>()
  })

  it("args are a fields record or any Schema", () => {
    expect(Count.get).type.toBe<(args: string) => Effect.Effect<number, never, Count | Query.Cache>>()
    expect(GetUser.get).type.not.toBeCallableWith({ id: 1 })
    expect(GetUser.get).type.not.toBeCallableWith()
  })

  it("a fake is a plain function", () => {
    expect(Layer.succeed(GetUser, ({ id }) => Effect.succeed({ id, name: "Ann" }))).type.toBe<Layer.Layer<GetUser>>()
  })

  it("a fetcher can't keep a requirement of its own", () => {
    const options = { args: {}, success: Schema.String, error: Schema.Never, staleTime: 0 } as const
    expect(Query.Service<any>()).type.toBeCallableWith("Ok", options, fetcher)
    expect(Query.Service<any>()).type.not.toBeCallableWith("Bad", options, needsApi)
  })

  it("patches and writes are typed by their read", () => {
    GetUser.patch({ id: "1" }, (user) => {
      expect(user).type.toBe<User>()
      return user
    })
    GetUser.patchAll((user, args) => {
      expect(user).type.toBe<User>()
      expect(args).type.toBe<{ readonly id: string }>()
      return user
    })
    expect(GetUser.patch).type.not.toBeCallableWith({ id: "1" }, (user: User) => user.name)
    expect(GetUser.set).type.toBeCallableWith({ id: "1" }, { id: "1", name: "Ann" })
    expect(GetUser.set).type.not.toBeCallableWith({ id: "1" }, { id: "1" })
    expect(Query.applyPatches([], Count, "a", 1)).type.toBe<number>()
  })

  it("reads, entries and tags are targets; patches of any read are patches", () => {
    const targets: ReadonlyArray<Query.Target> = [GetUser, Count.entry("a"), Query.Tag("users")]
    const patches: ReadonlyArray<Query.Patch> = [GetUser.patch({ id: "1" }, (user) => user), Count.patchAll((n) => n)]
    const writes: ReadonlyArray<Query.Write> = [Count.set("a", 1)]
    expect(Query.invalidatesEntry({ invalidates: targets, optimistic: patches }, GetUser, { id: "1" })).type.toBe<
      boolean
    >()
    expect(writes).type.toBe<ReadonlyArray<Query.Write>>()
  })
})

const Page = Schema.Struct({ users: Schema.Array(User), next: Schema.NullOr(Schema.Number) })

class ListUsers extends Query.InfiniteService<ListUsers>()("ListUsers", {
  args: { team: Schema.String },
  page: Page,
  items: (page) => page.users,
  key: (user) => user.id,
  error: NotFound,
  cursor: Schema.Number,
  next: (lastPage) => lastPage.next === null ? Option.none() : Option.some(lastPage.next),
  staleTime: "1 minute"
}, Effect.succeed((_args, _cursor) => Effect.succeed({ users: [], next: null }))) {}

describe("InfiniteService", () => {
  it("infers the page, item, cursor and error from the definition", () => {
    expect<Query.InfiniteQuery.Page<typeof ListUsers>>().type.toBe<typeof Page.Type>()
    expect<Query.InfiniteQuery.Item<typeof ListUsers>>().type.toBe<User>()
    expect<Query.Query.Success<typeof ListUsers>>().type.toBe<ReadonlyArray<typeof Page.Type>>()
    expect<Query.Query.Error<typeof ListUsers>>().type.toBe<NotFound>()
    expect(ListUsers.items([])).type.toBe<ReadonlyArray<User>>()
  })

  it("types the fetcher's cursor by the cursor Schema", () => {
    Query.InfiniteService<"Fetcher">()(
      "Fetcher",
      {
        args: { team: Schema.String },
        page: Page,
        items: (page) => page.users,
        key: (user) => user.id,
        error: Schema.Never,
        cursor: Schema.Number,
        next: () => Option.none(),
        staleTime: 0
      },
      Effect.succeed((_args, cursor) => {
        expect(cursor).type.toBe<Option.Option<number>>()
        return Effect.succeed({ users: [], next: null })
      })
    )
  })

  // The documented gotcha: inference reads the object in order, so `key` written before `items` sees no item type.
  it("leaves the item unknown in key when key comes before items", () => {
    Query.InfiniteService<"KeyFirst">()("KeyFirst", {
      args: { team: Schema.String },
      page: Page,
      key: (user) => {
        expect(user).type.toBe<unknown>()
        return String(user)
      },
      items: (page) => page.users,
      error: Schema.Never,
      cursor: Schema.Number,
      next: () => Option.none(),
      staleTime: 0
    }, Effect.succeed(() => Effect.succeed({ users: [], next: null })))
  })

  it("is a target and a patch target", () => {
    expect(
      Query.invalidatesEntry(
        {
          invalidates: [ListUsers, ListUsers.entry({ team: "t" })],
          optimistic: [ListUsers.patch({ team: "t" }, (page) => page), ListUsers.patchAll((page) => page)]
        },
        ListUsers,
        { team: "t" }
      )
    ).type.toBe<boolean>()
  })

  it("has no set", () => {
    expect(ListUsers).type.not.toHaveProperty("set")
  })
})
