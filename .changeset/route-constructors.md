---
"@effect/ui": minor
---

A route union now has a constructor per route, so a route value is built as `AppRoute.Home()` or `AppRoute.Note({ params: { id: "42" } })` instead of `AppRoute.make({ _tag: "Note", params: { id: "42" } })`. A constructor is `make` with the tag filled in: it takes `{ params, search }`, fills in `params`, `search` and decoding defaults, and validates. The argument is optional when the route has no field that needs a value. A union from `subset` has constructors for its own routes only. `make` stays, for a tag held in a variable.

`Route.Union` is now a type alias, `Route.Union.Base<Routes> & Route.Union.Constructors<Routes>`, so it can no longer be extended as an interface.

Route tags now share a namespace with the union's members. A tag in `Route.Union.ReservedTag` is a type error at `Route.union`, and `Route.union` also throws for a tag that names a member the union has at runtime. These tags worked before and are now rejected:

- Schema type members: `Type`, `Encoded`, `Iso`, `Rebuild`, `DecodingServices`, `EncodingServices` and the `~` schema keys. These are type errors only.
- Route union and schema members: `routes`, `parse`, `resolve`, `print`, `printPath`, `subset`, `base`, `setBase`, `make`, `makeOption`, `makeEffect`, `match`, `matchOrElse`, `cases`, `guards`, `isAnyOf`, `tag`, `ast`, `annotate`, `annotateKey`, `check`, `rebuild`, `pipe`.
- Function members: `name`, `length`, `prototype`, `apply`, `bind`, `call`, `caller`, `arguments`, `toString`.
- `Object.prototype` members, such as `constructor`, `valueOf` and `hasOwnProperty`.

PascalCase tags, the usual style for routes, only collide with the first group.
