import { Feature } from "@effect/ui"
import { Schema } from "effect"

export class Panel extends Feature.Service<Panel>()("Panel", { props: Schema.Struct({}) }) {}
