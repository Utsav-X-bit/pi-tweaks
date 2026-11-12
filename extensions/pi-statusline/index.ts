/**
 * Multi-line status footer.
 *
 * Left column, one line each: path, model/session, thinking level, then every
 * extension status from ctx.ui.setStatus().
 * Right column, right-aligned on the first two rows: context gauge, then token/cache/cost stats.
 */

import type { ContextUsage, ExtensionAPI, ExtensionContext, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import { rgbColor, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const BAR_CELLS = 12;

function fmtTokens(n: number): string {
	if (n < 1000) return String(n);
	if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
	return `${Math.round(n / 1000)}k`;
}

interface Totals {
	input: number;
	output: number;
	cacheRead: number;
	cost: number;
	hitRate: number | undefined;
}

const totalsCache = new Map<string, Totals>();

/**
 * Usage totals scan the whole session, so cache them against session id + leaf id:
 * entries are append-only and every append moves the leaf.
 */
function usageTotals(ctx: ExtensionContext): Totals {
	const sessions = ctx.sessionManager;
	const key = `${sessions.getSessionId()}:${sessions.getLeafId()}`;
	const cached = totalsCache.get(key);
	if (cached) return cached;

	const totals: Totals = { input: 0, output: 0, cacheRead: 0, cost: 0, hitRate: undefined };
	const add = (usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: { total: number } } | undefined) => {
		if (!usage) return;
		totals.input += usage.input;
		totals.output += usage.output;
		totals.cacheRead += usage.cacheRead;
		totals.cost += usage.cost.total;
	};

	for (const entry of sessions.getEntries()) {
		if (entry.type === "usage") add(entry.usage);
		else if (entry.type === "message") {
			if (entry.message.role === "assistant" || entry.message.role === "toolResult") add(entry.message.usage);
			if (entry.message.role === "assistant" && entry.message.usage) {
				const usage = entry.message.usage;
				const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
				totals.hitRate = prompt > 0 ? (usage.cacheRead / prompt) * 100 : undefined;
			}
		} else if ((entry.type === "compaction" || entry.type === "branch_summary") && entry.usage) add(entry.usage);
	}

	if (totalsCache.size > 8) totalsCache.clear();
	totalsCache.set(key, totals);
	return totals;
}

function contextLine(theme: Theme, usage: ContextUsage | undefined): string {
	const known = usage?.percent != null;
	const percent = usage?.percent ?? 0;
	const filled = Math.max(0, Math.min(BAR_CELLS, Math.round((percent / 100) * BAR_CELLS)));
	const color = percent > 90 ? "error" : percent > 70 ? "warning" : "success";
	const gauge = `[${theme.fg("success", "#".repeat(filled))}${theme.fg("dim", "-".repeat(BAR_CELLS - filled))}]`;
	const label = theme.fg(color, known ? `${percent.toFixed(1)}%` : "?");
	const counts = theme.fg("muted", `· ${usage?.tokens != null ? fmtTokens(usage.tokens) : "?"}/${fmtTokens(usage?.contextWindow ?? 0)}`);
	return `${theme.fg("success", "#")} ${gauge} ${label} ${counts}`;
}

function statsLine(theme: Theme, totals: Totals): string {
	const parts = [
		theme.fg("success", `↑ ${fmtTokens(totals.input)}`),
		theme.fg("error", `↓ ${fmtTokens(totals.output)}`),
	];
	if (totals.hitRate !== undefined) parts.push(theme.fg("success", `⚙ ${totals.hitRate.toFixed(1)}%`));
	parts.push(theme.style(`$${totals.cost.toFixed(3)}`, { fg: rgbColor(95, 175, 175) }));
	return parts.join(theme.fg("dim", " | "));
}

function renderFooter(width: number, ctx: ExtensionContext, theme: Theme, footerData: ReadonlyFooterDataProvider): string[] {
	const home = process.env.HOME;
	let pwd = ctx.cwd;
	if (home && (pwd === home || pwd.startsWith(`${home}/`))) pwd = `~${pwd.slice(home.length)}`;
	const branch = footerData.getGitBranch();
	if (branch) pwd = `${pwd} (${branch})`;

	const sessionName = ctx.sessionManager.getSessionName();
	const thinking = ctx.thinkingLevel;
	const target = [ctx.model?.provider, sessionName, ctx.model?.id || "no-model"].filter(Boolean).join(" · ");

	const left: string[] = [
		`${theme.fg("accent", "@")} ${theme.style(pwd, { fg: rgbColor(0, 175, 175) })}`,
		`${theme.fg("accent", "M")} · ${theme.style(target, { fg: rgbColor(215, 135, 175) })}`,
	];
	if (thinking && thinking !== "off") left.push(theme.fg("success", `& think:${thinking}`));
	for (const text of footerData.getExtensionStatuses().values()) {
		const clean = text.replace(/[\r\n\t]+/g, " ").trim();
		if (clean) left.push(truncateToWidth(clean, width, theme.fg("dim", "...")));
	}

	const right = [contextLine(theme, ctx.getContextUsage()), statsLine(theme, usageTotals(ctx))];

	const lines: string[] = [];
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const l = left[i] ?? "";
		const r = right[i] ?? "";
		if (!r) {
			lines.push(truncateToWidth(l, width, theme.fg("dim", "...")));
			continue;
		}
		if (visibleWidth(l) + visibleWidth(r) + 2 > width) {
			lines.push(truncateToWidth(l, width, ""), truncateToWidth(r, width, ""));
		} else {
			lines.push(l + " ".repeat(width - visibleWidth(l) - visibleWidth(r)) + r);
		}
	}
	return lines;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
			return {
				dispose: unsubscribe,
				invalidate() {},
				render: (width: number) => renderFooter(width, ctx, theme, footerData),
			};
		});
	});
}
