/**
 * The worked example of the query spec (§5.7): a paged list and a detail page
 * with an edit, over an in-memory users API whose calls take time on the
 * clock.
 */
import { Command, Component, Query, Route, Router, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"

// API

export const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  likes: Schema.Number
})
export type User = typeof User.Type

export const UserPage = Schema.Struct({
  page: Schema.Number,
  pages: Schema.Number,
  users: Schema.Array(User)
})

export class UserNotFound
  extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
    id: Schema.String
  })
{}

export class RenameFailed
  extends Schema.TaggedError<RenameFailed>()("RenameFailed", {
    reason: Schema.String
  })
{}

export class UsersApi extends Context.Service<UsersApi, {
  readonly list: (page: number) => Effect.Effect<typeof UserPage.Type>
  readonly get: (id: string) => Effect.Effect<User, UserNotFound>
  readonly rename: (
    id: string,
    name: string
  ) => Effect.Effect<User, RenameFailed>
  readonly like: (id: string) => Effect.Effect<User, UserNotFound>
}>()("test/UsersApi") {}

/** Reads take 10 ms, writes 100 ms. `calls` counts every request by kind. */
export const makeServer = () => {
  const users = new Map<string, User>(
    ["Ann", "Bea", "Cy"].map((
      name,
      i
    ) => [String(i + 1), {
      id: String(i + 1),
      name,
      email: `${name}@x`,
      likes: 0
    }])
  )
  const calls = { list: 0, get: 0, rename: 0, like: 0 }
  const pageSize = 2
  const layer = Layer.succeed(UsersApi, {
    list: (page) =>
      Effect.sleep("10 millis").pipe(Effect.map(() => {
        calls.list++
        const all = Array.from(users.values())
        return {
          page,
          pages: Math.ceil(all.length / pageSize),
          users: all.slice(page * pageSize, (page + 1) * pageSize)
        }
      })),
    get: (id) =>
      Effect.sleep("10 millis").pipe(Effect.andThen(() => {
        calls.get++
        const user = users.get(id)
        return user === undefined
          ? Effect.fail(new UserNotFound({ id }))
          : Effect.succeed(user)
      })),
    rename: (id, name) =>
      Effect.sleep("100 millis").pipe(Effect.andThen(() => {
        calls.rename++
        const user = users.get(id)
        if (user === undefined || name === "") {
          return Effect.fail(new RenameFailed({ reason: "can't rename" }))
        }
        const next = { ...user, name }
        users.set(id, next)
        return Effect.succeed(next)
      })),
    like: (id) =>
      Effect.sleep("100 millis").pipe(Effect.andThen(() => {
        calls.like++
        const user = users.get(id)
        if (user === undefined) return Effect.fail(new UserNotFound({ id }))
        const next = { ...user, likes: user.likes + 1 }
        users.set(id, next)
        return Effect.succeed(next)
      }))
  })
  return { users, calls, layer }
}

// Reads

export const Users = Query.Tag("users")

export class ListUsers extends Query.Service<ListUsers>()("users/ListUsers", {
  args: { page: Schema.Number },
  success: UserPage,
  error: Schema.Never,
  staleTime: "30 seconds",
  tags: [Users]
}, Effect.map(UsersApi, (api) => ({ page }) => api.list(page))) {}

export class GetUser extends Query.Service<GetUser>()("users/GetUser", {
  args: { id: Schema.String },
  success: User,
  error: UserNotFound,
  staleTime: "30 seconds",
  tags: [Users]
}, Effect.map(UsersApi, (api) => ({ id }) => api.get(id))) {}

// Mutations

export class RenameUser
  extends Command.Service<RenameUser>()("users/RenameUser", {
    args: { id: Schema.String, name: Schema.String },
    mode: "queue",
    group: ["id"],
    invalidates: () => [ListUsers],
    optimistic: ({ id, name }) => [
      GetUser.patch({ id }, (user) => ({ ...user, name })),
      ListUsers.patchAll((page) => ({
        ...page,
        users: page.users.map((user) =>
          user.id === id ? { ...user, name } : user
        )
      }))
    ],
    // Options come before the body, so the success type is written out.
    writes: (user: User) => [GetUser.set({ id: user.id }, user)]
  }, Effect.map(UsersApi, (api) => ({ id, name }) => api.rename(id, name)))
{}

export class LikeUser extends Command.Service<LikeUser>()("users/LikeUser", {
  args: { id: Schema.String },
  invalidates: () => [Users],
  optimistic: (
    { id }
  ) => [GetUser.patch({ id }, (user) => ({ ...user, likes: user.likes + 1 }))]
}, Effect.map(UsersApi, (api) => ({ id }) => api.like(id))) {}

export const layer = Layer.mergeAll(
  ListUsers.layer,
  GetUser.layer,
  RenameUser.layer,
  LikeUser.layer
)

// Routes

export const AppRoute = Route.union({
  List: Route.make("/"),
  Detail: Route.make("/users/:id", { params: { id: Schema.String } }),
  NotFound: Route.make("/*")
})

const detailUrl = (id: string) =>
  AppRoute.print(AppRoute.Detail({ params: { id } }))

// UserCard: one user, with a like button

export const UserCardMessage = UiSchema.TaggedEnum({
  Like: {},
  Liked: {}
})

export const UserCard = Component.define({
  name: "UserCard",
  scoped: false,
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Struct({}),
  message: UserCardMessage,
  elements: Html,
  queries: {
    user: { query: GetUser, args: ({ props }) => ({ id: props.id }) }
  }
}).make({
  init: () => ({}),
  update: ($, message) =>
    UserCardMessage.match(message, {
      Like: () =>
        $.run(
          LikeUser.make({ id: $.props.id }).pipe(Command.match({
            onSuccess: () => UserCardMessage.Liked(),
            onFailure: () => UserCardMessage.Liked()
          }))
        ),
      Liked: () => $.model
    }),
  view: (h) =>
    AsyncResult.match(h.queries.user, {
      onInitial: () => h.p("Loading user…"),
      onFailure: () => h.p("This user doesn't exist."),
      onSuccess: ({ value: user, waiting }) =>
        h.article(
          h.h2(user.name),
          h.p(user.email),
          h.button.attr("aria-label", "Like").onClick(UserCardMessage.Like())
            .children(
              `♥ ${user.likes}`
            ),
          // waiting is only "a fetch is in flight". An optimistic patch alone doesn't set it.
          waiting && h.small("Updating…")
        )
    })
})

// RenameForm: edits a user's name through a derived draft

export const RenameFormMessage = UiSchema.TaggedEnum({
  Edit: { name: Schema.String },
  Cancel: {},
  Save: {},
  Saved: {},
  SaveFailed: { name: Schema.String, reason: Schema.String }
})

export const RenameForm = Component.define({
  name: "RenameForm",
  scoped: false,
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Struct({
    draft: Schema.Option(Schema.String),
    error: Schema.Option(Schema.String)
  }),
  message: RenameFormMessage,
  elements: Html,
  queries: {
    user: { query: GetUser, args: ({ props }) => ({ id: props.id }) }
  }
}).make({
  init: () => ({ draft: Option.none(), error: Option.none() }),
  update: ($, message) =>
    RenameFormMessage.match(message, {
      Edit: ({ name }) => ({
        ...$.model,
        draft: Option.some(name),
        error: Option.none()
      }),
      Cancel: () => ({
        ...$.model,
        draft: Option.none(),
        error: Option.none()
      }),
      Save: () =>
        Option.match($.model.draft, {
          onNone: () => $.model,
          onSome: (name) =>
            // No saving flag in the Model. The run ends with the form, so if it unmounts neither
            // message below arrives, and a flag set here would come back stuck from history.state.
            $.set({ ...$.model, draft: Option.none(), error: Option.none() })
              .run(
                RenameUser.make({ id: $.props.id, name }).pipe(Command.match({
                  onSuccess: () => RenameFormMessage.Saved(),
                  onFailure: (error) =>
                    RenameFormMessage.SaveFailed({ name, reason: error.reason })
                }))
              )
        }),
      Saved: () => $.model,
      SaveFailed: ({ name, reason }) => ({
        ...$.model,
        draft: Option.orElse($.model.draft, () => Option.some(name)),
        error: Option.some(reason)
      })
    }),
  view: (h, model) =>
    AsyncResult.match(h.queries.user, {
      onInitial: () => h.p("Loading…"),
      onFailure: () => h.p("There is nothing to rename."),
      onSuccess: ({ value: user }) =>
        h.form.onSubmit(RenameFormMessage.Save()).children(
          h.input.attr("aria-label", "Name").value(
            Option.getOrElse(model.draft, () => user.name)
          )
            .onInput(({ value }) => RenameFormMessage.Edit({ name: value })),
          h.button.attr("type", "submit").disabled(Option.isNone(model.draft))
            .children("Save"),
          h.button.attr("type", "button").disabled(Option.isNone(model.draft))
            .onClick(RenameFormMessage.Cancel()).children("Cancel"),
          // This instance has a save of this user queued or running.
          h.isRunning(RenameUser, { id: h.props.id }) && h.small("Saving…"),
          Option.match(model.error, {
            onNone: () => null,
            onSome: (reason) => h.p.attr("role", "alert").children(reason)
          })
        )
    })
})

// DetailPage

export const DetailPageMessage = UiSchema.TaggedEnum({ ToggleRename: {} })

export const DetailPage = Component.define({
  name: "DetailPage",
  scoped: false,
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Struct({ renaming: Schema.Boolean }),
  message: DetailPageMessage,
  elements: Html
}).make({
  init: () => ({ renaming: false }),
  update: ($) => ({ renaming: !$.model.renaming }),
  view: (h, model) =>
    h.section(
      UserCard(h, { key: "card", props: { id: h.props.id } }),
      h.button.onClick(DetailPageMessage.ToggleRename()).children(
        model.renaming ? "Close" : "Rename"
      ),
      model.renaming &&
        RenameForm(h, { key: "rename", props: { id: h.props.id } })
    )
})

// ListPage: a paged list that keeps the previous page on screen while the next one loads

export const ListPageMessage = UiSchema.TaggedEnum({
  GoTo: { page: Schema.Number }
})

export const ListPage = Component.define({
  name: "ListPage",
  scoped: false,
  model: Schema.Struct({ page: Schema.Number }),
  message: ListPageMessage,
  elements: Html,
  queries: {
    users: { query: ListUsers, args: ({ model }) => ({ page: model.page }) }
  }
}).make({
  init: () => ({ page: 0 }),
  update: ($, message) =>
    ListPageMessage.match(message, {
      GoTo: ({ page }) => ({ ...$.model, page })
    }),
  view: (h, model) => {
    const current = h.queries.users
    if (AsyncResult.isFailure(current)) {
      return h.p("The users couldn't be loaded.")
    }
    // The requested page once it is here. Until then the page the query still holds, if any.
    const shown = AsyncResult.isSuccess(current)
      ? Option.some(current.value)
      : h.previous.users
    return Option.match(shown, {
      onNone: () => h.p("Loading users…"),
      onSome: ({ page, pages, users }) =>
        h.section(
          h.ul(
            users.map((user) =>
              h.li.key(user.id).children(
                h.a.attr("href", detailUrl(user.id)).children(user.name)
              )
            )
          ),
          h.nav(
            h.button.disabled(model.page === 0)
              .onClick(ListPageMessage.GoTo({ page: model.page - 1 })).children(
                "Previous"
              ),
            h.span(`Page ${page + 1} of ${pages}`),
            h.button.disabled(model.page >= pages - 1)
              .onClick(ListPageMessage.GoTo({ page: model.page + 1 })).children(
                "Next"
              ),
            model.page !== page && h.small(`Loading page ${model.page + 1}…`)
          )
        )
    })
  }
})

// App: the layout, which holds the route

export const AppMessage = UiSchema.TaggedEnum({
  RouteChanged: { route: AppRoute }
})

export const App = Component.define({
  name: "App",
  scoped: false,
  props: Schema.Struct({ route: AppRoute }),
  model: AppRoute,
  message: AppMessage,
  elements: Html
}).make({
  init: ($) => $.props.route,
  update: (_, message) => message.route,
  subscriptions: (
    { model }
  ) => [
    Router.subscription(
      AppRoute,
      model,
      (route) => AppMessage.RouteChanged({ route })
    )
  ],
  view: (h, route) =>
    h.div(
      h.header(
        h.a.attr("href", AppRoute.print(AppRoute.List())).children("Users")
      ),
      h.main(
        AppRoute.match(route, {
          List: () => ListPage(h, { key: "list" }),
          Detail: ({ params }) =>
            DetailPage(h, {
              key: `user-${params.id}`,
              props: { id: params.id }
            }),
          NotFound: () => h.h1("Not found")
        })
      )
    )
})
