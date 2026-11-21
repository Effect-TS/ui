---
"@effect/ui": minor
"@effect/ui-kit": minor
---

`children` on an element builder now returns the builder, and a second call adds after the first, so a function that takes a builder can add children of its own and still return a builder. Add `forward` to element builders, which lets a chain land on an element below the root of what is rendered: `h.input.forward((node) => h.div.class("frame").children(node))`. A headless part can add children and set `forward` inside `p.part`.

A view value is a builder until it is built, so read a node with `View.build(builder, [])`. `View.buildOwned` is removed. A field added to a library builder under a symbol is no longer kept by its chain calls: looking for one on every copy took about half of the time to build a view.

`Switch`'s parts now take the consumer's builder and return it: `parts.root(h.button).children(parts.thumb(h.span))`. The form field is the root's first child.
