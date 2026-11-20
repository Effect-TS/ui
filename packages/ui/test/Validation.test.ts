import { Command, Component, Query, UiSchema, Validation } from "@effect/ui"
import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"

const Rule = Validation.Rule

describe("Validation", () => {
  const Signup = Validation.make({
    email: { required: "Email is required", rules: [Rule.email()] },
    password: {
      required: "Password is required",
      rules: [Rule.minLength(8), [(password) => /\d/.test(password), "Include a number"]]
    },
    confirm: {
      required: "Confirm your password",
      rules: [[(confirm, values) => confirm === values.password, "Passwords must match"]]
    },
    account: { value: Schema.Literals(["Personal", "Business"]) },
    company: { required: (values) => values.account === "Business" && "Required for business accounts" },
    birthday: {
      value: Schema.NullOr(Schema.String),
      isEmpty: (birthday) => birthday === null,
      // A rule never sees an empty value, but its type still includes one.
      rules: [[
        (birthday) => birthday !== null && /^\d{4}-\d{2}-\d{2}$/.test(birthday),
        (birthday) => `${birthday} isn't a date`
      ]]
    }
  })
  const empty = Signup.init({ email: "", password: "", confirm: "", account: "Personal", company: "", birthday: null })

  it("derives each field from its value, its rules and the other values", () => {
    const state = Signup.submit({
      ...empty,
      values: {
        email: "ada@x",
        password: "short",
        confirm: "short",
        account: "Business",
        company: "",
        birthday: "soon"
      }
    })
    const { fields, value, invalid } = Signup.validate(state)
    assert.deepStrictEqual(fields, {
      email: { _tag: "Invalid", value: "ada@x", required: true, errors: ["Invalid email address"] },
      password: { _tag: "Invalid", value: "short", required: true, errors: ["Must be at least 8 characters"] },
      // A rule over two fields runs whether or not the other field passes.
      confirm: { _tag: "Valid", value: "short", required: true },
      account: { _tag: "Valid", value: "Business", required: false },
      company: { _tag: "Invalid", value: "", required: true, errors: ["Required for business accounts"] },
      birthday: { _tag: "Invalid", value: "soon", required: false, errors: ["soon isn't a date"] }
    })
    assert.isTrue(invalid)
    assert.isTrue(Option.isNone(value))

    const changed = Signup.change(Signup.change(state, "password", "longenough"), "account", "Personal")
    const { company, confirm, password } = Signup.validate(changed).fields
    assert.deepStrictEqual(password, {
      _tag: "Invalid",
      value: "longenough",
      required: true,
      errors: ["Include a number"]
    })
    assert.deepStrictEqual(confirm, {
      _tag: "Invalid",
      value: "short",
      required: true,
      errors: ["Passwords must match"]
    })
    // Optional and empty: acceptable, and nothing to show.
    assert.deepStrictEqual(company, { _tag: "NotValidated", value: "", required: false })
    assert.deepStrictEqual(Signup.validate(Signup.change(changed, "birthday", null)).fields.birthday, {
      _tag: "NotValidated",
      value: null,
      required: false
    })

    const All = Validation.make({ password: { rules: [Rule.minLength(8), Rule.includes("1")] } }, { errors: "all" })
    const all = All.submit(All.init({ password: "abc" }))
    assert.deepStrictEqual(All.validate(all).fields.password, {
      _tag: "Invalid",
      value: "abc",
      required: false,
      errors: ["Must be at least 8 characters", "Must contain 1"]
    })
  })

  it("shows a field by its mode, and every field after a submit", () => {
    const shown = (mode: Validation.Mode) => {
      const Form = Validation.make({ a: { required: "A" }, b: { required: "B" }, c: { required: "C" } }, { mode })
      const state = Form.blur(Form.change(Form.init({ a: "", b: "", c: "" }), "a", ""), "b")
      const tags = (s: typeof state) => Object.values(Form.validate(s).fields).map((field) => field._tag)
      return [tags(state), tags(Form.submit(state))]
    }
    const all = ["Invalid", "Invalid", "Invalid"]
    assert.deepStrictEqual(shown("onChange"), [["Invalid", "NotValidated", "NotValidated"], all])
    assert.deepStrictEqual(shown("onBlur"), [["NotValidated", "Invalid", "NotValidated"], all])
    assert.deepStrictEqual(shown("onSubmit"), [["NotValidated", "NotValidated", "NotValidated"], all])
  })

  it("shows a server error at once and holds the value back until its field changes", () => {
    const Login = Validation.make({ email: { required: "Email is required" }, password: {} })
    const filled = Login.init({ email: "ada@example.com", password: "secret" })
    const rejected = Login.reject({ password: ["Invalid credentials"] })(filled)
    assert.deepStrictEqual(Login.validate(rejected), {
      fields: {
        email: { _tag: "NotValidated", value: "ada@example.com", required: true },
        password: { _tag: "Invalid", value: "secret", required: false, errors: ["Invalid credentials"] }
      },
      value: Option.none(),
      invalid: true,
      validating: false
    })
    assert.deepStrictEqual(Login.validate(Login.change("email", "ada@example.org")(rejected)).invalid, true)
    assert.deepStrictEqual(
      Login.validate(Login.change("password", "secret2")(rejected)).value,
      Option.some({
        email: "ada@example.com",
        password: "secret2"
      })
    )
    assert.deepStrictEqual(Login.reject(rejected, { password: [] }).rejected, {})
  })

  it("reads a check once its field passes, and holds the value back until it answers", () => {
    const Account = Validation.make({ username: { required: "Pick a username", rules: [Rule.minLength(3)] } }, {
      mode: "onChange"
    })
    const at = (username: string) => Account.change(Account.init({ username: "" }), "username", username)
    const derive = (username: string, check: AsyncResult.AsyncResult<ReadonlyArray<string>, never>) => {
      const { fields, value, validating } = Account.validate(at(username), { username: check })
      return [fields.username._tag, Option.isSome(value), validating]
    }
    assert.isFalse(Account.passes(at("ab"), "username"))
    assert.isTrue(Account.passes(at("ada"), "username"))
    // The rules fail first, so the check isn't read.
    assert.deepStrictEqual(derive("ab", AsyncResult.initial(true)), ["Invalid", false, false])
    assert.deepStrictEqual(derive("ada", AsyncResult.initial(true)), ["Validating", false, true])
    assert.deepStrictEqual(derive("ada", AsyncResult.success([], { waiting: true })), ["Validating", false, true])
    assert.deepStrictEqual(derive("ada", AsyncResult.failure(Cause.die("down"))), ["Validating", false, true])
    assert.deepStrictEqual(derive("ada", AsyncResult.success(["Taken"])), ["Invalid", false, false])
    assert.deepStrictEqual(derive("ada", AsyncResult.success([])), ["Valid", true, false])
  })

  it("keeps its State as JSON", () => {
    const state = Signup.reject(Signup.blur(Signup.change(empty, "email", "ada@x"), "email"), { email: ["Taken"] })
    const json = JSON.parse(JSON.stringify(Schema.encodeSync(Signup.State)(state)))
    assert.deepStrictEqual(Schema.decodeUnknownSync(Signup.State)(json), state)
  })

  describe("in a component", () => {
    class IsUsernameTaken extends Query.Service<IsUsernameTaken>()(
      "accounts/IsUsernameTaken",
      { args: { username: Schema.String }, success: Schema.Boolean, error: Schema.Never, staleTime: "30 seconds" },
      Effect.succeed(({ username }: { readonly username: string }) => Effect.succeed(username === "ada"))
    ) {}
    class CreateAccount extends Command.Service<CreateAccount>()(
      "accounts/CreateAccount",
      { args: { username: Schema.String } },
      Effect.succeed(() => Effect.succeed(Message.CreatedAccount()))
    ) {}
    const Account = Validation.make({ username: { required: "Pick a username", rules: [Rule.minLength(3)] } }, {
      mode: "onChange"
    })
    const Message = UiSchema.TaggedEnum({
      UpdatedUsername: { value: Schema.String },
      ClickedSubmit: {},
      CreatedAccount: {}
    })
    const taken = (result: AsyncResult.AsyncResult<boolean>) =>
      AsyncResult.map(result, (taken) => taken ? ["That username is taken"] : [])
    const SignupPage = Component.define({
      name: "SignupPage",
      model: Schema.Struct({ form: Account.State }),
      message: Message,
      queries: {
        taken: {
          query: IsUsernameTaken,
          debounce: "300 millis",
          args: (model) => Account.passes(model.form, "username") ? { username: model.form.values.username } : undefined
        }
      }
    }).make({
      init: () => ({ form: Account.init({ username: "" }) }),
      update: {
        UpdatedUsername: (model, { value }) => ({ form: Account.change(model.form, "username", value) }),
        ClickedSubmit: (model, _message, $) => {
          const form = Account.submit(model.form)
          return Option.match(Account.validate(form, { username: taken($.queries.taken) }).value, {
            onNone: () => ({ form }),
            onSome: ({ username }) => $.set({ form }).run(CreateAccount.make({ username }))
          })
        },
        CreatedAccount: (model) => model
      },
      view: (model, h) => h.el("p", model.form.values.username)
    })

    it.effect("drops a stale answer and submits once the check passes", () =>
      Effect.gen(function*() {
        const s = yield* Story.make(SignupPage, {})
        const username = () => Account.validate(s.model.form, { username: taken(s.queries.taken) }).fields.username
        s.send(Message.UpdatedUsername({ value: "ada" }))
        assert.strictEqual(username()._tag, "Validating")
        s.loaded("taken", true)
        assert.deepStrictEqual(username(), {
          _tag: "Invalid",
          value: "ada",
          required: true,
          errors: ["That username is taken"]
        })
        // The answer for "ada" isn't shown for "grace".
        s.send(Message.UpdatedUsername({ value: "grace" }))
        assert.strictEqual(username()._tag, "Validating")
        // A submit while the check is out issues nothing.
        s.keepPending("taken").send(Message.ClickedSubmit())
        s.loaded("taken", false)
        assert.strictEqual(username()._tag, "Valid")
        s.send(Message.ClickedSubmit())
          .expectExact(CreateAccount.make({ username: "grace" }))
          .resolve(CreateAccount, Message.CreatedAccount())
      }))
  })
})
