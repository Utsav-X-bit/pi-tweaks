/**
 * Prompt-editor additions: attachment chips above the editor and a `#` action menu.
 *
 * Chips summarize what the editor already contains (pasted image paths, Pi's
 * `[paste #1 +123 lines]` markers) in one line each, so they cost no transcript space.
 */

import { CustomEditor, copyToClipboard, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { closeSync, openSync, readSync } from "node:fs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { extname } from "node:path";

const IMAGE_PATH = /[^\s"'`()[\]]+\.(?:png|jpe?g|gif|webp|bmp)\b/gi;
const IMAGE_HINT = /\.(?:png|jpe?g|gif|webp|bmp)\b/i;
const sizes = new Map<string, string | undefined>();
const PASTE_MARKER = /\[paste #(\d+) (?:\+(\d+) lines|(\d+) chars)\]/g;

/** Width × height of a local image, when its header can be read. */
export function imageSize(path: string): string | undefined {
	if (sizes.has(path)) return sizes.get(path);
	let size: string | undefined;
	try {
		const fd = openSync(path, "r");
		try {
			const head = Buffer.alloc(64 * 1024);
			size = parseImageSize(head.subarray(0, readSync(fd, head, 0, head.length, 0)));
		} finally {
			closeSync(fd);
		}
	} catch {}
	if (sizes.size > 64) sizes.clear();
	sizes.set(path, size);
	return size;
}

function parseImageSize(head: Buffer): string | undefined {
	try {
		if (head.length > 24 && head.readUInt32BE(0) === 0x89504e47) return `${head.readUInt32BE(16)}x${head.readUInt32BE(20)}`;
		if (head.subarray(0, 3).toString("latin1") === "GIF") return `${head.readUInt16LE(6)}x${head.readUInt16LE(8)}`;
		if (head[0] === 0xff && head[1] === 0xd8) {
			for (let i = 2; i + 9 < head.length; ) {
				if (head[i] !== 0xff) return undefined;
				const marker = head[i + 1]!;
				if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
					return `${head.readUInt16BE(i + 7)}x${head.readUInt16BE(i + 5)}`;
				}
				i += 2 + head.readUInt16BE(i + 2);
			}
		}
	} catch {}
	return undefined;
}

/** One chip per attachment, in the order the editor text mentions it. */
export function attachmentLines(text: string): string[] {
	const lines: string[] = [];
	// Runs on every keystroke: bail out before scanning or touching the filesystem.
	if (!text.includes("[paste #") && !IMAGE_HINT.test(text)) return lines;
	let images = 0;
	for (const [token] of text.matchAll(IMAGE_PATH)) {
		const size = imageSize(token);
		images++;
		lines.push(size ? `+-- img #${images} · ${size} --+` : `+-- img #${images} · ${extname(token).slice(1)} --+`);
	}
	for (const match of text.matchAll(PASTE_MARKER)) {
		const [, id, lineCount, chars] = match;
		lines.push(`+-- txt #${id} · ${lineCount ? `+${lineCount} lines` : `${chars} chars`} --+`);
	}
	return lines;
}

/** Skill names from `SKILL.md` frontmatter, for the `/skill` picker. */
export function discoverSkills(dirs: string[]): string[] {
	const names = new Set<string>();
	for (const dir of dirs) {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			continue;
		}
		for (const entry of entries) {
			const file = join(dir, entry, "SKILL.md");
			try {
				if (!statSync(file).isFile()) continue;
				const name = /^name:\s*(.+)$/m.exec(readFileSync(file, "utf8").slice(0, 4096))?.[1]?.trim();
				names.add(name || entry);
			} catch {}
		}
	}
	return [...names].sort();
}

/** `skills/` directories of installed Pi packages, so their skills appear in the picker too. */
export function packageSkillDirs(): string[] {
	const roots = [join(homedir(), ".pi/agent/npm/node_modules")];
	const dirs: string[] = [];
	for (const root of roots) {
		let entries: string[];
		try {
			entries = readdirSync(root);
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.startsWith(".")) continue;
			if (entry.startsWith("@")) {
				try {
					for (const scoped of readdirSync(join(root, entry))) dirs.push(join(root, entry, scoped, "skills"));
				} catch {}
			} else dirs.push(join(root, entry, "skills"));
		}
	}
	return dirs;
}

/** Partial skill name when the line starts with `/skill:`; `undefined` otherwise. */
export function skillPrefixAt(lines: string[], cursorLine: number, cursorCol: number): string | undefined {
	const before = (lines[cursorLine] ?? "").slice(0, cursorCol);
	const match = /^\/skill:([^\s]*)$/.exec(before);
	return match ? match[1] : undefined;
}

/** Skill names matching a partial name, prefix matches first. */
export function matchSkills(names: string[], partial: string, limit = 50): string[] {
	const lower = partial.toLowerCase();
	const starts = names.filter(name => name.toLowerCase().startsWith(lower));
	if (starts.length >= limit || partial === "") return starts.slice(0, limit);
	const rest = names.filter(name => !name.toLowerCase().startsWith(lower) && name.toLowerCase().includes(lower));
	return [...starts, ...rest].slice(0, limit);
}

export interface HashAction {
	value: string;
	label: string;
	description: string;
}

export const HASH_ACTIONS: HashAction[] = [
	{ value: "copy-line", label: "Copy current line", description: "Send the line under the cursor to the clipboard" },
	{ value: "copy-prompt", label: "Copy whole prompt", description: "Send the expanded prompt to the clipboard" },
	{ value: "clear", label: "Clear prompt", description: "Empty the editor" },
];

/** The `#` menu opens on a bare `#` token; text after it filters the actions. */
export function hashPrefix(lines: string[], cursorLine: number, cursorCol: number): string | undefined {
	const before = (lines[cursorLine] ?? "").slice(0, cursorCol);
	const match = /(?:^|\s)#([A-Za-z-]*)$/.exec(before);
	return match ? match[1] : undefined;
}

class AttachmentEditor extends CustomEditor {
	private lastChips = "";

	constructor(
		tui: ConstructorParameters<typeof CustomEditor>[0],
		theme: ConstructorParameters<typeof CustomEditor>[1],
		keybindings: ConstructorParameters<typeof CustomEditor>[2],
		private readonly ctx: ExtensionContext,
	) {
		super(tui, theme, keybindings);
	}

	override handleInput(data: string): void {
		super.handleInput(data);
		this.refreshChips();
	}

	private refreshChips(): void {
		const chips = attachmentLines(this.getText()).join("\n");
		if (chips === this.lastChips) return;
		this.lastChips = chips;
		this.ctx.ui.setWidget("omp-attachments", chips ? chips.split("\n") : undefined);
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("skill", {
		description: "Pick a skill and insert /skill:<name>",
		handler: async (_args, ctx) => {
			const dirs = [join(homedir(), ".pi/agent/skills"), join(homedir(), ".agents/skills"), join(ctx.cwd, ".pi/skills"), ...packageSkillDirs()];
			const names = discoverSkills(dirs);
			if (names.length === 0) {
				ctx.ui.notify("No skills found", "warning");
				return;
			}
			const choice = await ctx.ui.select("Skill", names);
			if (choice) ctx.ui.setEditorText(`/skill:${choice} `);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		// Skills are hidden from `/` discovery; this keeps `/skill:<name>` completing.
		let skills: string[] | undefined;
		const skillNames = () => (skills ??= discoverSkills([join(homedir(), ".pi/agent/skills"), join(homedir(), ".agents/skills"), join(ctx.cwd, ".pi/skills"), ...packageSkillDirs()]));
		ctx.ui.setEditorComponent((tui, theme, keybindings) => new AttachmentEditor(tui, theme, keybindings, ctx));
		ctx.ui.addAutocompleteProvider((current) => ({
			triggerCharacters: ["#"],
			getSuggestions(lines, cursorLine, cursorCol, options) {
				const skill = skillPrefixAt(lines, cursorLine, cursorCol);
				if (skill !== undefined) {
					const items = matchSkills(skillNames(), skill).map(name => ({ value: `skill:${name}`, label: name }));
					return Promise.resolve(items.length > 0 ? { items, prefix: `/skill:${skill}` } : null);
				}
				const prefix = hashPrefix(lines, cursorLine, cursorCol);
				if (prefix === undefined) return current.getSuggestions(lines, cursorLine, cursorCol, options);
				const items = HASH_ACTIONS.filter(action => action.value.startsWith(prefix));
				return Promise.resolve(items.length > 0 ? { items, prefix: `#${prefix}` } : null);
			},
			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				if (item.value.startsWith("skill:")) return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
				const line = lines[cursorLine] ?? "";
				const start = Math.max(0, cursorCol - prefix.length);
				const next = [...lines];
				next[cursorLine] = line.slice(0, start) + line.slice(cursorCol);
				const result = { lines: next, cursorLine, cursorCol: start };
				if (item.value === "copy-line") {
					void copyToClipboard(line).then(() => ctx.ui.notify("Copied current line", "info"), () => ctx.ui.notify("Clipboard unavailable", "warning"));
					return result;
				}
				if (item.value === "copy-prompt") {
					void copyToClipboard(lines.join("\n")).then(() => ctx.ui.notify("Copied prompt", "info"), () => ctx.ui.notify("Clipboard unavailable", "warning"));
					return result;
				}
				if (item.value === "clear") return { lines: [""], cursorLine: 0, cursorCol: 0 };
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},
			shouldTriggerFileCompletion: (lines, cursorLine, cursorCol) =>
				hashPrefix(lines, cursorLine, cursorCol) !== undefined
					? false
					: (current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true),
		}));
	});
}
