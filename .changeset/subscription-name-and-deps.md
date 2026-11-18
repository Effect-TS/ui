---
"@effect/ui": patch
---

Keep the name and deps a Subscription's key is built from, and log them, so DevTools can group and label Subscriptions without parsing keys.

- `Subscription` has `name` and `deps` beside `key`. `name` is the string given to `Subscription.make`, with no escaping. `deps` is the deps as an array, and `undefined` when `make` got none: `Subscription.make("room", "42", build)` has `name: "room"`, `deps: ["42"]` and `key: 'room:"42"'`. Keys are built as before, and the runtime still diffs by `key`.
- `MessageLog.SubscriptionStarted`, `MessageLog.SubscriptionStopped` and the `Subscription` variant of `MessageLog.Source` carry `name` and `deps`.
- The Wire has the same two fields, and `MessageLog.wireVersion` is now `5`. `deps` is an array of JSON values, or `null` for a Subscription with no deps. A dep JSON can't carry is sent readable, not exact: `NaN`, `Infinity` and `-Infinity` as `{ "~unserialisable": "number" }` and `-0` as `0`. The `key` still tells them apart.
- `Router.blocked(key)` is named `@effect/ui/Router/blocked` with `key` as its dep, so every block shares one name. Its Subscription key changes from `@effect/ui/Router/blocked/form` to `@effect/ui/Router/blocked:"form"`, which a test reading `steps.subscriptions` will see.

Behaviour: two entries with one key in a single `subscriptions` result fail the instance, with `Failed` `in` `"subscription"` and an error that names the path and the key. Before, the second entry was dropped and nothing said so. A Story or Scene throws the same error when it reads `subscriptions` or delivers with `subscription(key, message)`.
