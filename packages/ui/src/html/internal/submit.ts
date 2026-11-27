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
 * Read the submitter's `formmethod` or the form's `method` in lowercase.
 * Callers treat values other than `post` and `dialog` as GET.
 *
 * @internal
 */
export const methodOf = (form: Element, submitter: Element | null): string =>
  (submitter?.getAttribute("formmethod") ?? attribute(form, "method") ?? "")
    .toLowerCase()
