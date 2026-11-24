import { Component, Head, Query, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Story } from "@effect/ui/testing"
import { Context, Effect, Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { describe, expect, it } from "tstyche"

const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  teamId: Schema.String
})
const Team = Schema.Struct({ id: Schema.String, title: Schema.String })

class GetUser extends Query.Service<GetUser>()(
  "typetest/GetUser",
  {
    args: { id: Schema.String },
    success: User,
    error: Schema.String,
    staleTime: "1 minute"
  },
  Effect.succeed(({ id }) => Effect.succeed({ id, name: "Ann", teamId: "t" }))
) {}

class GetTeam extends Query.Service<GetTeam>()(
  "typetest/GetTeam",
  {
    args: { id: Schema.String },
    success: Team,
    error: Schema.Never,
    staleTime: 0
  },
  Effect.succeed(({ id }) => Effect.succeed({ id, title: "T" }))
) {}

const Message = UiSchema.TaggedEnum({
  UserChanged: { state: Schema.String, failed: Schema.Boolean },
  TeamChanged: { state: Schema.String },
  Bump: {}
})

const Card = Html.component({
  name: "Card",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Struct({ n: Schema.Number }),
  message: Message,

  queries: {
    user: {
      query: GetUser,
      args: ({ props }) => ({ id: props.id }),
      onChange: (result) => {
        expect(result).type.toBe<
          AsyncResult.AsyncResult<typeof User.Type, string>
        >()
        return Message.UserChanged({
          state: result._tag,
          failed: AsyncResult.isFailure(result)
        })
      }
    },
    team: {
      query: GetTeam,
      args: ({ queries }) => {
        expect(queries.user).type.toBe<
          AsyncResult.AsyncResult<typeof User.Type, string>
        >()
        expect(queries).type.not.toHaveProperty("team")
        return AsyncResult.isSuccess(queries.user)
          ? { id: queries.user.value.teamId }
          : undefined
      },
      onChange: (result) => {
        expect(result).type.toBe<
          AsyncResult.AsyncResult<typeof Team.Type, never>
        >()
        return Message.TeamChanged({ state: result._tag })
      }
    }
  }
}).make({
  init: () => ({ n: 0 }),
  update: ($, message) => {
    expect($.queries.user).type.toBe<
      AsyncResult.AsyncResult<typeof User.Type, string>
    >()
    expect($.queries.team).type.toBe<
      AsyncResult.AsyncResult<typeof Team.Type, never>
    >()
    return Message.match(message, {
      UserChanged: () => $.model,
      TeamChanged: () => $.model,
      Bump: () => ({ ...$.model, n: $.model.n + 1 })
    })
  },
  subscriptions: ({ queries }) => {
    expect(queries.user).type.toBe<
      AsyncResult.AsyncResult<typeof User.Type, string>
    >()
    return []
  },
  head: ({ queries }) => {
    expect(queries.team).type.toBe<
      AsyncResult.AsyncResult<typeof Team.Type, never>
    >()
    return [Head.title("Card")]
  },
  view: (h) => {
    expect(h.queries.user).type.toBe<
      AsyncResult.AsyncResult<typeof User.Type, string>
    >()
    expect(h.previous.user).type.toBe<Option.Option<typeof User.Type>>()
    expect(h.patched.team).type.toBe<boolean>()
    return AsyncResult.match(h.queries.user, {
      onInitial: () =>
        h.p(
          Option.isSome(h.previous.user)
            ? h.previous.user.value.name
            : "Loading"
        ),
      onFailure: () => h.p("Missing"),
      onSuccess: ({ value }) =>
        h.p.onClick(Message.Bump()).children(
          value.name,
          h.patched.team ? "*" : ""
        )
    })
  }
})

class Api extends Context.Service<
  Api,
  { readonly name: (id: string) => Effect.Effect<string> }
>()("typetest/Api") {}

class GetName extends Query.Service<GetName>()(
  "typetest/GetName",
  {
    args: { id: Schema.String },
    success: Schema.String,
    error: Schema.Never,
    staleTime: 0
  },
  Effect.gen(function*() {
    const api = yield* Api
    return ({ id }) => api.name(id)
  })
) {}

describe("Component queries", () => {
  it("infers every type from the reads", () => {
    type L = Component.Queries<typeof Card>
    expect<keyof L>().type.toBe<"user" | "team">()
    expect<Component.SingleNames<L>>().type.toBe<"user" | "team">()
    expect<Component.KeyedNames<L>>().type.toBe<never>()
    expect<Component.InfiniteNames<L>>().type.toBe<never>()
    expect<L>().type.toBe<
      {
        readonly user: Component.QueryOne<typeof GetUser>
        readonly team: Component.QueryOne<typeof GetTeam>
      }
    >()
    expect<Component.QueryResultOf<L["user"]>>().type.toBe<
      AsyncResult.AsyncResult<typeof User.Type, string>
    >()
    expect<Component.QueryHelpers<L>>().type.toBe<{
      readonly queries: {
        readonly user: AsyncResult.AsyncResult<typeof User.Type, string>
        readonly team: AsyncResult.AsyncResult<typeof Team.Type, never>
      }
      readonly previous: {
        readonly user: Option.Option<typeof User.Type>
        readonly team: Option.Option<typeof Team.Type>
      }
      readonly patched: { readonly user: boolean; readonly team: boolean }
    }>()
    expect<Component.QueryServices<L>>().type.toBe<GetUser | GetTeam>()
    expect<Component.Requirements<typeof Card>>().type.toBe<GetUser | GetTeam>()
  })

  it("take the queries from the reads when update's $ is annotated", () => {
    const Annotated = Component.define({
      name: "Annotated",
      model: Schema.Struct({}),
      message: Schema.Never,
      queries: { name: { query: GetName, args: () => ({ id: "1" }) } }
    }).make({
      init: () => ({}),
      update: ($: Component.Update<{}, never, never, {}>) => $.set($.model),
      view: (h) => h.text("")
    })
    expect<Component.Queries<typeof Annotated>>().type.toBe<
      { readonly name: Component.QueryOne<typeof GetName> }
    >()
    expect<Component.Requirements<typeof Annotated>>().type.toBe<GetName>()
  })

  it("add their reads to the requirements, never what the fetchers use", () => {
    const Named = Component.define({
      name: "Named",
      model: Schema.Struct({}),
      message: Schema.Never,
      queries: { name: { query: GetName, args: () => ({ id: "1" }) } }
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: (h) =>
        h.text(
          AsyncResult.isSuccess(h.queries.name) ? h.queries.name.value : ""
        )
    })
    expect<Component.Requirements<typeof Named>>().type.toBe<GetName>()
    // Provided, the query's layer brings what its fetcher uses.
    const Provided = Named.pipe(Component.provide(GetName.layer))
    expect<Component.Requirements<typeof Provided>>().type.toBe<Api>()
  })

  it("a query's queries doesn't have its own name", () => {
    Component.define({
      name: "Self",
      model: Schema.Struct({}),
      message: Message,
      queries: {
        user: {
          query: GetUser,
          args: ({ queries }) =>
            // @ts-expect-error Property 'user' does not exist
            AsyncResult.isSuccess(queries.user) ? { id: "1" } : undefined
        },
        team: {
          query: GetTeam,
          args: ({ queries }) =>
            AsyncResult.isSuccess(queries.user) ? { id: "1" } : undefined
        }
      }
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: () => null as never
    })
  })

  it("type args and onChange by the query", () => {
    Component.define({
      name: "Typed",
      props: Schema.Struct({ id: Schema.String }),
      model: Schema.Struct({}),
      message: Message,
      queries: {
        // @ts-expect-error Type 'number' is not assignable to type 'string'
        user: { query: GetUser, args: () => ({ id: 1 }) },
        team: {
          query: GetTeam,
          args: ({ props }) => ({ id: props.id }),
          // @ts-expect-error not assignable
          onChange: (_result: AsyncResult.AsyncResult<string, never>) =>
            Message.Bump()
        }
      }
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: () => null as never
    })
    Component.define({
      name: "OnChangeMessage",
      model: Schema.Struct({}),
      message: Message,
      queries: {
        user: {
          query: GetUser,
          args: () => ({ id: "1" }),
          // @ts-expect-error not assignable
          onChange: () => "not a message"
        }
      }
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: () => null as never
    })
  })
})

describe("debounce", () => {
  it("is an entry option, and types the query as a plain one, single or keyed", () => {
    Component.define({
      name: "Debounced",
      props: Schema.Struct({ id: Schema.String }),
      model: Schema.Struct({}),
      message: Message,
      queries: {
        user: {
          query: GetUser,
          debounce: "300 millis",
          args: ({ props, queries }) => {
            expect(props).type.toBe<{ readonly id: string }>()
            expect(queries).type.not.toHaveProperty("user")
            return props.id === "" ? undefined : { id: props.id }
          }
        },
        team: {
          queryMany: GetTeam,
          debounce: "300 millis",
          // @ts-expect-error Type 'number' is not assignable to type 'string'
          args: () => [{ id: 1 }]
        }
      }
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: () => null as never
    })
  })

  it("takes a Duration input", () => {
    Component.define({
      name: "BadDebounce",
      model: Schema.Struct({}),
      message: Message,
      queries: {
        // @ts-expect-error not assignable
        user: { query: GetUser, debounce: "soon", args: () => ({ id: "1" }) }
      }
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: () => null as never
    })
  })
})

describe("Story query steps", () => {
  it("take a query name and its read's success or error", () => {
    Story.start(Card, { id: "1" })
      .loaded("user", { id: "1", name: "Ann", teamId: "t" })
      .loadFailed("user", "missing")
      .loaded("team", { id: "t", title: "T" }, { waiting: true, patched: true })
      // @ts-expect-error Argument of type '"n"' is not assignable to parameter
      .loaded("n", 1)
      // @ts-expect-error 'title' does not exist
      .loaded("user", { id: "t", title: "T" })
      // @ts-expect-error Argument of type '"missing"' is not assignable to parameter of type 'never'
      .loadFailed("team", "missing")
      // @ts-expect-error Argument of type '"other"' is not assignable
      .loadFailed("other", "missing")
    const story = Story.start(Card, { id: "1" }).loaded("user", {
      id: "1",
      name: "Ann",
      teamId: "t"
    }).current
    expect(story).type.toBe<
      Story.Story<
        { readonly id: string },
        Component.Model<typeof Card>,
        Component.Message<typeof Card>,
        never,
        {
          readonly user: AsyncResult.AsyncResult<typeof User.Type, string>
          readonly team: AsyncResult.AsyncResult<typeof Team.Type, never>
        }
      >
    >()
    // `queries()` is typed as `h.queries` is.
    expect(story.queries().user).type.toBe<
      AsyncResult.AsyncResult<typeof User.Type, string>
    >()
    expect(story.queries()).type.not.toHaveProperty("n")
  })

  it("given takes queries results by query name", () => {
    Story.start(Card, { id: "1" })
      .given((model) => model, {
        user: { id: "1", name: "Ann", teamId: "t" },
        team: { id: "t", title: "T" }
      })
      .given((model) => model, { team: { id: "t", title: "T" } })
      // @ts-expect-error 'title' does not exist
      .given((model) => model, { user: { id: "t", title: "T" } })
      // @ts-expect-error 'n' does not exist
      .given((model) => model, { n: 1 })
  })

  it("fromLog types the replay's props and queries results", () => {
    const replay = Story.fromLog(Card, [])
    expect(replay.props).type.toBe<{ readonly id: string }>()
    expect(replay.queries().user).type.toBe<
      AsyncResult.AsyncResult<typeof User.Type, string>
    >()
    expect(replay.queries()).type.not.toHaveProperty("n")
  })
})

class GetCount extends Query.Service<GetCount>()(
  "typetest/GetCount",
  {
    args: Schema.String,
    success: Schema.Number,
    error: Schema.Never,
    staleTime: 0
  },
  Effect.succeed(() => Effect.succeed(1))
) {}

const ListMessage = UiSchema.TaggedEnum({
  UsersChanged: { changed: Schema.Number },
  Show: { ids: Schema.Array(Schema.String) }
})

const List = Html.component({
  name: "List",

  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    changed: Schema.Number
  }),

  message: ListMessage,

  queries: {
    users: {
      queryMany: GetUser,
      args: ({ model }) => model.ids.map((id) => ({ id })),
      onChange: (results, changes) => {
        expect(results).type.toBe<Component.KeyedResults<typeof GetUser>>()
        expect(changes).type.toBe<
          ReadonlyArray<Component.KeyedChange<typeof GetUser>>
        >()
        return ListMessage.UsersChanged({ changed: changes.length })
      }
    }
  }
}).make({
  init: () => ({ ids: [], changed: 0 }),
  update: ($, message) => {
    expect($.queries.users).type.toBe<Component.KeyedResults<typeof GetUser>>()
    return ListMessage.match(message, {
      UsersChanged: ({ changed }) => ({ ...$.model, changed }),
      Show: ({ ids }) => ({ ...$.model, ids })
    })
  },
  view: (h) =>
    h.ul(
      h.queries.users.map(({ args, result, patched }) =>
        h.li.key(args.id).children(
          AsyncResult.isSuccess(result)
            ? result.value.name + (patched ? "*" : "")
            : "…"
        )
      )
    )
})

describe("Keyed queries", () => {
  it("open to entries with args, result and patched, and get by args", () => {
    type L = Component.Queries<typeof List>
    expect<keyof L>().type.toBe<"users">()
    expect<Component.KeyedNames<L>>().type.toBe<"users">()
    expect<Component.SingleNames<L>>().type.toBe<never>()
    expect<Component.InfiniteNames<L>>().type.toBe<never>()
    expect<Component.Requirements<typeof List>>().type.toBe<GetUser>()
    expect<Component.QueryResultOf<L["users"]>>().type.toBe<
      Component.KeyedResults<typeof GetUser>
    >()
    expect<Component.QueryResultOf<L["users"]>[number]["args"]>().type.toBe<
      { readonly id: string }
    >()
    expect<Component.QueryResultOf<L["users"]>[number]["result"]>().type.toBe<
      AsyncResult.AsyncResult<typeof User.Type, string>
    >()
    expect<ReturnType<Component.QueryResultOf<L["users"]>["get"]>>().type.toBe<
      Option.Option<Component.KeyedEntry<typeof GetUser>>
    >()
    expect<Parameters<Component.QueryResultOf<L["users"]>["get"]>[0]>().type
      .toBe<{ readonly id: string }>()
  })

  it("have no previous or patched view", () => {
    type L = Component.Queries<typeof List>
    expect<Component.QueryHelpers<L>["previous"]>().type.toBe<{}>()
    expect<Component.QueryHelpers<L>["patched"]>().type.toBe<{}>()
  })

  it("a keyed query's results doesn't have its own name", () => {
    Component.define({
      name: "SelfKeyed",
      model: Schema.Struct({}),
      message: Message,
      queries: {
        users: {
          queryMany: GetUser,
          args: ({ queries }) =>
            // @ts-expect-error Property 'users' does not exist
            queries.users === undefined ? [] : [{ id: "1" }]
        },
        team: {
          query: GetTeam,
          args: ({ queries }) => {
            expect(queries.users).type.toBe<
              Component.KeyedResults<typeof GetUser>
            >()
            return queries.users.length > 0 ? { id: "1" } : undefined
          }
        }
      }
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: () => null as never
    })
  })

  it("take an array of args from the query, and an onChange of entries and changes", () => {
    const model = Schema.Struct({ ids: Schema.Array(Schema.String) })
    const base = { name: "Keyed", model, message: ListMessage }
    Component.define({
      ...base,
      queries: {
        users: {
          queryMany: GetUser,
          // @ts-expect-error is missing the following properties from type 'readonly { readonly id: string; }[]'
          args: ({ model }) => ({ id: model.ids[0] })
        }
      }
    })
    Component.define({
      ...base,
      queries: {
        users: {
          queryMany: GetUser,
          args: ({ model }) => model.ids.map((id) => ({ id })),
          // @ts-expect-error not assignable
          onChange: (_loaded: AsyncResult.AsyncResult<unknown, unknown>) =>
            ListMessage.Show({ ids: [] })
        }
      }
    })
  })

  it("keep a single and a keyed query apart", () => {
    Component.define({
      name: "SingleArray",
      model: Schema.Struct({}),
      message: Message,
      queries: {
        // @ts-expect-error Property 'id' is missing
        user: { query: GetUser, args: () => [{ id: "1" }] }
      }
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: () => null as never
    })
    const Keyed = Component.define({
      name: "Counts",
      model: Schema.Struct({}),
      message: Message,
      queries: { counts: { queryMany: GetCount, args: () => ["a", "b"] } }
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: () => null as never
    })
    expect<Component.QueryResultOf<Component.Queries<typeof Keyed>["counts"]>>()
      .type.toBe<
      Component.KeyedResults<typeof GetCount>
    >()
  })

  it("take the Story's keyed steps, typed by the query", () => {
    Story.start(List, {})
      .send(ListMessage.Show({ ids: ["1", "2"] }))
      .loaded("users", { id: "1" }, { id: "1", name: "Ann", teamId: "t" })
      .loadFailed("users", { id: "2" }, "missing", { waiting: true })
      .loadedMany("users", [
        {
          args: { id: "1" },
          value: { id: "1", name: "Ann", teamId: "t" },
          patched: true
        },
        { args: { id: "2" }, error: "missing" }
      ])
      // @ts-expect-error not assignable
      .loaded("users", { id: "1", name: "Ann", teamId: "t" })
      .loadedMany("users", [{
        // @ts-expect-error not assignable
        args: { id: 1 },
        value: { id: "1", name: "Ann", teamId: "t" }
      }])
      // @ts-expect-error not assignable
      .loadedMany("others", [])
  })
})

const ChatItem = Schema.Struct({ id: Schema.String, text: Schema.String })
const ChatPage = Schema.Struct({
  messages: Schema.Array(ChatItem),
  next: Schema.NullOr(Schema.Number)
})

class ListMessages extends Query.InfiniteService<ListMessages>()(
  "typetest/ListMessages",
  {
    args: { room: Schema.String },
    page: ChatPage,
    items: (page) => page.messages,
    key: (message) => message.id,
    error: Schema.String,
    cursor: Schema.Number,
    next: (lastPage) => Option.fromNullishOr(lastPage.next),
    staleTime: "1 minute"
  },
  Effect.succeed((_args, _cursor) =>
    Effect.succeed({ messages: [], next: null })
  )
) {}

const ChatMessage = UiSchema.TaggedEnum({
  Changed: { count: Schema.Number },
  More: {},
  Refresh: {}
})

const Chat = Html.component({
  name: "Chat",
  props: Schema.Struct({ room: Schema.String }),
  model: Schema.Struct({}),
  message: ChatMessage,

  queries: {
    messages: {
      query: ListMessages,
      args: ({ props }) => ({ room: props.room }),
      onChange: (result) => {
        expect(result).type.toBe<
          AsyncResult.AsyncResult<
            Component.InfiniteData<typeof ListMessages>,
            string
          >
        >()
        return ChatMessage.Changed({
          count: AsyncResult.isSuccess(result) ? result.value.items.length : 0
        })
      }
    },
    user: { query: GetUser, args: () => ({ id: "1" }) }
  }
}).make({
  init: () => ({}),
  update: ($, message) => {
    expect($.queries.messages).type.toBe<
      AsyncResult.AsyncResult<
        Component.InfiniteData<typeof ListMessages>,
        string
      >
    >()
    return ChatMessage.match(message, {
      Changed: () => $.model,
      More: () => $.loadMore("messages"),
      Refresh: () => $.reset("messages")
    })
  },
  view: (h) => {
    expect(h.queries.messages).type.toBe<
      AsyncResult.AsyncResult<
        Component.InfiniteData<typeof ListMessages>,
        string
      >
    >()
    expect(h.previous.messages).type.toBe<
      Option.Option<Omit<Component.InfiniteData<typeof ListMessages>, "more">>
    >()
    expect(h.patched.messages).type.toBe<boolean>()
    return h.p("")
  }
})

describe("List queries", () => {
  it("open to items, pages and more", () => {
    expect<Component.InfiniteData<typeof ListMessages>>().type.toBe<{
      readonly items: ReadonlyArray<
        { readonly id: string; readonly text: string }
      >
      readonly pages: ReadonlyArray<typeof ChatPage.Type>
      readonly more: Query.More<string>
    }>()
    type L = Component.Queries<typeof Chat>
    expect<Component.InfiniteNames<L>>().type.toBe<"messages">()
    expect<Component.SingleNames<L>>().type.toBe<"messages" | "user">()
    expect<Component.KeyedNames<L>>().type.toBe<never>()
    expect<Component.Requirements<typeof Chat>>().type.toBe<
      ListMessages | GetUser
    >()
  })

  it("take loadMore and reset for an infinite query only, and not in init", () => {
    Html.component({
      name: "Chat",
      props: Schema.Struct({ room: Schema.String }),
      model: Schema.Struct({}),
      message: ChatMessage,

      queries: {
        messages: {
          query: ListMessages,
          args: ({ props }) => ({ room: props.room })
        },
        user: { query: GetUser, args: () => ({ id: "1" }) }
      }
    }).make({
      // @ts-expect-error Property 'loadMore' does not exist
      init: ($) => $.set({}).loadMore("messages"),
      update: ($, message) =>
        ChatMessage.match(message, {
          // @ts-expect-error Argument of type '"user"' is not assignable to parameter of type '"messages"'
          Changed: () => $.loadMore("user"),
          // @ts-expect-error Argument of type '"missing"' is not assignable to parameter of type '"messages"'
          More: () => $.loadMore("missing"),
          // @ts-expect-error Argument of type '"user"' is not assignable to parameter of type '"messages"'
          Refresh: () => $.reset("user")
        }),
      view: (h) => h.p("")
    })
    Component.define({
      name: "Reset",
      model: Schema.Struct({}),
      message: ChatMessage,
      queries: {
        messages: { query: ListMessages, args: () => ({ room: "r" }) }
      }
    }).make({
      init: () => ({}),
      // @ts-expect-error Argument of type '"missing"' is not assignable to parameter of type '"messages"'
      update: ($) => $.reset("missing"),
      view: (h) => h.text("")
    })
  })

  it("keep an infinite query under query, and one of query and queryMany", () => {
    Component.define({
      name: "ListMany",
      model: Schema.Struct({}),
      message: ChatMessage,
      queries: {
        // @ts-expect-error an infinite query takes query, not queryMany
        messages: { queryMany: ListMessages, args: () => [{ room: "r" }] }
      }
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: (h) => h.text("")
    })
    Component.define({
      name: "Both",
      model: Schema.Struct({}),
      message: ChatMessage,
      queries: {
        // @ts-expect-error an entry takes one of query and queryMany
        user: { query: GetUser, queryMany: GetUser, args: () => [{ id: "1" }] }
      }
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: (h) => h.text("")
    })
  })

  it("take the Story's list steps, typed by the page and error", () => {
    const page = { messages: [{ id: "m0", text: "a" }], next: null }
    Story.start(Chat, { room: "r" })
      .loaded("messages", [page])
      .send(ChatMessage.More())
      .loadedMore("messages", page)
      .send(ChatMessage.More())
      .loadMoreFailed("messages", "nope")
      // @ts-expect-error Argument of type '"user"' is not assignable to parameter of type '"messages"'
      .loadedMore("user", page)
      // @ts-expect-error Argument of type '"missing"' is not assignable to parameter of type '"messages"'
      .loadMoreFailed("missing", "nope")
      // @ts-expect-error Argument of type 'number' is not assignable to parameter of type 'string'
      .loadMoreFailed("messages", 1)
  })
})
