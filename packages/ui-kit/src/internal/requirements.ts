import type * as Html from "@effect/ui/html/Html"
import type * as View from "@effect/ui/View"

export type WithRequirements<T, R2> = [R2] extends [never] ? T
  : T extends Html.Element<infer Msg, infer R, infer E, infer N, infer Tag> ? Html.Element<Msg, R | R2, E, N, Tag>
  : T extends View.ContainerBuilder<infer Msg, infer R, infer H, infer N, infer Tag> ?
    View.ContainerBuilder<Msg, R | R2, H, N, Tag>
  : T
