/**
 * Submissions the host prevented only because it owns the form, with no
 * submit handler in the app. The browser Router still routes these.
 *
 * @internal
 */

/** @internal */
export const ownedUnhandled = new WeakSet<Event>()

/**
 * A form's attribute. A control named `getAttribute` shadows the method on the
 * form itself, not on its prototype, which is also from the form's own window.
 *
 * @internal
 */
export const attribute = (form: Element, name: string): string | null =>
  (Object.getPrototypeOf(form) as Element).getAttribute.call(form, name)

/**
 * Where an unhandled submission goes: `"dialog"` for the `dialog` method, `"get"`
 * for a same-window GET the Router can follow, and `"native"` for a POST or a
 * submission to another window. An invalid method counts as `get`, as in the
 * browser.
 *
 * @internal
 */
export const kindOf = (
  form: Element,
  submitter: Element | null
): "dialog" | "get" | "native" => {
  const method = (submitter?.getAttribute("formmethod") ??
    attribute(form, "method") ?? "").toLowerCase()
  if (method === "dialog") return method
  if (method === "post") return "native"
  const target = submitter?.getAttribute("formtarget") ??
    attribute(form, "target")
  return target === null || target === "" || target.toLowerCase() === "_self"
    ? "get"
    : "native"
}
