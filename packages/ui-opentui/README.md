# `@effect/ui-opentui`

OpenTUI vocabulary, terminal host, global Subscriptions, imperative Commands, and test harnesses for building terminal applications with `@effect/ui`.

## Requirements

- Peer dependencies: `effect`, `@effect/ui`, `@opentui/core` (`^0.9.9`)
- Runtime: **Node 26.4+** with `--experimental-ffi`, or **Bun 1.3.14+** (no flag required)

## Modules

- `OpenTui`: `OpenTui.component`, `OpenTui.H`, element vocabulary (`box`, `scrollbox`, `lineNumber`, `text`, `span`, `b`, `i`, `u`, `a`, `br`, `input`, `textarea`, `select`, `tabSelect`, `slider`, `code`, `diff`, `markdown`, `asciiFont`), plain-data event payloads, `OpenTui.Host`, and `OpenTui.ref`
- `OpenTuiHost`: `makeHost`, `layer`, `layerFromRenderer`, `mount`, `mountEffect`, and `run`
- `OpenTuiSubscription`: global `onKeyPress`, `onKeyRelease`, `shortcuts`, `onPaste`, and `onResize`
- `OpenTuiKeyboard`: pure shortcut table matcher over `OpenTui.KeyPayload`
- `OpenTuiCommand`: ref commands (`focus`, `blur`, `scrollTo`, `scrollBy`, `measure`) and `quit`
- `@effect/ui-opentui/testing`: `TestOpenTuiEvents` (FFI-free `TestHost` fakes) and `OpenTuiTest` (native frame-rendering harness over `@opentui/core/testing`)

## Example

See `examples/snake-tui` for a terminal port of `examples/snake` sharing its domain modules.
