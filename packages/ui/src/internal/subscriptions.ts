/**
 * What the runtime and a test's engine both say about a `subscriptions`
 * result.
 *
 * @internal
 */

/**
 * The error for the instance at `path` whose `subscriptions` returned two
 * entries with `key`. A key runs one Stream, so the second would never start.
 *
 * @internal
 */
export const duplicateKey = (path: string, key: string): Error =>
  new Error(
    `${path}: two Subscriptions share the key ${key}. A key runs one Stream, so give each its own name or deps.`
  )
