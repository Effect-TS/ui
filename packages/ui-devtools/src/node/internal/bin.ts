#!/usr/bin/env node
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { parseArgs } from "node:util"
import * as DevToolsServer from "../DevToolsServer.ts"

const usage =
  `Usage: effect-ui-devtools [--port <n>] [--host <host>] [--size <n>] [--keep <n>] [--dispatch]

Runs the Effect UI DevTools MCP server. Pages connect with
DevTools.layer({ server: "<url>" }), agents with <url>/mcp.`

const { values } = parseArgs({
  options: {
    port: { type: "string" },
    host: { type: "string" },
    size: { type: "string" },
    keep: { type: "string" },
    dispatch: { type: "boolean" },
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
    host: values.host,
    size: number("size", values.size),
    keep: number("keep", values.keep),
    dispatch: values.dispatch === true
  }
  const url = DevToolsServer.url(options)
  Layer.build(DevToolsServer.layer(options)).pipe(
    Effect.andThen(
      Effect.sync(() =>
        process.stdout.write("Effect UI DevTools MCP server: " + url + "/mcp\n")
      )
    ),
    Effect.andThen(Effect.never),
    Effect.scoped,
    NodeRuntime.runMain
  )
}
