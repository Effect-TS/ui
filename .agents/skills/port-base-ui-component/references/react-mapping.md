# React to Effect UI

| Base UI (React)                               | Effect UI                                                                                                |
| :-------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| `useControlled`, `checked` / `defaultChecked` | The value is a prop. Drop the `default*` prop.                                                           |
| `useState` for interaction state              | The Model, set in `update`.                                                                              |
| `on<Value>Change` callback                    | An `Events` member `<Value>Change`, emitted with `$.emit`. The consumer maps it with `onEmit`.           |
| `eventDetails.cancel()`                       | Nothing: the value only changes when the consumer passes it back.                                        |
| Context from Root to its parts                | `parts` builds every part from the same Model and props.                                                 |
| `useBaseUiId`, `useId`                        | `p.id("part")`, stable across server and browser.                                                        |
| `useRef`, `forwardRef`, `inputRef`            | `Html.ref("<Name>.<part>", tag)` attached in a part. `Html.focus` and `Html.scrollIntoView` in `update`. |
| `render` prop, `nativeButton`                 | The consumer applies a part to its own builder. The part's tag list replaces `nativeButton`.             |
| `className` / `style` as functions of state   | Data attributes, and the plain values `parts` returns.                                                   |
| `useButton`                                   | A part that accepts `"button"`. Add key handlers only for a non-native element.                          |
| `mergeProps`, chained handlers                | Part layers: the kit's handler runs first and the consumer's last.                                       |
| `useEffect` with document or window listeners | `subscriptions`.                                                                                         |
| Timers (delays, typeahead reset)              | A Subscription, or Model state that needs no timer (see `Listbox`'s typeahead).                          |
| `FloatingPortal`, `Portal`                    | The top layer: `.popover("auto", open)` or `<dialog>`.                                                   |
| Floating UI positioning                       | Stop: no positioning helper exists yet.                                                                  |
| `useFieldRootContext`, `useFormContext`       | Stop for required behaviour, or leave out and list under Differences. No Field exists yet.               |
| `DirectionProvider`                           | Stop for RTL-dependent keyboard handling. No direction service exists yet.                               |
| Hidden `<input>` for forms                    | An `input` part. `type="hidden"` when native validation isn't needed.                                    |
