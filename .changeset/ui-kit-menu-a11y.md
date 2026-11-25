---
"@effect/ui-kit": patch
---

Menu, ContextMenu and Menubar accessibility fixes. A modal menu now sets `aria-hidden` on the page outside it. A disabled submenu trigger no longer opens its submenu. A trigger adds the menu's `id`, or the `list` part's when the menu is filtered, to its own `aria-controls`. `MenuTrigger` opens with ArrowDown/ArrowUp and takes a new `filtered` prop. A context menu trigger is focusable and opens with the Menu key or Shift+F10. Separators take the orientation perpendicular to their menu. Until a menubar has found its triggers, as in server-rendered HTML, its root is its only Tab stop.
