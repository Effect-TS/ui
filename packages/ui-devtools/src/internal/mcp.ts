import * as McpProtocol from "effect/ai/McpProtocol"
import * as McpServer from "effect/ai/McpServer"
import * as Layer from "effect/Layer"
import * as Tools from "./tools.ts"

export const layer = (backend: Tools.Backend) =>
  McpServer.layerHttp({
    name: "effect-ui-devtools",
    version: "0.1.0",
    instructions: Tools.instructions,
    path: "/mcp",
    protocols: [
      McpProtocol.v2025_11_25,
      McpProtocol.v2025_06_18,
      McpProtocol.v2025_03_26
    ],
    registrations: McpServer.toolkit(Tools.Tools).pipe(
      Layer.provide(Tools.handlers(backend))
    )
  }).pipe(Layer.orDie)
