---
"@effect/ui-kit": minor
---

`Field` can now wrap a group of controls, such as a range `Slider`'s thumbs. Draw `f.legend` as the group's name, `f.group` on the element around the controls, and `f.member` on each control: `s.root(f.group(h.div))` and `s.thumb({ element: h.div, index: 0, input: f.member(h.input).attr("aria-label", "Minimum") })`. The group gets `aria-labelledby` pointing at the legend and `role="group"` unless it is a `<fieldset>` or has a role. Each member points at the description and the shown error with `aria-describedby` and gets `aria-invalid`, but no id, so it keeps its own name. The field is focused while any member has focus, and touched once focus leaves the group: moving between members changes neither.
