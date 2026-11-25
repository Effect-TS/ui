---
"@effect/ui": patch
"@effect/ui-devtools": patch
---

With `DevToolsVite.plugin`, editing a module that exports components now redraws its mounted instances in place, keeping their DOM, Model and running subscriptions. Edits that can't be applied that way, such as a Model that no longer fits its Schema, fall back to the existing reload.
