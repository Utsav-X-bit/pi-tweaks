// Merges the keys this repo owns into an existing Pi settings.json, leaving
// every device-specific key (providers, packages, models) untouched.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
	console.error("usage: node settings.merge.mjs <settings.json>");
	process.exit(1);
}

const settings = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
const tuiMode = process.argv[3] ?? "regular";

settings.theme = "omp-dark";
settings.tuiMode = tuiMode;
settings.enableSkillCommands = false;

// Statusline/footer and tool renderers from these packages fight the ones in this repo.
const conflicting = new Set(["npm:pi-powerline-footer", "npm:pi-tool-display"]);
const before = Array.isArray(settings.packages) ? settings.packages.length : 0;
if (Array.isArray(settings.packages)) settings.packages = settings.packages.filter(p => !conflicting.has(p));
const removed = before - (settings.packages?.length ?? 0);

writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`settings: theme=omp-dark tuiMode=${tuiMode} enableSkillCommands=false${removed ? ` (removed ${removed} conflicting package)` : ""}`);
