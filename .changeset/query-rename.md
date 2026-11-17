---
"@effect/ui": patch
---

Rename the data-loading primitive from `Loader` to `Query`, and the testing `Query` locator to `Locator`. Behaviour is unchanged.

- `@effect/ui/Loader` is now `@effect/ui/Query`: `Loader.Read` is `Query.Query`, a list read is an `InfiniteQuery` (`InfiniteService`, `InfiniteTypeId`), and `LoadedList` is `InfiniteData`.
- A component's `loaders` option is now `queries`, with entries `{ query }` and `{ queryMany }` instead of `{ load }` and `{ loadMany }`. `h.loaded` and `$.loaded` are `h.queries` and `$.queries`, and `head` and `subscriptions` take `queries`.
- `Component.Load` and `Component.LoadMany` are `Component.QueryOne` and `Component.QueryMany`, `LoadedOf` is `QueryResultOf`, and `KeyedLoaded` is `KeyedResults`.
- `testing/TestLoader` is `testing/TestQuery`. A `Story`'s `loaded()` is `queries()`, and the old `queries()` is `queryInfo()`, returning `QueryInfo`.
- `testing/Query` and `html/testing/HtmlQuery` are `testing/Locator` and `html/testing/HtmlLocator`.
- A route's `query` is now `search`: `patchQuery` is `patchSearch`, and the other query-string names follow.
- In the `MessageLog`, `LoaderChanged` is `QueryChanged` and `PrefetchReadNotProvided` is `PrefetchQueryNotProvided`. Page state stores queries under `~query` and `~queries`. State, server-rendered HTML and logs written by an earlier version aren't adopted or decoded.
