---
"@effect/ui": minor
"@effect/ui-opentui": minor
---

Remove `@effect/ui/html/register`, `@effect/ui-opentui/register`, the `View.Register` / `View.registerElements` global registry, `View.H`, and `Markdown.H`. Add `Component.Define`, `Component.DefineOptions`, `Html.component`, `Html.H`, `OpenTui.component`, and `OpenTui.H` so components and reusable pure view functions declare their element vocabulary explicitly.
