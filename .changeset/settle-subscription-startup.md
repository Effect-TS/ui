---
"@effect/ui": patch
---

Give Promise-backed Subscriptions a bounded opportunity to emit during `TestHost.settle`, so assertions can see their initial updates without a manual delay. Hosts with no new scheduler tasks or pending work still settle without a macrotask wait.
