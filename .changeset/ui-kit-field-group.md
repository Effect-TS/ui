---
"@effect/ui-kit": minor
---

`Field` can now wrap a group of controls, such as a range `Slider`'s thumbs. Draw `field.legend` as the group's name, `field.group` on the element around the controls, and `field.member` on each control: `slider.root(field.group(h.div))` and `slider.thumb({ element: h.div, index: 0, input: field.member(h.input).attr("aria-label", "Minimum") })`. The group gets `aria-labelledby` pointing at the legend and `role="group"` unless it is a `<fieldset>` or has a role. Each member points at the description and the shown error with `aria-describedby` and gets `aria-invalid`, but no id, so it keeps its own name. The field is focused while any member has focus, and touched once focus leaves the group: moving between members changes neither.
