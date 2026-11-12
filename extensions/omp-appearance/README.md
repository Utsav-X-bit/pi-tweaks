# OMP appearance for Pi

Reference: https://github.com/can1357/oh-my-pi (main inspected at 679691a78141de0dd6ba1b7a5d5c1b1d7d967a63).
The OMP dark palette is adapted under the MIT license; see OMP-LICENSE.

- Theme: `~/.pi/agent/themes/omp-dark.json`.
- Rounded state-colored frames: bash, edit, write. Native Pi call/result renderers stay inside, including edit previews and diffs.
- Read/search, extension tools, menus, errors, markdown, editor borders and syntax use the theme through their existing renderers.
- Existing multiline footer retains its layout and adopts OMP path/model/spend colors.
- `pi-tool-display` disabled to avoid OpenCode renderer conflicts; still installed.
- No tool execution handlers, model configuration, or Pi installation files changed.

## Limits

This is not the OMP runtime. Pi's menus, provider-error layout, read/search cards, editor geometry, and third-party custom renderers keep their native structure. Diff layout remains Pi's (not OMP's word-level diff engine). Tools with their own shell are not wrapped. Terminal background/transparency/font and ANSI palette are not changed; OMP uses background `#18181e` and foreground `#cccccc`. The theme supplies foreground colors but cannot repaint the host terminal's background globally.

## Activate and undo

Run `/reload` (or restart Pi). Select `omp-dark` in `/settings` if a project overrides the global theme.

Backup: `/home/utsav/.pi/agent/appearance-backups/omp-20261111-131617`.
To undo, restore its `settings.json` and `statusline.ts` (the latter to `extensions/pi-statusline/index.ts`), remove `extensions/omp-appearance/index.ts`, and reload. The optional theme can remain installed.

## Verify

Run `node ~/.pi/agent/extensions/omp-appearance/verify.mjs`.
