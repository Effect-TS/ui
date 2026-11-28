---
"@effect/ui-native": patch
---

Load the kit in Node tests without mocks: add `NativeVitest.plugin` to `@effect/ui-native/node`, and replace `NativeHost.make`'s `os` and `processColor` options with `device`.
