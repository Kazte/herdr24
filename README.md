# herdr24

Inspired by [system24](https://github.com/refact0r/system24) by [refact0r](https://github.com/refact0r).

A native terminal-style layout for Herdr: monochrome panels, square borders, compact monospace labels, and the original System24 gray/violet palette. Layout and colors are independent: create new JSON themes and select them through Herdr's existing Look settings.

> Implementation and mocked checks are complete. Native loading and visual verification are **not yet confirmed**: this environment denies GPUI access to the Wayland compositor. Your active Herdr configuration has not been changed.

## Check first

Requires Herdr with the layout/mod APIs documented in its generated `AGENTS.md`, and Node.js 22.15+ for development checks. No npm dependencies or install step are required.

```sh
npm test
npm run check:mods
```

Run native checks from a desktop session where Herdr can access its display. `check:mods` stops at the first failure; a successful run checks all six mods. It only checks initial render, not real layout or later interactions.

## Install deliberately

Run this **from this folder**, only after checking the package. The command explicitly uses Bash and can be pasted into Fish, Bash, or Zsh. It refuses existing package names before copying; it never replaces a shipped layout, keybinding, or settings file.

```sh
bash -c '
  set -eu
  dest="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
  for item in layouts/herdr24.json themes/herdr24-dark.json mods/herdr24 \
    mods/herdr24-spaces mods/herdr24-agents mods/herdr24-tabs \
    mods/herdr24-pane mods/herdr24-status; do
    if [ -e "$dest/$item" ]; then
      printf "Not installed: name already exists: %s\n" "$dest/$item" >&2
      exit 1
    fi
  done
  mkdir -p "$dest/layouts" "$dest/themes" "$dest/mods"
  cp layouts/herdr24.json "$dest/layouts/"
  cp themes/herdr24-dark.json "$dest/themes/"
  for mod in mods/herdr24 mods/herdr24-*; do
    mkdir -p "$dest/$mod"
    cp "$mod/main.js" "$mod/mod.json" "$mod/ui.js" "$dest/$mod/"
  done
'
```

Record your current layout in Herdr before switching, then activate:

```sh
herdr-app do layout.switch '{"name":"herdr24"}'
```

If you installed the earlier `system24` package, install herdr24 alongside it and switch to the new layout. Old assets and saved state are not renamed or deleted automatically.

All six mod folders are required. The included mods make no network requests, run no programs, and do not read external files. User-triggered native commands and shipped menus retain their normal behavior and permissions. The tab strip stores panel preferences in its own local storage; grouping/sidebar choices use namespaced shared state.

## Use it

- **Left:** spaces by machine, then agents and their live descendant terminals sorted by urgency or grouped by space. Click to focus; drag spaces within a machine to reorder. Right-click a space for Herdr's native context menu. Collapse with `<<`, expand with `>>`.
- **Top:** tabs, native terminal/agent launch menu, Files/Changes toggles, and platform window controls. Click, drag to reorder, double-click to rename, right-click for tab actions; scroll the strip to switch tabs.
- **Center:** framed terminals. Each header focuses its own pane and offers split-right, split-down, zoom, and close.
- **Bottom:** machine, branch, agent count, blocked count, and command-palette access.
- **Footer:** settings/themes and Add machine. Existing global keybindings remain unchanged.

Agent state has text as well as color: `[working]` uses a native animated ASCII spinner, `[blocked]` is rose, `[done]` mint, and `[idle]` gray. The working spinner's tooltip identifies its state. Pinned agents stay first. Live descendants without panes are marked `->` and inherit their parent's space for grouping. Click one to open Herdr's native terminal peek, including its keep-as-tab control; descendants already listed as agents appear only once and focus normally. Addresses retain their machine prefix. Finished unkept children show idle, because they report completion to their parent; errors show blocked. Files, Changes, dialogs, picker, terminal menus, and toasts remain shipped Herdr components; their geometry is not redesigned by this package.

## Add and select themes

1. Copy `themes/herdr24-dark.json` to `themes/my-palette.json` in this package and edit its values.
2. Run `npm test`; it validates every JSON theme shipped in `themes/`.
3. Copy the new file into Herdr's `themes/` without overwriting an existing name.
4. Open **[ settings / themes ] → Look** and choose it. Or run:

   ```sh
   herdr-app do app.theme '{"name":"my-palette"}'
   ```

Herdr discovers themes by filename and remembers selection per layout. No JavaScript or layout edits are needed. `herdr24-dark` is the layout's default, not a forced override; choosing another theme takes precedence.

| JSON section | Controls |
| --- | --- |
| `background`, `foreground`, `selection`, `cursor` | Terminal base colors |
| `ansi` | Exactly 16 ANSI colors, in index order 0–15 |
| `colors` | Named UI surfaces, borders, text, accents, and agent states |

Use `#rrggbb` strings. Keep the complete semantic token set from the template, including paired `accent`/`accent_foreground` and `solid`/`solid_foreground` values. Test legibility on both normal and selected surfaces. Herdr can derive UI colors when `colors` is omitted, but this package validates complete palettes for predictable results. Do not add fixed `colors` overrides to the layout or hex values to mods: that would prevent theme changes from reaching the whole custom interface.

Avoid naming a theme exactly like another layout: Herdr limits those themes to that layout's picker. Light/dark classification is determined by Herdr; no custom `light` property is required. This package supplies one dark palette, not a visual theme editor.

## Development and verification

`shared/ui.js` is the helper source. After changing it, run `npm run build:mods` to refresh each mod's local `ui.js`. These copies keep every deployed mod self-contained; tests fail if they drift. Build **before** tests/native checks, and check the exact final files.

Tests use a restricted mock of Herdr/GPUI: they validate layout references, palette contracts, empty states, actions, pane targeting, per-space panel restoration, grouping/pinning, live descendant discovery and peek/focus routing, cyclic/duplicate ancestry, platform controls, and palette changes. They do not replace the native renderer.

Native verification is pending here: a check before the rename exited 101 before loading the mod, because compositor connection was denied. Other checks share that unavailable startup prerequisite. There is no runtime screenshot or claimed preview yet.

After installation, confirm in Herdr:

- [ ] `npm run check:mods` passes for all six mods.
- [ ] `herdr-app status` shows no mod errors; no `layout.error` appears in the app home.
- [ ] Empty spaces/agents, long labels, narrow windows, and sidebar resizing remain usable.
- [ ] Launch a terminal/agent and a child terminal; exercise tabs, contextual actions, splits, zoom, panels, pin/focus, child peek, and keep-as-tab.
- [ ] Switch to another native theme and back; text, borders, states, and terminal colors follow it.
- [ ] Switch spaces and verify each space's Files/Changes choice is restored.
- [ ] Check OS window controls, especially macOS traffic-light clearance.

Only then capture `herdr-app shot preview.png` for a real preview, checking it for private terminal content before sharing.

## Roll back

Switch back to your recorded layout (`main` is Herdr's shipped default):

```sh
herdr-app do layout.switch '{"name":"main"}'
```

Then remove **only** `layouts/herdr24.json`, `themes/herdr24-dark.json`, and the six installed `herdr24*` folders listed above. Keep any palettes you created. Do not delete shared state, your keys, or other layouts. If the UI becomes unusable, Herdr's unbindable `ctrl-alt-shift-escape` returns to its default layout, but also sets aside the current keybindings; use normal switching when possible.

The rollback boundary is this package's named layout, default palette, and six mods; no core model or terminal data is migrated.

## Credits

Visual inspiration and palette: [refact0r/system24](https://github.com/refact0r/system24), an MIT-licensed Discord theme. Its [original OKLCH palette](https://github.com/refact0r/system24/blob/main/theme/system24.theme.css) is adapted to Herdr's hexadecimal sRGB format. Native mods are independently implemented against Herdr's generated API documentation; no Discord CSS or shipped Herdr mod implementation is included.

See [RECIPE.md](RECIPE.md) for the rebuild brief.
