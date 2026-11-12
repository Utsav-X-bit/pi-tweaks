import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Override when checking against a different Pi release.
const root = process.env.PI_PACKAGE_DIR ?? discoverPiPackage();
function discoverPiPackage() {
  const releases = `${process.env.HOME}/.pi/agent/install/releases`;
  const versions = readdirSync(releases).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return `${releases}/${versions.at(-1)}/node_modules/@earendil-works/pi-coding-agent`;
}

const load = relative => import(pathToFileURL(`${root}/dist/${relative}`));
const { loadExtensions } = await load('core/extensions/loader.js');
const { createAllToolRenderers } = await load('core/tools/renderers/index.js');
const { initTheme, loadThemeFromPath } = await load('modes/interactive/theme/theme.js');
const { visibleWidth } = await import(pathToFileURL(`${root}/../pi-tui/dist/index.js`));
const home = process.env.PI_AGENT_DIR ?? fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const themePath = `${home}/themes/omp-dark.json`;
initTheme('omp-dark');
const theme = loadThemeFromPath(themePath, 'truecolor');
assert.equal(theme.name, 'omp-dark');
const palette = JSON.parse(readFileSync(themePath));
assert.equal(palette.vars.accent, '#febc38');
assert.equal(palette.vars.red, '#fc3a4b');
assert.equal(palette.colors.toolDiffAdded, 'green');
assert.equal(palette.colors.toolDiffRemoved, 'red');
const settings = JSON.parse(readFileSync(`${home}/settings.json`));
assert.equal(settings.theme, 'omp-dark');
assert(!(settings.packages ?? []).includes('npm:pi-tool-display'));

const loaded = await loadExtensions([`${home}/extensions/omp-appearance/index.ts`, `${home}/extensions/pi-statusline/index.ts`], '/tmp');
assert.deepEqual(loaded.errors, []);
const extension = loaded.extensions.find(e => e.path.includes('omp-appearance'));
const transformer = extension.markdownTransformer.transformer;
const mdContext = { messageType: 'assistant', isStreaming: false, availableWidth: 120 };
const source = '```mermaid\ngraph LR\n A[Start] --> B[End]\n```';
const rendered = transformer(source, mdContext);
assert(rendered.includes('Start') && rendered.includes('End') && rendered.includes('─'));
assert.equal(transformer(source, { ...mdContext, isStreaming: true }), source);
assert.equal(transformer(source, { ...mdContext, availableWidth: 3 }), source);
const code = '```javascript\nconst n = 1;\n```';
assert.equal(transformer(code, mdContext), code);
const bad = '```mermaid\nnot a diagram\n```';
assert.equal(transformer(bad, mdContext), bad);
const resolver = extension.toolRenderers[0];
const native = createAllToolRenderers();
assert.equal(extension.tools.size, 0, 'appearance must not replace tool execution');
assert.equal(resolver('read', () => native.read), native.read, 'preserve image/read renderer');
assert.equal(resolver('custom', () => undefined), undefined);
const customShell = { ...native.bash, renderShell: 'self' };
assert.equal(resolver('bash', () => customShell), customShell);
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
const mcp = resolver('mcp__example__search', () => undefined);
assert.equal(mcp.renderResult, undefined, 'retain Pi fallback result rendering');
for (const [isPartial, isError, token, icon] of [[true, false, 'warning', '●'], [false, false, 'success', '✔'], [false, true, 'error', '✘']]) {
  const rows = mcp.renderCall({ query: 'hello' }, theme, { isPartial, isError }).render(80);
  const text = rows.join('\n');
  assert(text.includes(theme.fg(token, icon)), `MCP ${token} color`);
  assert(strip(text).includes('example search'));
  assert(strip(text).includes('hello'));
}
const customMcp = { renderCall: () => ({ render: () => [], invalidate() {} }) };
assert.equal(resolver('mcp__example__search', () => customMcp), customMcp, 'preserve custom MCP renderer');

for (const name of ['bash', 'edit', 'write']) {
  const renderer = resolver(name, () => native[name]);
  assert.equal(renderer.renderShell, 'self');
  for (const isError of [false, true]) {
    const context = {
      args: name === 'bash' ? { command: 'printf hello' } : { path: '/tmp/example.ts' },
      toolCallId: 'test', cwd: '/tmp', state: {}, lastComponent: undefined,
      invalidate() {}, isPartial: false, isError, durationMs: 120,
      executionStarted: true, argsComplete: true, expanded: false,
      showImages: true, outputPad: 1, keyText: () => 'ctrl+o', keyHint: () => 'ctrl+o to expand',
    };
    const call = renderer.renderCall(context.args, theme, context);
    assert(call.render(80)[0].includes(theme.getFgAnsi(isError ? 'error' : 'success') + (isError ? '╭ ✘ ' : '╭ ✔ ')));
    const running = renderer.renderCall(context.args, theme, { ...context, isPartial: true, isError: false });
    assert(running.render(80)[0].includes(theme.getFgAnsi('warning') + '╭ ● '));
    const result = renderer.renderResult({ content: [{ type: 'text', text: isError ? 'Permission denied' : 'hello' }], details: undefined }, { expanded: false, isPartial: false }, theme, context);
    for (const width of [1, 4, 10, 40, 80, 160]) {
      const rows = [...call.render(width), ...result.render(width)];
      assert(rows.every(line => visibleWidth(line) <= width), `${name} overflow at ${width}`);
      if (width >= 10) {
        assert(rows.some(line => line.includes('╭')));
        assert(rows.some(line => line.includes('╯')));
      }
      if (width >= 80 && isError) assert(rows.map(strip).join('\n').includes('Permission denied'));
    }
    // Native renderers must receive their own prior component, not our wrapper.
    renderer.renderCall(context.args, theme, { ...context, lastComponent: call });
    renderer.renderResult({ content: [{ type: 'text', text: 'updated' }], details: undefined }, { expanded: true, isPartial: false }, theme, { ...context, lastComponent: result });
  }
}

// Exercise Pi's native diff renderer inside the wrapper, not a mocked text body.
const edit = resolver('edit', () => native.edit);
const ctx = { args: { path: '/tmp/example.ts' }, toolCallId: 'diff', cwd: '/tmp', state: {}, invalidate() {}, isPartial: false, isError: false, durationMs: 50, expanded: false, showImages: true, outputPad: 1, keyText: () => '', keyHint: () => '' };
const editCall = edit.renderCall(ctx.args, theme, ctx);
const editResult = edit.renderResult({ content: [{ type: 'text', text: 'updated' }], details: { diff: '-1 const x = 1;\n+1 const x = 2;', firstChangedLine: 1 } }, { expanded: false, isPartial: false }, theme, ctx);
const diff = [...editCall.render(100), ...editResult.render(100)].map(strip).join('\n');
assert(diff.includes('const x = 1;') && diff.includes('const x = 2;'));

const footerExtension = loaded.extensions.find(e => e.path.includes('pi-statusline'));
let footerFactory;
const footerCtx = {
  hasUI: true, cwd: '/tmp', model: { provider: 'test', id: 'example-model' }, thinkingLevel: 'high',
  ui: { setFooter: factory => { footerFactory = factory; } },
  sessionManager: { getSessionId: () => 'test', getLeafId: () => 'leaf', getSessionName: () => undefined, getEntries: () => [
    { type: 'message', message: { role: 'user', content: 'hello' } },
    { type: 'message', message: { role: 'assistant', usage: { input: 100, output: 20, cacheRead: 900, cacheWrite: 0, cost: { total: 0 } } } },
  ] },
  getContextUsage: () => ({ tokens: 1000, contextWindow: 10000, percent: 10 }),
};
await footerExtension.handlers.get('session_start')[0]({}, footerCtx);
const footer = footerFactory({ requestRender() {} }, theme, { onBranchChange: () => () => {}, getGitBranch: () => null, getExtensionStatuses: () => new Map([['test', 'status\nline']]) });
for (const width of [1, 10, 40, 80, 160]) {
  const rows = footer.render(width);
  assert(rows.every(line => visibleWidth(line) <= width));
  if (width >= 40) assert(rows.map(strip).join('\n').includes('10.0%'));
}
console.log('PASS: theme load, extension load, frame widths, errors, native diffs, renderer reuse, footer and configuration.');
