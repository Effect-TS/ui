---
"@effect/ui": minor
---

Add `Query.StreamService`, a query whose entry follows a Stream: every watcher shares one open stream, each element replaces the entry's value, and the stream closes when the entry is collected.
