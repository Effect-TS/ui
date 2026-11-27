import * as Renderer from "@effect/ui/Renderer"
import { boot } from "./main.ts"
import { Moves } from "./Moves.ts"

boot((container) => Renderer.mount(Moves, {}, container))
