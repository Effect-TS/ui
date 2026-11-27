/**
 * Shared form-submission rules for the host and browser Router.
 *
 * @internal
 */

/**
 * Read an attribute through the form's own-window prototype, bypassing controls
 * named `getAttribute` that shadow the method on the form.
 *
 * @internal
 */
export const attribute = (form: Element, name: string): string | null =>
  (Object.getPrototypeOf(form) as Element).getAttribute.call(form, name)

/**
 * How a submission is made: `"dialog"` for the `dialog` method, which the
 * host cancels, `"get"` for a same-window GET the Router can follow, and
 * `"native"` for POST or GET targeting another window. An invalid method
 * counts as `get`, as in the browser.
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
