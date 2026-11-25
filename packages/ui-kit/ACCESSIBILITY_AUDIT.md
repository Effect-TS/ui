# `@effect/ui-kit` accessibility audit

Audited all 41 exported modules and internal helpers in `packages/ui-kit/src/`.

The baseline is solid. Native `<button>`, `<input>`, `<fieldset>`, and `<form>` elements carry most of the interaction semantics, `type="button"` is set consistently, `aria-disabled` is avoided when native `disabled` is present, exit animations use `getAnimations()` so `prefers-reduced-motion: reduce` settles immediately, and `Popover` / `Dialog` / `Toast` handle top-layer ordering cleanly.

Most of the serious problems fall into four patterns: modal overlays that do not fully isolate background content or set `aria-modal="true"`, `aria-hidden="true"` placed on focusable elements in `Toast`, dangling or overwritten `aria-labelledby`/`aria-describedby`/`aria-controls` IDREFs, and keyboard modifier or RTL inconsistencies across components.

---

## 1. High-priority bugs and Base UI parity gaps

### Modals, dialogs, and overlays

1. **Missing `aria-modal="true"` on all modal dialogs.**
   - Files: [Dialog.ts:1388-1409](./src/Dialog.ts#L1388-L1409), [AlertDialog.ts:205-212](./src/AlertDialog.ts#L205-L212) (inherited by `Drawer` and modal `Popover`).
   - `portal` renders `<dialog popover="manual">` with `.open(false)`. Because `showModal()` is not used, the browser does not expose modal semantics automatically, and neither `portal` nor `popup` sets `aria-modal="true"` when `modal` is `true` or `"trap-focus"`.
   - `portal` also holds the implicit `role="dialog"` and labels, while `popup` holds `tabindex="-1"` with no role or label. When focus falls back to `popup` (touch open, zero tabbables, focus recovery), focus lands on an unnamed generic `<div>`.

2. **`Dialog` forces `focusVisible: false` on keyboard open and Tab wrap.**
   - File: [Dialog.ts:575-586](./src/Dialog.ts#L575-L586), [Dialog.ts:707-712](./src/Dialog.ts#L707-L712), [Dialog.ts:761-769](./src/Dialog.ts#L761-L769).
   - `handOff()` defaults `focusVisible` to `false`. Neither `focusFirst` (even when `openMethod === "keyboard"`) nor Tab-wrapping passes `focusVisible: true`. In browsers that honor `FocusOptions.focusVisible` (Firefox), this suppresses `:focus-visible` outlines during keyboard navigation (WCAG 2.4.7).
   - `restoreFocus` ([Dialog.ts:943-946](./src/Dialog.ts#L943-L946)) also checks `isConnected` without checking whether the target is `disabled`, `inert`, or hidden, so focus can drop to `document.body` instead of continuing down the fallback chain.
   - `tabbableSelector` ([Dialog.ts:471-483](./src/Dialog.ts#L471-L483)) misses `audio[controls]`, `video[controls]`, `<details>` without `<summary>`, and `[contenteditable="plaintext-only"]`, and treats any `<summary>` as tabbable even outside `<details>`.

3. **Shadow DOM breaks `hideOthers()` and modal focus tracking.**
   - Files: [internal/modal.ts:25-60](./src/internal/modal.ts#L25-L60), [Dialog.ts:508](./src/Dialog.ts#L508), [Dialog.ts:749](./src/Dialog.ts#L749), [Toast.ts:449-462](./src/Toast.ts#L449-L462).
   - `hide()` in `internal/modal.ts` walks `node.parentNode`, which stops at a `ShadowRoot`. If a modal dialog lives inside a shadow root, its shadow host is not added to `keep`, so `walk(body)` sets `aria-hidden="true"` on the shadow host and hides the open modal itself from screen readers.
   - `hide()` also only exempts `[aria-live]`, not implicit live region roles (`[role="alert"]`, `[role="status"]`, `[role="log"]`, `[role="timer"]`), and does not observe newly appended siblings to `body`.
   - `internal/dom.ts` already exports Shadow-DOM-aware `activeOf(document)`, yet neither `Dialog.ts` nor `Toast.ts` uses it.

4. **Modal `Select`, `Menu`, and `ContextMenu` do not hide background content from screen readers.**
   - Files: [Select.ts:1043-1048](./src/Select.ts#L1043-L1048), [Menu.ts:1425-1443](./src/Menu.ts#L1425-L1443), [Menu.ts:2867-2868](./src/Menu.ts#L2867-L2868).
   - All three default to `modal: true`, lock scroll, and render pointer blockers, but never call `hideOthers(...)` (unlike [internal/combobox.ts:898](./src/internal/combobox.ts#L898)). Because they use `popover="manual"`, background DOM stays in the accessibility tree and touch screen readers (VoiceOver, TalkBack) swipe straight out of the modal popup into the page.
   - `Select.ts` also renders no visually hidden dismiss button for touch screen readers (unlike Base UI and `internal/combobox.ts:1430-1438`).
   - Forward `Tab` in `Select.ts:1760` is unhandled and escapes a `modal: true` popup (only `Shift+Tab` is intercepted). Similarly, `Combobox`/`Autocomplete` with `inputInPopup: true` and `modal: true` sets `role="dialog"` ([internal/combobox.ts:1798](./src/internal/combobox.ts#L1798)) without trapping `Tab`.

5. **WCAG and axe-core `aria-hidden-focus` violations in `Toast`.**
   - File: [Toast.ts:898-909](./src/Toast.ts#L898-L909), [Toast.ts:979-989](./src/Toast.ts#L979-L989), [Toast.ts:476-487](./src/Toast.ts#L476-L487).
   - High-priority toast roots (`tabindex="0"`, containing focusable action and close buttons) carry `aria-hidden="true"` whenever `!model.focused`. Screen reader browse-mode and touch-exploration users cannot see the toast or its buttons at all, and focusable elements inside `aria-hidden="true"` fail axe-core `aria-hidden-focus`.
   - `close` buttons (`<button>`) also carry `aria-hidden="true"` whenever the stack is collapsed, while remaining in the Tab order.
   - `onFocusIn` returns early unless `target.matches(":focus-visible")` ([Toast.ts:483](./src/Toast.ts#L483), also missing `try/catch`). Voice control, switch, mouse, or programmatic focus that does not trigger `:focus-visible` fails to pause auto-dismiss timers (WCAG 2.2.1), fails to expand the stack, and leaves high-priority toasts `aria-hidden="true"` while focused.
   - Pressing `F6` focuses `viewport`, not the first toast, and `Escape` is only handled on `rootPart` ([Toast.ts:916-921](./src/Toast.ts#L916-L921)), so `F6` followed by `Escape` does nothing.
   - Exiting toasts (`ending`) are not marked `inert` ([Toast.ts:909](./src/Toast.ts#L909) only sets `inert` on `toast.limited`), so users can Tab into a toast mid-exit.

6. **`Popover` opened by hover drops focus to `document.body` on close.**
   - File: [Popover.ts:1124-1125](./src/Popover.ts#L1124-L1125).
   - `byHover` forces `finalFocus: false`. If a user hovers to open, clicks or Tabs into the popover, and then presses `Escape` or clicks `popover.close`, focus blurs to `document.body` ([Dialog.ts:933-936](./src/Dialog.ts#L933-L936)) instead of returning to the trigger.

### Broken or overwritten ARIA IDREFs

7. **Dangling `aria-labelledby` and `aria-describedby` references across six components.**
   - [Field.ts:427-428, 450](./src/Field.ts#L427-L428): adds `errorId` to `aria-describedby` whenever `invalid && !disabled`, even if `field.error` is never rendered.
   - [Field.ts:478](./src/Field.ts#L478): `field.group` unconditionally writes `aria-labelledby={legendId}` even if `field.legend` is omitted (which overrides a consumer `aria-label`).
   - [Fieldset.ts:182](./src/Fieldset.ts#L182): `fieldset.root` unconditionally writes `aria-labelledby={legendId}` even if `fieldset.legend` is omitted.
   - [Meter.ts:172, 184](./src/Meter.ts#L172) and [Progress.ts:211, 235](./src/Progress.ts#L211): unconditionally write `aria-labelledby={labelId}` even when `label` is not rendered.
   - [Menu.ts:3512-3527](./src/Menu.ts#L3512-L3527): `group` unconditionally writes `aria-labelledby={groupLabelId}` even if `groupLabel` is omitted.
   - [Collapsible.ts:554-572](./src/Collapsible.ts#L554-L572): `root` is documented as optional, but `root.forward` is what patches `trigger`'s `aria-controls` when `panel` has a custom `id`. Omitting `root` leaves a dangling `aria-controls`.
   - Base UI tracks mounted subparts and only emits these IDREFs when the target element exists.

8. **Token-list ARIA attributes overwritten instead of merged.**
   - [Accordion.ts:496-501](./src/Accordion.ts#L496-L501) (`internal/tree.ts:56-68` `setOn`): overwrites consumer `aria-labelledby` on `panel` instead of merging via `withTokens`.
   - [Tabs.ts:1002](./src/Tabs.ts#L1002): overwrites consumer `aria-labelledby` on `panel` despite JSDoc at [Tabs.ts:821-822](./src/Tabs.ts#L821-L822) promising token merging.
   - [internal/combobox.ts:1507, 1596, 1909](./src/internal/combobox.ts#L1507): overwrites `aria-controls` and group `aria-labelledby` despite JSDoc at [Combobox.ts:694-695](./src/Combobox.ts#L694-L695) promising token merging.

### Combobox, Autocomplete, and Select

9. **`Autocomplete` inline/both mode never selects the autocompleted suffix.**
   - File: [internal/combobox.ts:288-293, 420-433](./src/internal/combobox.ts#L288-L293).
   - Arrow navigation replaces `<input>`'s value with `completion.label` without calling `setSelectionRange` on the appended suffix. Typing another character appends to the full completed string instead of replacing the suggestion, breaking WAI-ARIA APG inline autocomplete.

10. **`Autocomplete` with `inputInPopup: true` omits `label` and `finalFocus` parts.**
    - File: [Autocomplete.ts:451, 636-647](./src/Autocomplete.ts#L636-L647).
    - Without `label`, neither the `trigger` (`role="combobox"`) nor the `popup` (`role="dialog"`) receives `aria-labelledby`.

11. **`Combobox` `chip` puts `aria-disabled` and `aria-readonly` on a roleless `<div>`.**
    - File: [internal/combobox.ts:1693-1701](./src/internal/combobox.ts#L1693-L1701).
    - `aria-disabled` and `aria-readonly` are prohibited on `generic` elements in ARIA 1.2 (flagged by axe-core).
    - Also in `internal/combobox.ts`: `trigger` hardcodes `aria-haspopup="listbox"` even when `grid: true` ([internal/combobox.ts:1595](./src/internal/combobox.ts#L1595)), and `list` omits `aria-readonly` when `grid: true` ([internal/combobox.ts:1837](./src/internal/combobox.ts#L1837)).
    - Neither `Select`'s listbox ([Select.ts:1742-1783](./src/Select.ts#L1742-L1783)) nor `Combobox`/`Autocomplete`'s list ([internal/combobox.ts:1831-1843](./src/internal/combobox.ts#L1831-L1843)) sets `aria-labelledby`.

12. **`internal/filter.ts` breaks punctuation-insensitive and combining-mark search.**
    - File: [internal/filter.ts:24-37](./src/internal/filter.ts#L24-L37).
    - Slicing `text` by `query.length` UTF-16 code units breaks `ignorePunctuation: true` and decomposed diacritics (`contains("co-op", "coop")` and `contains("e\u0301clair", "eclair")` both return `false`).

### Menus, Menubar, NavigationMenu, and Tooltip

13. **`NavigationMenu` is missing its entire disclosure and focus-management subsystem.**
    - File: [NavigationMenu.ts:217-258](./src/NavigationMenu.ts#L217-L258).
    - Ships only flat `<nav><ul><li><a>` links. Base UI's `Trigger` (`aria-expanded`, `aria-controls`), `Content`, `Viewport`, `Popup`, `Escape` dismissal, Tab-order bridging between trigger and viewport, and focus restoration are absent. Even in flat mode, `Home`/`End`, `DirectionProvider`, and `disabled` link click suppression are missing.

14. **`Menu` bugs: disabled submenu trigger, detached `MenuTrigger`, filtering `aria-controls`, horizontal separator.**
    - Disabled submenu trigger still opens its submenu on `ArrowRight`, `Enter`, `Space`, click, and hover because `submenuTriggerPart` never checks `parent.items` for `disabled: true` ([Menu.ts:869-871, 3111-3130](./src/Menu.ts#L3111-L3130)).
    - Detached `MenuTrigger` has no `onKeyDown` handler for `ArrowDown`/`ArrowUp` ([Menu.ts:2287-2360](./src/Menu.ts#L2287-L2360)).
    - Filtering menus switch `popup` to `role="presentation"` and move `role="menu"` onto `list`, but `trigger`'s `aria-controls` still points to `popupId` instead of `listId` ([Menu.ts:2991, 3258-3276](./src/Menu.ts#L3258-L3276)).
    - `separator` hardcodes `aria-orientation="horizontal"` even in a horizontal `Menu` ([Menu.ts:3528](./src/Menu.ts#L3528)).
    - Disabled items are always arrow-focusable and hover-highlighted ([Menu.ts:1081-1102, 2657-2666](./src/Menu.ts#L1081-L1102)), whereas Base UI skips disabled items.
    - `Menubar` puts **all** enabled triggers at `tabindex="0"` during SSR and before mount because `bar.tabStop` starts `null` ([Menubar.ts:218-221](./src/Menubar.ts#L218-L221), [Menu.ts:3005-3007](./src/Menu.ts#L3005-L3007)), and omits `data-disabled`/`aria-disabled` on `role="menubar"` when disabled.

15. **`Tooltip` lacks diagonal safe-area hovering and `:focus-visible` gating.**
    - File: [Tooltip.ts:405-414, 658-666, 771-776](./src/Tooltip.ts#L658-L666).
    - Unlike `Menu` and `PreviewCard`, `Tooltip` does not use `internal/safeArea.ts` and defaults `closeDelay` to `0`, so diagonal pointer travel from trigger to a wider popup closes it immediately (WCAG 1.4.13 Hoverable).
    - `FocusedTrigger` checks a `pressed` flag instead of `:focus-visible`, so programmatic focus restoration (such as closing a dialog by mouse click) pops open the tooltip unexpectedly.
    - `trigger` is restricted to `<button>`, preventing tooltips on `<a>` or `<input>`.

### Keyboard, modifier, and range bugs

16. **`Slider` keyboard gap bug, missing RTL, modifier hijack, and vertical direction mismatch.**
    - File: [Slider.ts:489-532, 565-570, 674-684, 953-961, 978](./src/Slider.ts#L489-L532).
    - Keyboard stepping with `minStepsBetweenValues` clamps to the neighbor's value without subtracting `s.gap`, then `keepsGap()` rejects the whole move. Pressing `PageUp` or `Shift+ArrowRight` near another thumb refuses to move at all instead of clamping to `neighbor - gap`.
    - `DirectionProvider` is never read, so horizontal arrow keys and dragging stay LTR in RTL layouts.
    - `onKeyDown` calls `preventDefault()` on `sliderKeys` without checking `alt`, `ctrl`, or `meta`, hijacking `Alt+ArrowLeft`/`ArrowRight` browser navigation.
    - Vertical inputs set `writing-mode:vertical-lr` without `direction:rtl`, inverting native touch/AT swipe direction relative to bottom-to-top pointer dragging.

17. **Other keyboard and modifier bugs across components.**
    - [NumberField.ts:1463-1474, 1666-1678](./src/NumberField.ts#L1463-L1474): `PageUp` and `PageDown` are not handled (Base UI steps by `largeStep`).
    - [OTPField.ts:1123-1134](./src/OTPField.ts#L1123-L1134): `onKeyDown` calls `preventDefault()` on navigation keys without excluding `alt` or `shift`, hijacking `Alt+ArrowLeft`/`ArrowRight`.
    - [RadioGroup.ts:574-576](./src/RadioGroup.ts#L574-L576) and [Tabs.ts:969-970](./src/Tabs.ts#L969-L970): arrow-key handlers do not ignore the `Shift` modifier.
    - [Tabs.ts:516-518](./src/Tabs.ts#L516-L518): `ActivateFromKeys` does not guard `event.repeat`, so holding `Space` dispatches repeated clicks.
    - [Select.ts:1428-1451](./src/Select.ts#L1428-L1451): missing `PageUp`/`PageDown` in open popup.
    - [internal/typeahead.ts:39](./src/internal/typeahead.ts#L39): cycle check `typed === key` is case-sensitive (`A` then `a` fails to cycle).

### Forms, hidden inputs, transitions, and viewport

18. **`Switch`, `Checkbox`, and `RadioGroup` use `<input type="hidden">` instead of visually-hidden native inputs.**
    - Files: [internal/field.ts:28-42](./src/internal/field.ts#L28-L42), [Switch.ts:247, 254](./src/Switch.ts#L247), [Checkbox.ts:387, 424](./src/Checkbox.ts#L387), [RadioGroup.ts:550-556](./src/RadioGroup.ts#L550-L556).
    - `<input type="hidden">` cannot participate in HTML5 `required` constraint validation, native `form.reset()`, or browser autofill. `Switch` and `Checkbox` also do not expose `form` even though `internal/field.ts:12` supports it.
    - Separately, a `Checkbox` inside `CheckboxGroup` always writes a generated `id` onto its button ([Checkbox.ts:388, 398](./src/Checkbox.ts#L388)), overwriting `field.control`'s `id` and breaking `<label for>`.

19. **Closing `Collapsible` and `Accordion` panels are not `inert`.**
    - File: [Collapsible.ts:598-602](./src/Collapsible.ts#L598-L602).
    - During exit transitions (`!open && mounted`), the panel has neither `hidden` nor `inert` (unlike [Tabs.ts:1004](./src/Tabs.ts#L1004)), so keyboard users can Tab into controls inside a closing panel.

20. **`NumberField.scrubAreaCursor` and `Meter`/`Progress` `nvdaLabel` leak text.**
    - [NumberField.ts:1749-1760](./src/NumberField.ts#L1749-L1760): `scrubAreaCursor` sets `role="presentation"` instead of `aria-hidden="true"`, exposing cursor glyphs like `"↔"` to screen readers.
    - [internal/range.ts:48-53](./src/internal/range.ts#L48-L53): `nvdaLabel` injects `<span role="presentation" style={visuallyHidden}>x</span>` into `Meter` and `Progress`, which leaks literal `"x"` into copy-paste (`"Storage75%x"`) and any AT that does not treat `meter`/`progressbar` children as strictly presentational. Base UI does not do this.

21. **`VirtualList` viewport is not keyboard-focusable, `<div role="row">` gets wrong ARIA, and item removal drops focus.**
    - File: [VirtualList.ts:1648, 1670-1675, 1716, 804](./src/VirtualList.ts#L1716).
    - `viewport` never sets `tabindex="0"` when overflowing (unlike `ScrollArea.ts:1082`), failing WCAG 2.1.1 / axe `scrollable-region-focusable` for read-only lists.
    - `itemPart` checks `b.tag === "tr"` instead of `role === "row"`, so ARIA grids/tables built with `<div role="row">` get `aria-posinset`/`aria-setsize` instead of `aria-rowindex`.
    - Deleting the currently focused item unmounts it with no focus fallback, dropping focus to `document.body`.

22. **`Positioning` ignores `visualViewport` and `VirtualKeyboard` turns off when pinch-zoomed.**
    - Files: [Positioning.ts:1487-1492](./src/Positioning.ts#L1487-L1492), [VirtualKeyboard.ts:218](./src/VirtualKeyboard.ts#L218).
    - `Positioning` sizes against `documentElement.clientWidth/clientHeight` instead of `window.visualViewport`, letting mobile popups land behind the software keyboard or off-screen under pinch-zoom (WCAG 2.4.11).
    - `VirtualKeyboard` returns `band: null` whenever `sample.scale !== 1`, disabling keyboard avoidance specifically for low-vision users who pinch-zoom (WCAG 1.4.4 / 2.4.11).

---

## 2. Strong standalone accessibility gaps (beyond Base UI or shared with Base UI)

These are areas where Base UI either omits the behavior or makes a similar trade-off, yet the gap causes real failures for keyboard or screen reader users.

1. **`Field` + `Form` silent validation on submit and dynamic errors.**
   - Files: [Field.ts:429](./src/Field.ts#L429), [Form.ts:160-181](./src/Form.ts#L160-L181).
   - `Field.error` renders no `role="alert"` or `aria-live`. When a user is already focused in the first invalid input and presses `Enter` to submit, `Form`'s `element.focus()` is a no-op and screen readers announce nothing at all. Blur/change validation errors are equally silent. Even though Base UI also leaves live regions to consumers, a form kit should either provide an opt-in live-region error mode or announce on submit when focus does not move.

2. **`Tooltip` is completely invisible to screen readers.**
   - File: [Tooltip.ts:744-758, 787](./src/Tooltip.ts#L744-L758).
   - Following Base UI, `Tooltip` sets no `role="tooltip"`, no `id` on `popup`, and no `aria-describedby` on `trigger`. That prevents duplicate speech when a tooltip mirrors an icon's `aria-label`, but breaks every tooltip that carries supplementary info (shortcuts like `"Bold (⌘B)"`, disabled explanations, status hints). Consider an opt-in prop for `role="tooltip"` + `aria-describedby` wiring so consumers do not have to hand-roll IDs for descriptive tooltips.

3. **`Drawer` snap points have no keyboard alternative.**
   - File: [Drawer.ts:1863-1885](./src/Drawer.ts#L1863-L1885).
   - `Snapped` only fires from pointer/touch swipes. There is no keyboard control to cycle snap points, no ARIA state/announcement for the current snap point, and no JSDoc warning telling consumers they must supply a button to satisfy WCAG 2.1.1 (Keyboard) and 2.5.1 (Pointer Gestures).

4. **`OTPField` gives every slot the exact same accessible name.**
   - File: [OTPField.ts:793-832, 1193-1199](./src/OTPField.ts#L793-L832).
   - All 6 slots inherit `root`'s `aria-labelledby` verbatim, so screen readers repeat `"Verification code, edit text"` on every digit with no positional cue (`1 of 6`). `root.attrs["aria-label"]` is also not propagated to slots.

5. **Unlabeled icon-only buttons in `Combobox` and `Autocomplete`, plus unannounced `chip` removal.**
   - File: [internal/combobox.ts:1586-1626, 1650-1674, 1704-1722](./src/internal/combobox.ts#L1586-L1626).
   - `trigger` (containing only `aria-hidden` `icon`), `clear`, and `chipRemove` render `<button tabindex="-1">` with no default `aria-label`. They remain in the accessibility tree for screen reader browse mode and touch exploration, failing WCAG 4.1.2 when left unnamed or reading `"times, button"` for `"×"`.
   - Focusing a `chip` gives no role or hint that `Backspace`/`Delete` removes it, and removing a chip emits no live-region announcement.

6. **`ContextMenu` keyboard opening fails on macOS and unfocusable triggers.**
   - Files: [ContextMenu.ts:43-46](./src/ContextMenu.ts#L43-L46), [Menu.ts:3054-3097](./src/Menu.ts#L3054-L3097).
   - JSDoc claims `Shift+F10` and the Menu key open it, but `contextTrigger` only listens to the `contextmenu` DOM event and adds no `tabindex` or `keydown` handler. On macOS, browsers do not synthesize `contextmenu` for `Shift+F10`, and an unfocusable `<div>` trigger (like the example at [ContextMenu.ts:107](./src/ContextMenu.ts#L107)) cannot be focused by keyboard users at all.

7. **Decorative indicators lack `aria-hidden="true"` inside `<button>` roots.**
   - Files: [Switch.ts:278](./src/Switch.ts#L278), [Checkbox.ts:426](./src/Checkbox.ts#L426), [RadioGroup.ts:601-609](./src/RadioGroup.ts#L601-L609).
   - Unlike `Select.itemIndicator` and `Menu` indicators (which set `aria-hidden="true"`), `Switch.thumb`, `Checkbox.indicator`, and `RadioGroup.indicator` do not. Putting a `"✓"` glyph or unlabeled SVG inside them pollutes the button's accessible name.

8. **`Separator` cannot be marked decorative.**
   - File: [Separator.ts:96-99, 116](./src/Separator.ts#L96-L99).
   - `forward` forces `role="separator"`, overriding any consumer `.attr("role", "none")` or `"presentation"`. Decorative dividers (such as between OTP slots or navbar links) create screen reader noise unless consumers manually add `aria-hidden="true"`.

9. **Hardcoded English ARIA strings and missing `(F6)` shortcut hint.**
   - [Toast.ts:875](./src/Toast.ts#L875): defaults viewport `aria-label` to `"Notifications"` without `(F6)` (Base UI includes the shortcut so screen reader users can discover it).
   - [Progress.ts:233](./src/Progress.ts#L233): hardcodes `aria-valuetext="indeterminate progress"` when indeterminate, overriding localized AT announcements that already trigger when `aria-valuenow` is omitted.
   - [NumberField.ts:1333, 1337-1338](./src/NumberField.ts#L1333): hardcodes `"Number field"`, `"Increase"`, `"Decrease"` regardless of `locale`, and omits `role="spinbutton"` / `aria-valuemin` / `aria-valuemax` so bounds on the hidden `<input type="number">` stay invisible to AT.
   - [Slider.ts:967-972](./src/Slider.ts#L967-L972): hardcodes `"start range"` / `"end range"` for 2 thumbs (none for 3+).
   - [internal/combobox.ts:1430-1438](./src/internal/combobox.ts#L1430-L1438): visually hidden dismiss button uses `<span role="button">` with hardcoded `aria-label="Dismiss"` and no i18n prop.

10. **Inconsistent RTL detection across the kit.**
    - `Tabs`, `Toolbar`, `OTPField`, `ToggleGroup`, `RadioGroup`, and `Menu` read `DirectionProvider` only (ignoring `<html dir="rtl">`).
    - `NavigationMenu` and `ScrollArea` read computed CSS `direction` only (ignoring `DirectionProvider`).
    - `Slider` reads neither.
    - Unifying on `DirectionProvider` with a computed-direction fallback (and wiring `Slider`) would prevent silent RTL arrow-key inversions.

---

## 3. Component-by-component summary

| Module | Status | Main findings |
| :--- | :--- | :--- |
| [Accordion.ts](./src/Accordion.ts) | Moderate | `panel` overwrites consumer `aria-labelledby` (`:496-501`) and forces `role="region"` (`:519`); inherits missing `inert` during exit from `Collapsible`. (Omitting roving focus matches current Base UI / APG.) |
| [AlertDialog.ts](./src/AlertDialog.ts) | High | Inherits missing `aria-modal="true"`, `focusVisible: false` bug, and Shadow DOM `hideOthers` bug from `Dialog`. |
| [Autocomplete.ts](./src/Autocomplete.ts) | High | Missing `label`/`finalFocus` for `inputInPopup` (`:636-647`); inline/both mode does not select completed suffix; unlabeled `trigger`/`clear` buttons; unnamed `list`. |
| [Avatar.ts](./src/Avatar.ts) | Solid | Mutually exclusive `image`/`fallback` matches Base UI. `alt` is left to consumer. |
| [Button.ts](./src/Button.ts) | Minor | `focusableWhenDisabled` cancels default without stopping click propagation (`:189-190`), so clicks bubble to clickable ancestors. |
| [Checkbox.ts](./src/Checkbox.ts) | Moderate | Member inside `CheckboxGroup` overwrites `field.control` `id` (`:388, 398`); `indicator` lacks `aria-hidden="true"` (`:426`); `<input type="hidden">` skips native `required` validation; `onKeyDown` shadows ancestor `onKeyDown` (`:416-421`). |
| [CheckboxGroup.ts](./src/CheckboxGroup.ts) | Solid | Clean `role="group"` and parent `aria-controls`. Minor: no `aria-disabled` on root (matches Base UI). |
| [Collapsible.ts](./src/Collapsible.ts) | Moderate | No `inert` on closing panel (`:598-602`); omitting optional `root` breaks `aria-controls` with a custom panel `id` (`:554-572`). |
| [Combobox.ts](./src/Combobox.ts) | High | `chip` sets `aria-disabled`/`aria-readonly` on roleless `<div>`; unlabeled `trigger`/`clear`/`chipRemove`; modal `inputInPopup` does not trap `Tab`; `aria-controls` and group `aria-labelledby` overwrite consumer values; `grid` `aria-haspopup`/`aria-readonly` bugs; unnamed `list`. |
| [ContextMenu.ts](./src/ContextMenu.ts) | High | `Shift+F10`/`ContextMenu` key broken on macOS and unfocusable `<div>` triggers despite JSDoc (`:43-46`); modal menu does not call `hideOthers()`. |
| [Dialog.ts](./src/Dialog.ts) | High | Missing `aria-modal="true"` (`:1388-1409`); `focusVisible: false` on keyboard open and Tab wrap (`:575-586, 707, 761, 769`); Shadow DOM breaks `hideOthers` and focus trap; `restoreFocus` ignores disabled/hidden targets (`:943-946`); incomplete `tabbableSelector` (`:471-483`). |
| [DirectionProvider.ts](./src/DirectionProvider.ts) | Minor | Matches Base UI, but does not read or sync DOM `dir`, and `Slider`/`NavigationMenu`/`ScrollArea` ignore it. |
| [Drawer.ts](./src/Drawer.ts) | High | Inherits all `Dialog` findings; snap points (`:1863-1885`) have no keyboard alternative or announcement; `drawerKeyboard.ts:196-205` synthetic touch focus/click risks iOS VoiceOver double-announcement. |
| [Field.ts](./src/Field.ts) | High | No live region / `role="alert"` on `error` (`:429`); dangling `aria-describedby` for unrendered `error` (`:427`) and `aria-labelledby` for unrendered `legend` (`:478`); `label` unusable with `focusWithin`. |
| [Fieldset.ts](./src/Fieldset.ts) | Moderate | Dangling `aria-labelledby` when `legend` is omitted (`:182`); nested `Fieldset` does not inherit outer `disabled`. |
| [Form.ts](./src/Form.ts) | Moderate | Silent submit failure when focus is already on first invalid field (`:160-181`); `focusInvalid` misses external `form="id"` controls (`:172`); no native `reset` handling. |
| [Input.ts](./src/Input.ts) | Solid | Clean native `<input>` semantics and `Field` composition. |
| [Menu.ts](./src/Menu.ts) | High | Modal menu never calls `hideOthers()`; disabled submenu trigger still opens (`:3111-3130`); detached `MenuTrigger` lacks `ArrowDown`/`ArrowUp` (`:2287-2360`); dangling `group` `aria-labelledby` (`:3516`); filtering `aria-controls` points to `role="presentation"` (`:2991, 3258`); horizontal `separator` wrong orientation (`:3528`); disabled items arrow/hover focusable. |
| [Menubar.ts](./src/Menubar.ts) | Moderate | SSR puts all triggers at `tabindex="0"` (`:218-221`, `Menu.ts:3005`); missing `data-disabled`/`aria-disabled` on root (`:410-416`); no printable-char typeahead on top-level bar. |
| [Meter.ts](./src/Meter.ts) | Moderate | Dangling `aria-labelledby` when `label` omitted (`:184`); `nvdaLabel` injects literal `"x"` (`internal/range.ts:48-53`). |
| [NavigationMenu.ts](./src/NavigationMenu.ts) | High | Missing Base UI's disclosure/viewport/popup/Escape/Tab-order subsystem; missing `Home`/`End`, `DirectionProvider`, and `disabled` link handling. |
| [NumberField.ts](./src/NumberField.ts) | Moderate | Missing `PageUp`/`PageDown` (`:1463-1474`); `scrubAreaCursor` uses `role="presentation"` instead of `aria-hidden="true"` (`:1753`); no `role="spinbutton"`/`aria-valuemin`/`aria-valuemax`; hardcoded English ARIA strings (`:1333-1338`). |
| [OTPField.ts](./src/OTPField.ts) | Moderate | All slots share one identical accessible name with no `1 of N` cue (`:793-832, 1193-1199`); `root` `aria-label` not propagated; `onKeyDown` hijacks `Alt+Arrow` (`:1123-1134`). |
| [Popover.ts](./src/Popover.ts) | High | Inherits missing `aria-modal="true"` when modal; hover-opened popover with `finalFocus: false` (`:1124-1125`) blurs focus to `document.body` if user moved focus inside. |
| [Positioning.ts](./src/Positioning.ts) | Moderate | Ignores `window.visualViewport` (`:1487-1492`), risking WCAG 2.4.11 clipping under mobile pinch-zoom or open software keyboards. |
| [PreviewCard.ts](./src/PreviewCard.ts) | Minor | Strong WCAG 1.4.13 compliance. Detached `PreviewCardTrigger` breaks Tab order into interactive card content (`:1030-1050`); no ARIA role/relationship (matches Base UI). |
| [Progress.ts](./src/Progress.ts) | Moderate | Dangling `aria-labelledby` when `label` omitted (`:235`); hardcoded English `aria-valuetext="indeterminate progress"` (`:233`); `nvdaLabel` `"x"` leakage. |
| [RadioGroup.ts](./src/RadioGroup.ts) | Moderate | `Shift` modifier not ignored on arrow keys (`:574-576`); `indicator` lacks `aria-hidden="true"` (`:601-609`); per-item `readOnly` has no ARIA cue (`:562-569`); `field.member` ordering footgun for `aria-invalid` (`:567`); `<input type="hidden">` skips native `required`. |
| [ScrollArea.ts](./src/ScrollArea.ts) | Solid | `tabindex="0"` on overflowing `viewport` and `aria-hidden="true"` on custom scrollbars. Minor: `tabindex="-1"` when non-overflowing (`:1082`); no JSDoc guidance to name primary scrollable panes. |
| [Select.ts](./src/Select.ts) | High | Modal `Select` never calls `hideOthers()` (`:1043-1048`); no touch-SR dismiss button; forward `Tab` escapes modal popup (`:1760`); unnamed `listbox` (`:1742-1783`); missing `PageUp`/`PageDown` (`:1428-1451`). |
| [Separator.ts](./src/Separator.ts) | Minor | Cannot override `role="separator"` to `"none"`/`"presentation"` for decorative dividers (`:96-99, 116`); restricted to `<div>`. |
| [Slider.ts](./src/Slider.ts) | High | No RTL (`DirectionProvider` unused); `minStepsBetweenValues` gets stuck on `PageUp`/`Shift+Arrow` (`:489-532`); `onKeyDown` hijacks `Alt`/`Ctrl`/`Meta` arrows (`:953-961`); vertical `writing-mode:vertical-lr` direction mismatch (`:978`); hardcoded English `aria-valuetext`. |
| [Switch.ts](./src/Switch.ts) | Moderate | `thumb` lacks `aria-hidden="true"` (`:278`); `<input type="hidden">` skips native `required` validation; no `form` prop. |
| [Tabs.ts](./src/Tabs.ts) | Moderate | `panel` overwrites consumer `aria-labelledby` (`:1002`); `Space` key-repeat fires repeated clicks (`:516-518`); `Shift` modifier not ignored on arrow/Home/End (`:969-970`). |
| [Toast.ts](./src/Toast.ts) | High | `aria-hidden="true"` on focusable high-priority roots (`:908`) and collapsed `close` buttons (`:983-985`); `:focus-visible` gating breaks timer pause and stack expansion (`:483`); `F6` then `Escape` does nothing; exiting toasts not `inert` (`:909`); default label lacks `(F6)` (`:875`). |
| [Toggle.ts](./src/Toggle.ts) | Solid | Clean native `<button>` + `aria-pressed`. No issues found. |
| [ToggleGroup.ts](./src/ToggleGroup.ts) | Solid | Roving `tabindex`, RTL, `loopFocus`, Toolbar delegation all work. Minor: initial tab stop does not prefer pressed item (`:282-290`). |
| [Toolbar.ts](./src/Toolbar.ts) | Minor | `reachable()` skips links in a disabled toolbar with `focusableWhenDisabled: false` (`:325-326`); forward input arrow skips updating `model.active` (`:466-473`). |
| [Tooltip.ts](./src/Tooltip.ts) | Moderate | No `role="tooltip"`/`aria-describedby` (matches Base UI, but blocks descriptive tooltips); no safe-area triangle for diagonal hover (`:771-776`); no `:focus-visible` check (`:658-666`); `<button>`-only trigger (`:744`). |
| [VirtualKeyboard.ts](./src/VirtualKeyboard.ts) | Moderate | Disables tracking when pinch-zoomed (`scale !== 1`, `:218`), hurting low-vision mobile users (WCAG 1.4.4 / 2.4.11). |
| [VirtualList.ts](./src/VirtualList.ts) | High | `viewport` not focusable (`:1716`); `<div role="row">` gets `aria-posinset`/`aria-setsize` instead of `aria-rowindex` (`:1648`); focused item deletion drops focus to `document.body` (`:804`). |
