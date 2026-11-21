---
"@effect/ui": patch
---

Support state Schemas that encode or decode asynchronously, such as a Model holding a `Schema.File`. The server waits for them before it ships the page state, and hydration and history restore hold the instance until its state is decoded. History writes the entry without waiting: a state that encodes asynchronously joins the in-memory snapshot when it's done, so back and forward restore it, and after a reload the component starts from `init`, with a warning logged once. A Model that doesn't encode now logs a warning once per component with the Schema issue, and the server defers it as before.
