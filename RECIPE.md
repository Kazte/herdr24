# herdr24

Build a native terminal/TUI-style Herdr workspace, not a web page: square dark-gray panels, thin borders, Geist Mono, and restrained violet highlights. Keep layout structure independent of the selected palette. There is no runtime preview yet; add one only after real desktop validation.

## What you see

- A 250px left sidebar (44–480px, rail below 160px). Brand/search/collapse at the top (42px); resizable spaces/agents lists in the middle; settings/themes and Add machine at the bottom (70px).
- A 42px tab/window-control strip over the workspace, followed by active-tab terminals. Workspace padding and pane gaps are 10px; pane borders are 1px with 0px radius. The 30px pane header is always visible, including lone panes.
- An optional 368px right panel (280–900px) containing shipped Files and Changes, and a 28px status line below the workspace.
- Dark terminal `#141414`, chrome/canvas `#1d1d1d`, normal terminal text `#aeaeae`, violet accent `#b589d6`. Use all runtime colors through semantic theme tokens, never fixed mod colors.

## How it behaves

Spaces are grouped by machine. Press/release selects; pressing one and releasing another reorders within the same machine. Native right-click menus preserve rename/close/worktree actions. New-space controls target the indicated machine. The compact rail shows space numbers and offers expansion from the agents header, including on macOS.

Agents and live descendants show title, space, status, and pin control; pinned first, then blocked/done/working/idle priority. The grouping button switches between priority and space grouping, preserving native agent focus and keyboard navigation order. Working uses a native animated `[|] [/] [-] [\]` spinner; blocked, done, and idle retain text labels and semantic colors. Discover live descendants of displayed agents through `terminals()` parent links, including deeper descendants. Preserve exact machine-qualified identities, deduplicate kept agents, and bound traversal with visited identities so cycles are harmless. Unkept rows use `->` and open `terminal.peek`; already listed agents use `agent.focus`. Children inherit their parent's grouping context, error becomes blocked, and unkept done becomes idle. No redraw timers or polling helpers.

Tabs select, rename on double-click, reorder by press/release, close, and expose native context and launch menus. Wheel input switches tabs with touchpad throttling. Files/Changes buttons respect `workspace.panels` and restore the selected/closed panel per space without recording a pending restore as a user choice.

Pane headers focus their own pane and target it explicitly for split, zoom, and close. Global shortcuts remain untouched. Linux/Windows get minimize/maximize/close controls; macOS retains native traffic lights and reserves space when the sidebar is hidden or narrowed.

Themes are independent JSON files. The layout defaults to `herdr24-dark`; native Look settings allow selecting another palette, remembered per layout. Create palettes by copying/editing the JSON, not by changing mods or layout overrides.

## Built from

- `layouts/herdr24.json`: root row, sidebar column, work column; IDs `sidebar`, `panel`, `panel-body`, `files`, and `changes` match native expectations. Root sets terminal/UI font, 14px terminal text, padding, and default theme.
- Six native mods: `herdr24` (brand; `{footer:true}` for footer), `herdr24-spaces`, `herdr24-agents`, `herdr24-tabs`, `herdr24-pane` (host `{pane, terminal}` props), `herdr24-status`. All use `{ "place": "none" }`.
- `shared/ui.js` provides buttons, labels, status, layout lookup, native context menus, and reversible sidebar sizing. `scripts/build-mods.js` copies it to each mod as a local `ui.js`; deploy all six folders together.
- Shipped mods remain responsible for Files, Changes, new-menu, menu, machine-add, picker, dialogs, and toasts.
- Data uses `spaces`, `machines`, `agents`, `terminals`, `panes`, `theme`, `window`, `settings`, `layout`, `keys`, `props`, `shared`, and `checking`. Actions use native space/tab/pane/agent/window/layout commands, `terminal.pin`, `terminal.peek`, `app.settings`, `app.palette`, `mod.open`, `openOverlay`, and `setAgentOrder`.
- No external programs, network requests, bundled fonts, image assets, or custom keyboard bindings.

## Watch out

Only root look applies in this Herdr version. Root `colors` overrides or fixed mod colors break palette switching. Keep 16 ANSI hex entries and complete semantic colors in each palette. Name the default `herdr24-dark`, not another layout's name; native theme filtering and picker overrides otherwise surprise users.

Do not edit shipped mods or layouts: Herdr rewrites them on startup. Preserve local `ui.js` copies with the build command. Guard render-time navigation/order/state synchronization while `checking()` is true. Never retain a callback context for later use.

This is a presentation layer over native data, not a copy of all shipped sidebar enrichment: custom spaces show native branch data without polling Git, and the custom agent list flattens discovered live descendants into its priority/space grouping rather than reproducing the shipped tree decorations. Native commands/picker remain available. Shipped panels/settings/dialogs keep their own geometry.

`herdr-app check` needs desktop compositor access and checks initial elements only. Sandbox compositor startup was denied (exit 101), so no native-render or live-interaction proof is claimed. Do not publish a synthetic screenshot as a real preview.

## Done when

1. `npm run build:mods && npm test` passes all contracts and mocked action/state scenarios.
2. `npm run check:mods` passes all six native mod checks in an accessible desktop session.
3. A live window confirms long/empty states, resizing, contextual actions, pane controls, per-space panels, native launch/settings flows, and platform window controls.
4. Choosing another theme changes every custom region and terminal without changing the layout.
5. The previous layout can be restored without changing keys, shared user state, or running terminals.
