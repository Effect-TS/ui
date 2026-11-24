const effectMark =
  "M32.579,704.971c10.261,-17.288 32.954,-23.125 50.689,-13.25l413.97,235.225l415.187,-234.383c17.738,-9.884 42.721,-2.905 50.692,13.25c7.537,19.758 4.008,39.483 -13.779,49.387l-431.055,240c-8.996,5.017 -19.254,5.975 -28.508,3.462c-1.138,-0.183 -2.271,-0.42 -3.4,-0.712c-3.067,-0.788 -6.083,-1.987 -8.958,-3.583l-431.042,-239.996c-17.805,-9.917 -24.08,-32.025 -13.796,-49.4Zm961.875,-410.403c0.433,13.963 -5.354,26.383 -18.525,33.721l-129.975,72.362l118.058,66.482c13.321,7.5 20.409,21.667 19.301,35.813c1.029,14.579 -4.551,27.692 -18.017,35.287l-446.267,251.284c-9.316,5.254 -19.937,6.258 -29.512,3.625c-4.392,-0.713 -8.729,-2.2 -12.804,-4.5l-446.249,-251.284c-13.322,-7.5 -20.406,-21.687 -19.294,-35.837c-1.031,-14.575 4.543,-27.667 18.009,-35.263l119.356,-67.204l-128.679,-71.65c-3.83,-2.137 -7.143,-4.791 -9.922,-7.834c-1.203,-1.155 -2.309,-2.396 -3.296,-3.723c-1.025,-1.37 -1.926,-2.816 -2.682,-4.349c-0.367,-0.96 -0.707,-1.921 -1.025,-2.881l-0.685,-1.748l-0.48,-1.403c-0.227,-0.701 -0.427,-1.413 -0.61,-2.136l-0.302,-1.295c-0.648,-2.978 -0.928,-6.043 -0.831,-9.118c-0.437,-13.963 5.352,-26.384 18.522,-33.721l456.405,-254.111c3.829,-2.136 7.875,-3.572 11.983,-4.359c6.109,-1.176 12.346,-0.907 18.204,0.69c4.488,0.734 8.925,2.234 13.092,4.554l456.392,254.11c0.683,0.378 1.346,0.777 1.996,1.198c0.612,0.389 1.212,0.788 1.795,1.198c0.538,0.389 1.067,0.788 1.58,1.198c1.654,1.306 3.175,2.73 4.558,4.251c1.075,1.036 2.063,2.126 2.962,3.281c1.163,1.489 2.171,3.086 3.009,4.78c0.366,0.961 0.7,1.91 1.016,2.871c2.08,4.953 3.088,10.316 2.917,15.711Zm-873.974,206.978l376.758,216.512l376.758,-215.112l-104.208,-59.888l-250.263,139.342c-9.533,5.308 -20.387,6.333 -30.187,3.667c-4.488,-0.734 -8.921,-2.234 -13.092,-4.555l-251.031,-139.77l-104.735,59.804Z"

const logo = "url(\"data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 996 1000'><path d='" + effectMark + "'/></svg>"
  ) + "\")"

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
.launch { display: flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; background: var(--bg); }
.launcher { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; font-weight: 500; }
.launch .paused { padding: 0 4px 0 10px; border-left: 1px solid var(--line); }
.launcher-count { color: var(--muted); font-variant-numeric: tabular-nums; }
.panel { position: relative; width: min(var(--panel-w, 920px), calc(var(--vw, 100vw) - 24px)); height: min(var(--panel-h, 560px), calc(var(--vh, 100vh) - 24px)); display: grid; grid-template-rows: 44px minmax(0, 1fr); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--bg); container: panel / inline-size; }
.panel.empty { grid-template-rows: 44px 1fr; }
.panel.pausing { grid-template-rows: 44px auto minmax(0, 1fr); }
.paused { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.paused-label { color: var(--open); font-weight: 500; font-variant-numeric: tabular-nums; }
.paused-label::before { content: ""; display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: currentColor; vertical-align: 1px; }
.resume { padding: 2px 10px; border-radius: 999px; background: var(--ink); color: var(--bg); font-weight: 500; }
.pausebar { display: grid; gap: 2px; padding: 8px 20px; border-bottom: 1px solid var(--line); background: var(--sel); }
.scrub { display: flex; align-items: center; gap: 12px; }
.scrub input { flex: 1; min-width: 0; margin: 0; accent-color: var(--ink); }
.scrub .at { min-width: 48px; text-align: right; font-variant-numeric: tabular-nums; }
.pause-note { font-size: 12px; color: var(--muted); }
.pause-note.tone-open { color: var(--open); }
.pause-note .path { font: 12px var(--mono); }
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
.logo { flex: none; width: 14px; height: 14px; margin-right: -4px; background: currentColor; -webkit-mask: ${logo} center / contain no-repeat; mask: ${logo} center / contain no-repeat; }
.title { font-weight: 600; white-space: nowrap; }
.app { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.spacer { flex: 1; }
.count { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.follow { padding: 3px 10px; border-radius: 6px; color: var(--muted); white-space: nowrap; }
.follow:hover, .follow.on, .close:hover, .back:hover { background: var(--sel); color: var(--ink); }
.close { width: 28px; height: 28px; border-radius: 6px; color: var(--muted); text-align: center; }
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
.filter, .tab { padding: 8px 0 7px; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.filter:hover, .tab:hover { color: var(--ink); }
.filter.on, .tab[data-active] { color: var(--ink); border-bottom-color: var(--ink); }
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
.ehead-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.show { flex: none; margin-top: 1px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 6px; color: var(--muted); white-space: nowrap; }
.show:hover { color: var(--ink); }
.show.on { background: var(--ink); border-color: var(--ink); color: var(--bg); }
.show:disabled { opacity: .5; cursor: default; }
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
.tab { white-space: nowrap; }
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
.tl .toggle { display: flex; gap: 2px; min-width: 0; margin-left: -12px; }
.chev { flex: none; width: 10px; color: var(--faint); }
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
.life th { color: var(--muted); white-space: nowrap; width: 104px; }
.life td:nth-child(2) { overflow-wrap: anywhere; }
.life td:nth-child(3) { width: 132px; }
.life td:nth-child(4) { width: 36%; }
.life td:last-child { padding-right: 0; }
.life tr:last-child > * { border-bottom: 0; }
.back { display: none; align-self: flex-start; margin: 10px 0 0 10px; padding: 3px 10px; border-radius: 6px; color: var(--muted); white-space: nowrap; }
@container panel (max-width: 719px) {
  .bar { gap: 8px; padding-left: 16px; }
  .logo { margin-right: 0; }
  .count { display: none; }
  .body { grid-template-columns: minmax(0, 1fr); }
  .left { border-right: 0; }
  [data-pane=timeline] > .body > .right, [data-pane=entry] > .body > .left { display: none; }
  .back { display: block; }
  .ehead { padding: 8px 16px 4px; }
  .tabs { column-gap: 12px; flex-wrap: wrap; padding: 0 16px; }
  .tab { flex: none; }
  .tab .unit { display: none; }
  .pane { padding: 12px 16px 16px; }
  .tl { grid-template-columns: minmax(64px, 112px) minmax(0, 1fr); gap: 10px; }
  .life th { width: 88px; }
  .life td:nth-child(3) { width: 104px; }
}
`
