---
"@effect/ui-kit": patch
---

`Field`'s error is now an alert, so screen readers announce it, and `Form` focuses invalid controls that join it with a `form` attribute. Checkbox, Switch and RadioGroup indicators are `aria-hidden`, a `CheckboxGroup` member keeps the id `field.control` gave it (or shares one through `Field`'s new `id` prop), and `Separator` keeps a decorative `role="none"` or `role="presentation"`.
