export const styles = `
:root {
  --bg: oklch(100% 0 0); --card: oklch(98.5% 0 0); --muted: oklch(96.7% .001 286.375);
  --fg: oklch(21% .006 285.885); --fg-prose: oklch(37% .013 285.805); --fg-muted: oklch(44.2% .017 285.786);
  --fg-subtle: oklch(55.2% .016 285.938); --border: oklch(92% .004 286.32); --border-strong: oklch(87.1% .006 286.286);
  --ring: oklch(59.6% .145 163.225); --ok: oklch(50.8% .118 165.612); --bad: oklch(57.7% .245 27.325);
  --warn: oklch(55.5% .163 48.998); --bad-bg: oklch(97.1% .013 17.38); --warn-bg: oklch(96.2% .059 95.617);
  --sel: oklch(95% .052 163.051);
  --sx-fg: #24292e; --sx-kw: #b5313e; --sx-str: #032f62; --sx-com: #5b636b; --sx-fn: #6f42c1; --sx-par: #a34606;
  --sx-num: #005cc5;
  --sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: oklch(14.1% .005 285.823); --card: oklch(21% .006 285.885); --muted: oklch(27.4% .006 286.033);
    --fg: oklch(98.5% 0 0); --fg-prose: oklch(87.1% .006 286.286); --fg-muted: oklch(70.5% .015 286.067);
    --fg-subtle: oklch(55.2% .016 285.938); --border: oklch(27.4% .006 286.033); --border-strong: oklch(37% .013 285.805);
    --ring: oklch(76.5% .177 163.223); --ok: oklch(76.5% .177 163.223); --bad: oklch(70.4% .191 22.216);
    --warn: oklch(82.8% .189 84.429); --bad-bg: oklch(25.8% .092 26.042); --warn-bg: oklch(27.9% .077 45.635);
    --sel: oklch(26.2% .051 172.552);
    --sx-fg: #e1e4e8; --sx-kw: #f97583; --sx-str: #9ecbff; --sx-com: #899198; --sx-fn: #b392f0; --sx-par: #ffab70;
    --sx-num: #79b8ff;
  }
}
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; text-align: inherit; }
button:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
h2, h4, p, ol, ul { margin: 0; padding: 0; }
ol, ul { list-style: none; }
html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
#root { width: max-content; }
.overlay { font: 12px/1.35 var(--sans); color: var(--fg); -webkit-font-smoothing: antialiased; }
.launcher { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--border-strong); border-radius: 999px; background: var(--card); color: var(--fg); font-weight: 600; }
.launcher-mark { color: var(--ring); }
.launcher-count { font: 500 11px var(--mono); color: var(--fg-muted); border-left: 1px solid var(--border-strong); padding-left: 6px; }
.panel { width: min(1280px, calc(var(--vw, 100vw) - 24px)); height: min(776px, calc(var(--vh, 100vh) - 24px)); display: grid; grid-template-rows: 38px minmax(0, 1fr) 28px; border: 1px solid var(--border-strong); border-radius: 8px; overflow: hidden; background: var(--bg); }
.panel.empty { grid-template-rows: 38px 1fr; }
.panel.empty > .note { padding: 16px; }
.mono, .rows, .tree, .steps, .life-table td, .commands, .raw, .irow { font-family: var(--mono); }
.bar { display: flex; align-items: center; gap: 10px; padding: 0 12px; border-bottom: 1px solid var(--border); background: var(--card); min-width: 0; }
.title { font-weight: 600; font-size: 13px; white-space: nowrap; }
.chip { font: 11px var(--mono); padding: 1px 6px; border: 1px solid var(--border-strong); border-radius: 4px; color: var(--fg-prose); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.chip.button:hover { background: var(--muted); }
.chip.on { border-color: var(--ring); color: var(--fg); box-shadow: inset 0 0 0 1px var(--ring); }
.chip.dashed { border-style: dashed; }
.spacer { flex: 1; }
.body { display: grid; grid-template-columns: minmax(320px, 446px) minmax(0, 1fr); min-height: 0; }
.left { border-right: 1px solid var(--border); display: grid; grid-template-rows: auto auto minmax(0, 1fr); min-height: 0; }
.sect { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--fg-subtle); font-weight: 600; padding: 7px 12px 4px; display: flex; justify-content: space-between; gap: 12px; }
.sect span:last-child { text-transform: none; letter-spacing: 0; font-weight: 400; text-align: right; }
.instances { border-bottom: 1px solid var(--border); padding-bottom: 6px; max-height: calc(var(--vh, 100vh) * .30); overflow: auto; }
.irow { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; width: 100%; padding: 2px 12px; font-size: 11.5px; align-items: center; }
.irow:hover { background: var(--muted); }
.irow.on { background: var(--sel); box-shadow: inset 3px 0 0 var(--ring); }
.irow.owner { outline: 1px dashed var(--ring); outline-offset: -2px; }
.irow.owner .iname::before { content: "▸ "; color: var(--ring); }
.iname { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hash { color: var(--fg-subtle); }
.badges { font-size: 11px; color: var(--fg-muted); white-space: nowrap; }
.badge-text.tone-bad { color: var(--bad); font-weight: 500; }
.badge-text.tone-open { color: var(--warn); font-weight: 500; }
.badge-text.tone-ok { color: var(--fg-muted); }
.sep { color: var(--fg-subtle); }
.filters { display: flex; gap: 6px; padding: 6px 12px; border-bottom: 1px solid var(--border); align-items: center; }
.seg { font-size: 11px; padding: 1px 7px; border: 1px solid var(--border-strong); border-radius: 4px; color: var(--fg-muted); }
.seg.on { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.timeline { overflow: auto; min-height: 0; }
.row { position: relative; display: grid; grid-template-columns: 14px minmax(0, 1fr); height: 25px; border-bottom: 1px solid var(--border); font-size: 11.5px; white-space: nowrap; }
.row-button { display: grid; grid-template-columns: 26px 16px minmax(0, 1fr) auto 58px; gap: 4px; align-items: center; padding: 0 12px 0 0; height: 24px; }
.row:hover { background: var(--muted); }
.row .seq { color: var(--fg-subtle); text-align: right; }
.row.linked .seq { color: var(--fg); font-weight: 700; }
.row .glyph { text-align: center; color: var(--fg-muted); }
.row .label { overflow: hidden; text-overflow: ellipsis; }
.row .label i { font-style: normal; color: var(--fg-muted); }
.row.life .label { color: var(--fg-muted); font-size: 11px; }
.row .inst { color: var(--fg-muted); font-size: 10.5px; }
.row .time { text-align: right; color: var(--fg-subtle); font-size: 10.5px; }
.row.selected { background: var(--sel); box-shadow: inset 3px 0 0 var(--ring); }
.rail { position: relative; height: 24px; }
.rail.top::before, .rail.mid::before, .rail.bot::before { content: ""; position: absolute; left: 6px; width: 0; border-left: 2px solid var(--ring); }
.rail.top::before { top: 50%; bottom: -1px; }
.rail.mid::before { top: 0; bottom: -1px; }
.rail.bot::before { top: 0; bottom: 50%; }
.rail.dot::after { content: ""; position: absolute; left: 2px; top: 7px; width: 10px; height: 10px; border-radius: 50%; background: var(--ring); box-shadow: 0 0 0 2px var(--bg); }
.row.selected .rail.dot::after { box-shadow: 0 0 0 2px var(--sel); }
.cmdn { font-weight: 500; font-size: 10px; border: 1px solid var(--border-strong); border-radius: 3px; padding: 0 4px; color: var(--fg-muted); margin-left: 6px; }
.tone-ok { color: var(--ok); }
.tone-bad { color: var(--bad); font-weight: 700; }
.tone-open { color: var(--warn); }
.tone-muted { color: var(--fg-subtle); }
.right { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; min-height: 0; min-width: 0; }
.ehead { display: flex; gap: 8px; align-items: center; padding: 8px 14px; border-bottom: 1px solid var(--border); min-width: 0; }
.big { font: 700 13px var(--mono); white-space: nowrap; }
.chain { padding: 2px 14px 10px; border-bottom: 1px solid var(--border); font-size: 11px; overflow: auto; max-height: calc(var(--vh, 100vh) * .34); }
.chain .sect { padding-left: 0; padding-right: 0; }
.step { display: grid; grid-template-columns: 16px 150px minmax(0, 1fr) auto; gap: 6px; white-space: nowrap; align-items: baseline; padding: 2.5px 6px; margin: 0 -6px; border: 1px solid transparent; border-radius: 4px; }
.step-body { overflow: hidden; text-overflow: ellipsis; }
.step.indent .what { padding-left: 14px; }
.step .dot { text-align: center; color: var(--ring); font-weight: 700; }
.step .dot.tone-muted { color: var(--fg-subtle); }
.step .dot.tone-bad { color: var(--bad); }
.step .dot.tone-open { color: var(--warn); }
.step .what { color: var(--fg-muted); }
.step .meta { color: var(--fg-subtle); font-size: 10.5px; text-align: right; }
.step.this { background: var(--sel); }
.step.stop { background: var(--bad-bg); border-color: var(--bad); }
.step.stop .strong { color: var(--bad); font-weight: 700; }
.step.open { background: var(--warn-bg); border: 1px dashed var(--warn); }
.step.open .strong { color: var(--warn); font-weight: 700; }
.reason { font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
.tag-this { font: 600 9.5px var(--sans); letter-spacing: .04em; border: 1px solid var(--fg-muted); border-radius: 3px; padding: 0 4px; margin-left: 8px; color: var(--fg-prose); }
.ref { color: var(--fg); text-decoration: underline; text-decoration-color: var(--ring); text-underline-offset: 2px; font-weight: 500; }
.ref.outside { text-decoration-style: dotted; color: var(--fg-subtle); }
.note { color: var(--fg-subtle); font-style: italic; }
.details { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
.tabs { display: flex; border-bottom: 1px solid var(--border); padding: 0 8px; }
.tab { padding: 7px 10px; font-size: 12px; color: var(--fg-muted); border-bottom: 2px solid transparent; }
.tab[data-active] { color: var(--fg); font-weight: 600; border-bottom-color: var(--ring); }
.tab small { font: 10px var(--mono); color: var(--fg-subtle); }
.panes { display: grid; grid-template-columns: 1fr 1fr; min-height: 0; overflow: hidden; }
.pane.model { display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; padding-bottom: 0; }
.tree.scroll { overflow: auto; min-height: 0; margin-bottom: 0; }
.unavailable { color: var(--warn); }
.pane { padding: 6px 14px; min-width: 0; overflow: auto; }
.pane + .pane { border-left: 1px solid var(--border); }
.pane h4 { margin: 4px 0; font-size: 11px; color: var(--fg-muted); font-weight: 400; display: flex; justify-content: space-between; gap: 8px; }
.tree { font-size: 11.5px; color: var(--sx-fg); margin-bottom: 8px; }
.tl { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; padding: 1.5px 6px 1.5px 0; align-items: baseline; }
.tl .g { color: var(--fg-subtle); font-weight: 700; }
.tl.chg { background: var(--muted); box-shadow: inset 2px 0 0 var(--fg); }
.tl.chg .g { color: var(--fg); }
.tl .v { overflow-wrap: anywhere; }
.old { text-decoration: line-through; text-decoration-thickness: 1.5px; opacity: .75; }
.new { text-decoration: none; }
.arrow { color: var(--fg); font-weight: 700; }
.badge { font: 600 9.5px var(--sans); letter-spacing: .04em; text-transform: uppercase; border: 1px solid var(--fg-muted); border-radius: 3px; padding: 0 4px; color: var(--fg-prose); }
.placeholder { font: 10.5px var(--mono); border: 1px dashed var(--fg-subtle); border-radius: 3px; padding: 0 3px; color: var(--fg-muted); font-style: normal; }
.t-key { color: var(--sx-fn); } .t-str { color: var(--sx-str); } .t-num { color: var(--sx-num); } .t-kw { color: var(--sx-kw); }
.t-punct { color: var(--sx-com); } .t-msg { color: var(--sx-par); } .t-tag { color: var(--fg); }
.commands { font-size: 11.5px; display: grid; gap: 4px; }
.raw { font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--sx-fg); margin: 0; }
.lifecycle { border-top: 1px solid var(--border); padding: 0 14px 8px; max-height: calc(var(--vh, 100vh) * .32); overflow: auto; }
.lifecycle .sect { padding-left: 0; padding-right: 0; }
.life-table { border-collapse: collapse; width: 100%; font-size: 11.5px; }
.life-table th { vertical-align: top; text-align: left; font: 400 12px var(--sans); color: var(--fg-muted); padding: 2px 12px 2px 0; white-space: nowrap; }
.life-table td { padding: 2px 12px 2px 0; white-space: nowrap; vertical-align: top; }
.life-table td:last-child { white-space: normal; padding-right: 0; }
.legend { display: flex; gap: 14px; align-items: center; padding: 0 12px; border-top: 1px solid var(--border); background: var(--card); color: var(--fg-muted); font-size: 11.5px; white-space: nowrap; overflow: hidden; }
@media (prefers-reduced-motion: no-preference) { .row, .irow, .seg { transition: background-color 80ms; } }
`
