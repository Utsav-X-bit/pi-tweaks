# pi-tweaks

My Pi coding-agent customizations: an OMP-style theme and tool frames, a multi-line
statusline, prompt-editor additions, and keybindings. Installs with one script, keeps a
backup, and re-runs safely.

## What is included

| Path | What it does |
|---|---|
| `themes/omp-dark.json` | OMP dark palette (accents, syntax, diffs, tool backgrounds) |
| `extensions/omp-appearance/` | Rounded amber/green/red tool frames for `bash`/`edit`/`write`, colored status + `MCP server tool` labels, Mermaid diagrams rendered as terminal art |
| `extensions/pi-statusline/` | Multi-line footer: path, model, thinking level, extension statuses, context gauge, token/cache/cost |
| `extensions/omp-editor/` | Attachment chips for pasted images and large pastes, `#` action menu, `/skill` picker, `/skill:<name>` completion |
| `keybindings.json` | `Ctrl+Backspace` / `Ctrl+Delete` delete words; `Ctrl+A`/`Ctrl+E` line start/end |
| `AGENTS.md` | Agent defaults (only copied when the target has none) |
| `settings.merge.mjs` | Sets the three settings this repo owns, removes conflicting statusline/tool-display packages |
| `examples/` | Templates for `mcp.json` and `~/.pi/web-search.json` with secrets removed |

Deliberately **not** included: credentials (`auth.json`, `mcp-auth.json`), provider/model state,
sessions, skill/package installs, and Pi itself.

## Install

```sh
git clone <this-repo-url> ~/pi-tweaks
sh ~/pi-tweaks/install.sh
```

Then restart Pi (or `/reload`) and check:

```sh
node ~/.pi/agent/extensions/omp-appearance/verify.mjs
```

The installer writes to `${PI_CODING_AGENT_DIR:-~/.pi/agent}`, backs up everything it replaces to
`backups/pi-tweaks-<timestamp>/`, installs the one npm dependency of `omp-appearance`
(`@vercel/beautiful-mermaid`), and needs `node` plus network access for that step.

Options:

```sh
PI_TUI_MODE=fullscreen sh install.sh   # fullscreen renders the transcript viewport (smoother in long sessions)
PI_TUI_MODE=regular    sh install.sh   # default: normal terminal scrollback
```

Other settings keys it writes: `theme: "omp-dark"`, `enableSkillCommands: false` (skills stay
available via `/skill` and `/skill:<name>`), and it removes `npm:pi-powerline-footer` and
`npm:pi-tool-display` because their statusline/tool renderers conflict with the ones here.

## Manual settings

If `node` is unavailable, add these to `~/.pi/agent/settings.json` yourself:

```json
{
  "theme": "omp-dark",
  "tuiMode": "regular",
  "enableSkillCommands": false
}
```

And remove `npm:pi-powerline-footer` / `npm:pi-tool-display` from `packages`.

## Undo

```sh
cp -a ~/.pi/agent/backups/pi-tweaks-<timestamp>/. ~/.pi/agent/
```

Then restart Pi. Individual pieces can be removed instead: delete the matching directory under
`~/.pi/agent/extensions/` and reload.

## Notes and limits

- Rendering uses Pi's public extension APIs; nothing patches Pi itself, so Pi upgrades are safe.
- Pi re-renders the whole transcript per keystroke, so very long sessions feel slower regardless of
  these files ([#9807](https://github.com/earendil-works/pi/issues/9807)); fullscreen mode helps.
- `omp-appearance` adapts the OMP dark palette and frame style. Full OMP parity (its own diff
  engine, menus, editor geometry) lives in OMP's runtime, not in a Pi extension.
- Mermaid rendering covers flowcharts and the other diagram types supported by
  `@vercel/beautiful-mermaid`; unsupported or too-wide diagrams fall back to their source.
