/**
 * Submissions the host prevented only because it owns the form, with no
 * submit handler in the app. The browser Router still routes these.
 *
 * @internal
 */

/** @internal */
export const ownedUnhandled = new WeakSet<Event>()

/**
 * The submission's method as the browser reads it: an invalid value counts as
 * `get`.
 *
 * @internal
 */
export const methodOf = (
  form: Element,
  submitter: Element | null
): "get" | "post" | "dialog" => {
  const method = (submitter?.getAttribute("formmethod") ??
    form.getAttribute("method") ?? "").toLowerCase()
  return method === "post" || method === "dialog" ? method : "get"
}

/** @internal */
export const isSameWindow = (
  form: Element,
  submitter: Element | null
): boolean => {
  const target = submitter?.getAttribute("formtarget") ??
    form.getAttribute("target")
  return target === null || target === "" || target.toLowerCase() === "_self"
}
