---
"@effect/ui-devtools": minor
---

Add an MCP server for agents, in `@effect/ui-devtools/node`. `DevToolsVite.plugin` starts it with `vite dev` on a fixed loopback port (4774 by default) and, once it is listening, tells the page where it is; `DevToolsServer.layer` and the `effect-ui-devtools` bin run it without Vite. Pages built with `DevTools.layer` send it their log as Wire frames and take its requests, and any process can send frames with `MessageLog.socket`, so server renders appear as sessions too.

It has 13 tools. The read tools (`list_sessions`, `list_instances`, `list_entries`, `count_entries`, `get_entry`, `get_chain`, `get_state`, `diff_state`) answer from the server's own copy of the log, so they keep working after a reload, and `get_state` keeps the state of instances whose entries the ring dropped. `show_entry` and `resume` share one pause with Time travel, so the overlay shows an agent's pause and either can resume it. `get_message_schema` and `dispatch` send messages to an instance by number, decoded with its message Schema, and `dispatch` returns the seq of each `Update`, or `Unknown` when the page doesn't answer in time and the message may still apply, and lists the messages it didn't send when a batch runs out of time. It is off unless the server is started with `dispatch: true` or `--dispatch`. `wait` waits for the Command runs started since an entry to end.

`DevTools.layer` takes a `server` URL, and its paint and resume are serialised across the overlay and the server.
