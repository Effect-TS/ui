import { Component, Head, UiSchema } from "@effect/ui"
import { Html, HtmlHead, HtmlServer } from "@effect/ui/html"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const node = (
  entries: ReadonlyArray<HtmlHead.Entry>,
  ...children: ReadonlyArray<Head.Tree<HtmlHead.Entry, HtmlHead.HtmlHead>>
): Head.Tree<HtmlHead.Entry, HtmlHead.HtmlHead> => ({ entries, children })

describe("HtmlHead", () => {
  it("lets the later entry win per identity, in document order", () => {
    const head = HtmlHead.merge(node(
      [
        HtmlHead.meta({ name: "description", content: "root" }),
        HtmlHead.link({ rel: "canonical", href: "/a" }),
        HtmlHead.lang("en")
      ],
      node([HtmlHead.meta({ name: "description", content: "first" }), HtmlHead.link({ rel: "canonical", href: "/b" })]),
      node([
        HtmlHead.meta({ name: "description", content: "second" }),
        HtmlHead.meta({ property: "og:title", content: "Ada" }),
        HtmlHead.link({ rel: "alternate", href: "/fr", hreflang: "fr" }),
        HtmlHead.link({ rel: "alternate", href: "/de", hreflang: "de" }),
        HtmlHead.lang("fr")
      ])
    ))
    assert.deepStrictEqual(head.meta.map((meta) => meta.content), ["second", "Ada"])
    assert.deepStrictEqual(head.links.map((link) => link.attributes.href), ["/b", "/fr", "/de"])
    assert.strictEqual(head.html.lang, "fr")
  })

  it("unions class tokens in order of first contribution and keeps one data attribute per name", () => {
    const head = HtmlHead.merge(node(
      [HtmlHead.htmlClass("h-full  dark"), HtmlHead.bodyClass(["a b"]), HtmlHead.htmlData("data-theme", "light")],
      node([
        HtmlHead.htmlClass(["dark", "x"]),
        HtmlHead.htmlData("data-theme", "dark"),
        HtmlHead.bodyData("data-page", "")
      ])
    ))
    assert.deepStrictEqual(head.html.class, ["h-full", "dark", "x"])
    assert.deepStrictEqual(head.body.class, ["a", "b"])
    assert.deepStrictEqual(head.html.data, { "data-theme": "dark" })
    assert.deepStrictEqual(head.body.data, { "data-page": "" })
  })

  it("lets later data aliases win within a node and across descendants", () => {
    const head = HtmlHead.merge(node(
      [
        HtmlHead.htmlData("data-THEME", "first"),
        HtmlHead.htmlData("data-theme", "middle"),
        HtmlHead.htmlData("data-THEME", "last"),
        HtmlHead.bodyData("data-PAGE", "first"),
        HtmlHead.bodyData("data-page", "middle")
      ],
      node([HtmlHead.bodyData("data-PAGE", "last")])
    ))
    assert.deepStrictEqual(head.html.data, { "data-theme": "last" })
    assert.deepStrictEqual(head.body.data, { "data-page": "last" })
  })

  it("rejects the marker as a data name", () => {
    assert.throws(() => HtmlHead.htmlData("data-eui" as any, "x"), /marker/)
  })

  it("serialises JSON-LD canonically and escapes <", () => {
    const a = HtmlHead.jsonLd({ b: 1, a: { d: [1, "x"], c: "</script>" }, z: undefined })
    const b = HtmlHead.jsonLd({ a: { c: "</script>", d: [1, "x"] }, b: 1 })
    assert.strictEqual(a.json, "{\"a\":{\"c\":\"\\u003c/script>\",\"d\":[1,\"x\"]},\"b\":1}")
    assert.strictEqual(a.json, b.json)
    const head = HtmlHead.merge(
      node([a], node([b]), node([HtmlHead.jsonLd({ b: 2 }, { key: "k" }), HtmlHead.jsonLd({ b: 3 }, { key: "k" })]))
    )
    assert.deepStrictEqual(head.jsonLd.map((entry) => entry.json), [a.json, "{\"b\":3}"])
  })

  it("reports what JSON can't hold, with its path", () => {
    assert.throws(() => HtmlHead.jsonLd({ a: { when: new Map() } } as any), /\$\.a\.when is a Map/)
    assert.throws(() => HtmlHead.jsonLd({ list: [1, Number.NaN] }), /\$\.list\[1\] is NaN/)
    assert.throws(() => HtmlHead.jsonLd([1] as any), /not an array/)
  })

  it("reports siblings that set lang, the canonical link or the same meta tag, and keeps the later one", () => {
    const conflicts: Array<Head.Conflict> = []
    const head = HtmlHead.merge(
      {
        path: "/App",
        entries: [HtmlHead.meta({ name: "description", content: "app" })],
        children: [
          {
            path: "/App/A[a]",
            entries: [
              HtmlHead.lang("en"),
              HtmlHead.link({ rel: "canonical", href: "/a" }),
              HtmlHead.meta({ name: "description", content: "a" }),
              HtmlHead.jsonLd({ a: 1 })
            ],
            children: []
          },
          {
            path: "/App/B[b]",
            entries: [
              HtmlHead.lang("fr"),
              HtmlHead.link({ rel: "canonical", href: "/b" }),
              HtmlHead.meta({ name: "description", content: "b" }),
              HtmlHead.jsonLd({ b: 1 })
            ],
            children: []
          }
        ]
      },
      { onConflict: (conflict) => conflicts.push(conflict) }
    )
    assert.strictEqual(head.html.lang, "fr")
    assert.deepStrictEqual(head.links.map((link) => link.attributes.href), ["/b"])
    assert.deepStrictEqual(head.meta.map((meta) => meta.content), ["b"])
    // JSON-LD blocks add up: they aren't single slots.
    assert.strictEqual(head.jsonLd.length, 2)
    assert.deepStrictEqual(conflicts.map((conflict) => [conflict.slot, conflict.paths]).sort(), [
      ["lang", ["/App/A[a]", "/App/B[b]"]],
      ["link canonical", ["/App/A[a]", "/App/B[b]"]],
      ["meta name:description", ["/App/A[a]", "/App/B[b]"]]
    ])
  })

  it.effect("folds nested layouts: templates chain, a page overrides, a layout reduces, JSON-LD adds up", () =>
    Effect.gen(function*() {
      const Post = Schema.Struct({ slug: Schema.String, title: Schema.String, description: Schema.String })
      const BlogPost = Component.define({
        name: "BlogPost",
        scoped: false,
        props: Schema.Struct({ post: Post }),
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: (model) => model,
        head: (_, { post }) => [
          Head.title(post.title),
          HtmlHead.meta({ name: "description", content: post.description }),
          HtmlHead.jsonLd({ "@type": "BlogPosting", headline: post.title })
        ],
        view: (_, h) => h.article(h.props.post.title)
      })
      const Blog = Component.define({
        name: "Blog",
        scoped: false,
        props: Schema.Struct({ post: Schema.optional(Post) }),
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: (model) => model,
        head: () => [
          Head.titleTemplate((title) => `${title} | Blog`),
          Head.title("Blog"),
          HtmlHead.meta({ name: "description", content: "Posts about Foldkit" })
        ],
        view: (_, h) => {
          const post = h.props.post
          return h.section(post === undefined ? h.p("All posts") : BlogPost(h, { key: post.slug, props: { post } }))
        }
      })
      const Message = UiSchema.TaggedEnum({ Opened: { post: Post }, Closed: {} })
      const Site = Component.define({
        name: "Site",
        scoped: false,
        model: Schema.Struct({ post: Schema.optional(Post) }),
        message: Message,
        elements: Html
      }).make({
        init: () => ({}),
        update: (_, message) => message._tag === "Opened" ? { post: message.post } : {},
        head: () => [
          Head.titleTemplate((title) => `${title} | Foldkit`),
          HtmlHead.meta({ name: "description", content: "A framework" }),
          HtmlHead.jsonLd({ "@type": "WebSite", name: "Foldkit" })
        ],
        reduceHead: (_, below) => ({
          ...below,
          meta: [...below.meta, HtmlHead.meta({ property: "og:title", content: below.title ?? "Foldkit" })]
        }),
        view: (model, h) => h.main(Blog(h, { key: "blog", props: { post: model.post } }))
      })

      const root = yield* TestHost.mount(Site, {})
      yield* TestHost.settle
      const index = root.head<HtmlHead.HtmlHead>()
      assert.strictEqual(index.title, "Blog | Foldkit")
      assert.deepStrictEqual(index.meta.map((meta) => [meta.name ?? meta.property, meta.content]), [
        ["description", "Posts about Foldkit"],
        ["og:title", "Blog | Foldkit"]
      ])

      root.send(Message.Opened({ post: { slug: "hello", title: "Hello", description: "Saying hello" } }))
      yield* TestHost.settle
      const post = root.head<HtmlHead.HtmlHead>()
      assert.strictEqual(post.title, "Hello | Blog | Foldkit")
      assert.deepStrictEqual(post.meta.map((meta) => [meta.name ?? meta.property, meta.content]), [
        ["description", "Saying hello"],
        ["og:title", "Hello | Blog | Foldkit"]
      ])
      assert.deepStrictEqual(post.jsonLd.map((entry) => JSON.parse(entry.json)["@type"]), ["WebSite", "BlogPosting"])
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  const Neutral = Component.define({ name: "Neutral", scoped: false, model: Schema.Null, message: Schema.Never }).make({
    init: () => null,
    update: (model) => model,
    reduceHead: () => ({ title: "Neutral" }),
    view: (_, h) => h.text("neutral")
  })
  const Page = Component.define({
    name: "Page",
    scoped: false,
    model: Schema.Null,
    message: Schema.Never,
    elements: Html
  }).make({
    init: () => null,
    update: (model) => model,
    head: () => [HtmlHead.lang("en"), HtmlHead.meta({ name: "description", content: "Page" })],
    view: (_, h) => h.main(Neutral(h, { key: "n", props: {} }))
  })
  const Shell = Component.define({ name: "Shell", scoped: false, model: Schema.Null, message: Schema.Never }).make({
    init: () => null,
    update: (model) => model,
    head: () => [Head.title("Shell")],
    view: (_, h) => Page(h, { key: "p", props: {} })
  })

  it.effect("lets a host-neutral reducer under an Html root change the title and keep the Html fields", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      const head = root.head<HtmlHead.HtmlHead>()
      assert.strictEqual(head.title, "Neutral")
      assert.strictEqual(head.html.lang, "en")
      assert.deepStrictEqual(head.meta.map((meta) => meta.content), ["Page"])
      const shell = yield* TestHost.mount(Shell, {})
      yield* TestHost.settle
      assert.strictEqual(shell.head<HtmlHead.HtmlHead>().html.lang, "en")
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("keeps an Html child's entries under a host-neutral root", () =>
    Effect.gen(function*() {
      const rendered = yield* HtmlServer.renderToHtml(Shell, {})
      assert.include(rendered.head, "<title data-eui>Neutral</title>")
      assert.include(rendered.head, "content=\"Page\"")
      assert.include(rendered.htmlAttributes, "lang=\"en\"")
    }))
})
