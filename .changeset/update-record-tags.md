---
"@effect/ui": patch
---

A record passed to `update` now rejects keys that aren't tags of the component's message, including keys from spreads or variables. Handlers under those keys never ran. Delete the stale handler, or pick only the fields the component handles from a shared record (for example, `update: { Saved: shared.Saved }`).
