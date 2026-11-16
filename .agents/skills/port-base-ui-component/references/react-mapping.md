# React to Effect UI

| Base UI (React)                               | Effect UI                                                                                                |
| :-------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| `useControlled`, `checked` / `defaultChecked` | The value is a prop. Drop the `default*` prop.                                                           |
| `useState` for interaction state              | The Model, set in `update`.                                                                              |
| `on<Value>Change` callback                    | An `Events` member `<Value>Change`, emitted with `$.emit`. The consumer maps it with `onEmit`.           |
| `eventDetails.cancel()`                       | Nothing: a controlled value changes only when the consumer passes it back. For popups, see below.        |
| Context from Root to its parts                | `parts` builds every part from the same Model and props.                                                 |
| `useBaseUiId`, `useId`                        | `p.id("part")`, stable across server and browser.                                                        |
| `useRef`, `forwardRef`, `inputRef`            | `Html.ref("<Name>.<part>", tag)` attached in a part. `Html.focus` and `Html.scrollIntoView` in `update`. |
| `render` prop, `nativeButton`                 | The consumer applies a part to its own builder. The part's tag list replaces `nativeButton`.             |
| `className` / `style` as functions of state   | Data attributes, and the plain values `parts` returns.                                                   |
| `useButton`                                   | A part that accepts `"button"`. Add key handlers only for a non-native element.                          |
| `mergeProps`, chained handlers                | Part layers: the kit's handler runs first and the consumer's last.                                       |
| `useEffect` with document or window listeners | `subscriptions`.                                                                                         |
| Timers (delays, typeahead reset)              | A Subscription, or Model state that needs no timer (see `Listbox`'s typeahead).                          |
| `FloatingPortal`, `Portal`                    | The top layer, chosen by who closes the popup. See below.                                                |
| Floating UI positioning                       | Stop: no positioning helper exists yet.                                                                  |
| `useFieldRootContext`, `useFormContext`       | Stop for required behaviour, or leave out and list under Differences. No Field exists yet.               |
| `DirectionProvider`                           | Stop for RTL-dependent keyboard handling. No direction service exists yet.                               |
| Hidden `<input>` for forms                    | An `input` part. `type="hidden"` when native validation isn't needed.                                    |

## Portals and the top layer

A portal only moves where a popup renders. Choose the top-layer element by who
decides when it closes, not because the React source uses a portal. The
details are in the JSDoc of `popover` and `modal` in
`packages/ui/src/html/Html.ts`.

- `.popover("manual", open)` is controlled: the host shows and hides it as
  `open` says, and puts it back if anything else changes it. Use it when
  `open` is a prop. Dismissal is then the kit's job: handle Escape on the
  focused part, and an outside click with `subscriptions` (stop if none
  fits), each emitting `OpenChange` with `open: false`. The popup stays
  open until the consumer passes `open: false`, so a consumer can refuse.
- `.popover("auto", open)` with `onToggle` is followed: the browser closes
  it on Escape, an outside click or another auto popover opening, and the
  Model must store what `onToggle` reports. Use it only when `open` is the
  component's own Model state and nobody can refuse a close, as in
  `Listbox`. Never use it for an `open` prop: the browser closes the popup
  while the props still say open.
- `<dialog>` with `.modal(open)` and `onCancel` is a controlled modal: the
  host cancels Escape and backdrop clicks and sends them as `onCancel`,
  which emits `OpenChange`. Browsers may still force a close after repeated
  cancels, so handle `onClose` too and emit `OpenChange` from it.
