export const styles = `
:root {
  --bg: #ffffff; --ink: #1f1f23; --muted: #63636b; --faint: #85858d; --line: #ececef; --sel: #f3f3f5;
  --bad: #c0392b; --open: #9a6208; --focus: #4b6bfb;
  --sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c1c1f; --ink: #ededef; --muted: #a1a1aa; --faint: #7a7a83; --line: #2b2b30; --sel: #27272b;
    --bad: #f2766b; --open: #e0b04f; --focus: #8ea2ff;
  }
}
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; text-align: inherit; }
button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; border-radius: 4px; }
h2, h3, h4, p, ol, ul { margin: 0; padding: 0; font-size: inherit; font-weight: inherit; }
ol, ul { list-style: none; }
html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
#root { width: max-content; }
.overlay { font: 13px/20px var(--sans); color: var(--ink); -webkit-font-smoothing: antialiased; }
.muted { color: var(--muted); }
.tone-bad { color: var(--bad); }
.tone-open { color: var(--open); }
.launcher { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--bg); font-weight: 500; }
.launcher-count { color: var(--muted); font-variant-numeric: tabular-nums; }
.panel { position: relative; width: min(var(--panel-w, 920px), calc(var(--vw, 100vw) - 24px)); height: min(var(--panel-h, 560px), calc(var(--vh, 100vh) - 24px)); display: grid; grid-template-rows: 44px minmax(0, 1fr); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--bg); }
.panel.empty { grid-template-rows: 44px 1fr; }
.empty-note { padding: 20px; color: var(--muted); }
.grip { position: absolute; width: 16px; height: 16px; z-index: 1; cursor: nwse-resize; touch-action: none; }
.grip::before { content: ""; position: absolute; inset: 4px; border: 0 solid var(--faint); border-radius: 2px; }
[data-position=BottomRight] .grip { top: 0; left: 0; }
[data-position=BottomRight] .grip::before { border-top-width: 1.5px; border-left-width: 1.5px; }
[data-position=BottomLeft] .grip { top: 0; right: 0; cursor: nesw-resize; }
[data-position=BottomLeft] .grip::before { border-top-width: 1.5px; border-right-width: 1.5px; }
[data-position=TopRight] .grip { bottom: 0; left: 0; cursor: nesw-resize; }
[data-position=TopRight] .grip::before { border-bottom-width: 1.5px; border-left-width: 1.5px; }
[data-position=TopLeft] .grip { bottom: 0; right: 0; }
[data-position=TopLeft] .grip::before { border-bottom-width: 1.5px; border-right-width: 1.5px; }
.bar { display: flex; align-items: center; gap: 12px; padding: 0 12px 0 20px; border-bottom: 1px solid var(--line); min-width: 0; }
.title { font-weight: 600; white-space: nowrap; }
.app { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.spacer { flex: 1; }
.count { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.follow { padding: 3px 10px; border-radius: 6px; color: var(--muted); white-space: nowrap; }
.follow:hover { background: var(--sel); color: var(--ink); }
.follow.on { background: var(--sel); color: var(--ink); }
.close { width: 28px; height: 28px; border-radius: 6px; color: var(--muted); text-align: center; }
.close:hover { background: var(--sel); color: var(--ink); }
.body { display: grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); min-height: 0; }
.left { border-right: 1px solid var(--line); display: grid; grid-template-rows: auto auto minmax(0, 1fr); min-height: 0; }
.instances { padding: 12px 0 8px; max-height: calc(var(--vh, 100vh) * .25); overflow: auto; }
.heading { font-size: 12px; color: var(--muted); padding: 0 20px 4px; }
.irow { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; width: 100%; padding: 2px 20px; align-items: baseline; }
.irow:hover, .irow.on { background: var(--sel); }
.irow.owner .iname { font-weight: 600; }
.iname { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status { color: var(--muted); white-space: nowrap; font-size: 12px; }
.filters { display: flex; gap: 18px; padding: 0 20px; border-bottom: 1px solid var(--line); }
.filter { padding: 8px 0 7px; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.filter:hover { color: var(--ink); }
.filter.on { color: var(--ink); border-bottom-color: var(--ink); }
.timeline { overflow: auto; min-height: 0; }
.row { display: grid; grid-template-columns: 14px minmax(0, 1fr); height: 28px; white-space: nowrap; }
.row-button { display: grid; grid-template-columns: 30px 18px minmax(0, 1fr) auto; align-items: center; padding: 0 20px 0 0; height: 28px; }
.row:hover, .row.selected { background: var(--sel); }
.row .seq { color: var(--faint); font-size: 12px; text-align: right; padding-right: 2px; font-variant-numeric: tabular-nums; }
.row.linked .seq { color: var(--ink); }
.row .mark { font-size: 12px; text-align: center; }
.row .label { overflow: hidden; text-overflow: ellipsis; }
.row .verb { color: var(--muted); }
.row .verb.tone-bad { color: var(--bad); }
.row .verb.tone-open { color: var(--open); }
.row.selected .label { font-weight: 600; }
.row .who { color: var(--faint); font-size: 12px; padding-left: 12px; }
.rail { position: relative; }
.rail.top::before, .rail.mid::before, .rail.bot::before { content: ""; position: absolute; left: 8px; width: 2px; background: var(--ink); }
.rail.top::before { top: 6px; bottom: 0; }
.rail.mid::before { top: 0; bottom: 0; }
.rail.bot::before { top: 0; bottom: 6px; }
.hidden-note { margin: 0; padding: 8px 20px 12px 62px; color: var(--faint); }
.hidden-note button { color: var(--muted); text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 3px; }
.right { overflow: auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.ehead { padding: 16px 24px 4px; }
.headline { font-size: 17px; line-height: 24px; font-weight: 600; overflow-wrap: anywhere; }
.sub { color: var(--muted); margin-top: 2px; }
.chain { margin: 14px 0 4px; }
.step { position: relative; padding: 0 0 8px 24px; }
.step::before { content: ""; position: absolute; left: 4px; top: 14px; bottom: -6px; width: 1px; background: var(--line); }
.step:last-child::before { display: none; }
.node { position: absolute; left: 0; top: 6px; width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--faint); background: var(--bg); }
.step-this .node { background: var(--ink); border-color: var(--ink); }
.step-bad .node { background: var(--bad); border-color: var(--bad); }
.step-bad > .what { color: var(--bad); }
.step-bad .cause { color: var(--muted); }
.step-open .node { border-color: var(--open); border-style: dashed; }
.step-open > .what { color: var(--open); }
.what strong { font-weight: 600; }
.args { font: 12px/18px var(--mono); color: var(--muted); overflow-wrap: anywhere; }
.ref { color: inherit; opacity: .8; text-decoration: underline; text-decoration-color: var(--faint); text-underline-offset: 3px; font-variant-numeric: tabular-nums; }
.ref:hover { opacity: 1; text-decoration-color: currentColor; }
.ref.outside { text-decoration-style: dotted; color: var(--faint); }
.details { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 240px; flex: 1; }
.tabs { display: flex; gap: 18px; padding: 0 24px; border-bottom: 1px solid var(--line); margin-top: 8px; }
.tab { padding: 8px 0 7px; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.tab:hover { color: var(--ink); }
.tab[data-active] { color: var(--ink); border-bottom-color: var(--ink); }
.tab small { font-size: 12px; color: var(--faint); }
.pane { padding: 12px 24px 20px; min-width: 0; overflow: auto; }
.pane.model { display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; padding-bottom: 0; }
.pane h4 { margin: 14px 0 6px; }
.note { color: var(--muted); margin-bottom: 8px; }
.tree { font: 12.5px/22px var(--mono); }
.tree.scroll { overflow: auto; min-height: 0; padding-bottom: 12px; }
.tl { display: grid; grid-template-columns: minmax(80px, 150px) minmax(0, 1fr); gap: 12px; padding-right: 8px; border-left: 2px solid transparent; }
.tl .k { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl .v { overflow-wrap: anywhere; }
.tl.chg { border-left-color: var(--ink); background: var(--sel); }
.old { color: var(--faint); text-decoration-thickness: 1px; }
.new { text-decoration: none; }
.arrow { color: var(--faint); font-family: var(--sans); }
.placeholder { font: 11px var(--sans); color: var(--muted); border: 1px dashed var(--faint); border-radius: 4px; padding: 0 4px; }
.t-punct, .t-key { color: var(--muted); }
.commands { display: grid; gap: 10px; }
.raw-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.copy { padding: 3px 10px; border-radius: 6px; background: var(--sel); white-space: nowrap; }
.raw { font: 12px/18px var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
.life { width: 100%; border-collapse: collapse; table-layout: fixed; }
.life th, .life td { padding: 7px 16px 7px 0; border-bottom: 1px solid var(--line); vertical-align: top; text-align: left; font-weight: 400; }
.life th { color: var(--muted); white-space: nowrap; }
.life th { width: 104px; }
.life td:nth-child(2) { overflow-wrap: anywhere; }
.life td:nth-child(3) { width: 132px; }
.life td:nth-child(4) { width: 36%; }
.life td:last-child { padding-right: 0; }
.life tr:last-child > * { border-bottom: 0; }
`
