/**
 * Unstyled components for `@effect/ui`.
 *
 * Each component is exported by its own name, so
 * `import { Switch } from "@effect/ui-kit"` is the component itself, called
 * as `Switch(h, { ... })`. Its module, such as `@effect/ui-kit/Switch`,
 * holds the same exports.
 *
 * @stability experimental
 * @since 0.1.0
 */

// Not a generated barrel: `pnpm codegen` would export each module as a
// namespace, and a namespace can't be called. Add each new module here with
// `export *`, in alphabetical order. Its exports carry the component's name,
// such as `SwitchProps`, so they never collide.

/**
 * @stability experimental
 * @since 0.1.0
 */
export * from "./Avatar.ts"

/**
 * @stability experimental
 * @since 0.1.0
 */
export * from "./Button.ts"

/**
 * @stability experimental
 * @since 0.1.0
 */
export * from "./Checkbox.ts"

/**
 * @stability experimental
 * @since 0.1.0
 */
export * from "./Field.ts"

/**
 * @stability experimental
 * @since 0.1.0
 */
export * from "./Input.ts"

/**
 * @stability experimental
 * @since 0.1.0
 */
export * from "./Switch.ts"

/**
 * @stability experimental
 * @since 0.1.0
 */
export * from "./Tooltip.ts"
