#!/usr/bin/env node
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { parseArgs } from "node:util"
import * as DevToolsServer from "../DevToolsServer.ts"

const usage =
  `Usage: effect-ui-devtools [--port <n>] [--size <n>] [--keep <n>] [--dispatch]
                          [--field <name>]...

Runs the Effect UI DevTools MCP server. Pages connect with
DevTools.layer({ server: "<url>" }), terminal apps with
DevToolsHeadless.layer({ server: "<url>" }), agents with <url>/mcp.
Open <url> in a browser to inspect the newest session.
Repeat --field to show top-level message or Command argument fields, such as
commandId, in list_entries rows and the server's viewer.`

const { values } = parseArgs({
  options: {
    port: { type: "string" },
    size: { type: "string" },
    keep: { type: "string" },
    dispatch: { type: "boolean" },
    field: { type: "string", multiple: true },
    help: { type: "boolean", short: "h" }
  }
})

const number = (name: string, value: string | undefined) => {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    process.stderr.write(
      "--" + name + " takes a whole number, got " + value + "\n\n" + usage +
        "\n"
    )
    process.exit(2)
  }
  return parsed
}

if (values.help === true) {
  process.stdout.write(usage + "\n")
} else {
  const options = {
    port: number("port", values.port),
    size: number("size", values.size),
    keep: number("keep", values.keep),
    dispatch: values.dispatch === true,
    fields: values.field
  }
  const url = DevToolsServer.url(options)
  Layer.build(DevToolsServer.layer(options)).pipe(
    Effect.andThen(
      Effect.sync(() =>
        process.stdout.write(
          "Effect UI DevTools: " + url + "\nEffect UI DevTools MCP server: " +
            url + "/mcp\n"
        )
      )
    ),
    Effect.andThen(Effect.never),
    Effect.scoped,
    NodeRuntime.runMain
  )
}
