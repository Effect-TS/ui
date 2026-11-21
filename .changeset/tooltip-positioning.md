---
"@effect/ui-kit": minor
---

`Tooltip` places its popup itself instead of with CSS anchor positioning, so it works in browsers that have popovers but not anchors.

- The popup flips to the opposite side and shifts along the edge to stay `collisionPadding` (5px by default) inside the viewport. Before, it only flipped.
- `data-side` and `data-align` report where the popup is, which can differ from the props after a flip. `side` also takes `"inline-start"` and `"inline-end"`.
- New props, with Base UI's names and defaults: `alignOffset`, `collisionAvoidance`, `collisionBoundary`, `collisionPadding`, `sticky`, `arrowPadding`, `positionMethod`, `disableAnchorTracking` and `anchor`.
- The positioner gets `data-anchor-hidden` and the CSS variables `--anchor-width`, `--anchor-height`, `--available-width`, `--available-height` and `--transform-origin`. The arrow gets `data-uncentered`.
- The tooltip places the arrow, with `position: absolute` and a `left` or `top`. Drop any CSS that positioned it along the popup's edge.
- The trigger no longer gets an `anchor-name`, and the positioner no longer gets `position-anchor` or `position-area`.
