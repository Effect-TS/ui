/**
 * Submissions the host prevented only because it owns the form, with no
 * submit handler in the app. The browser Router still routes these.
 *
 * @internal
 */

/** @internal */
export const ownedUnhandled = new WeakSet<Event>()

// A form control named `getAttribute` shadows the method on the form itself,
// not on its prototype, which is also from the form's own window.
const attribute = (form: Element, name: string): string | null =>
  (Object.getPrototypeOf(form) as Element).getAttribute.call(form, name)

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
    attribute(form, "method") ?? "").toLowerCase()
  return method === "post" || method === "dialog" ? method : "get"
}

/** @internal */
export const isSameWindow = (
  form: Element,
  submitter: Element | null
): boolean => {
  const target = submitter?.getAttribute("formtarget") ??
    attribute(form, "target")
  return target === null || target === "" || target.toLowerCase() === "_self"
}
