---
"@effect/ui-kit": patch
---

Menu, ContextMenu and Menubar accessibility fixes. A modal menu now sets `aria-hidden` on the page outside it. A disabled submenu trigger no longer opens its submenu. `aria-controls` now points at the `list` part when the menu is filtered. `MenuTrigger` opens with ArrowDown/ArrowUp. A context menu trigger is focusable and opens with the Menu key or Shift+F10. Separators take the orientation perpendicular to their menu. A server-rendered menubar has a single Tab stop. `MenuTrigger` takes a new `filtered` prop.
