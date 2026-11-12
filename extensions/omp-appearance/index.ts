import type { ExtensionAPI, Theme, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { renderMermaidAscii } from "@vercel/beautiful-mermaid";

type RenderContext = Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];
import { Text, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

// OMP-style frames around Pi's renderers, never around tool execution.
const framedTools = new Set(["bash", "edit", "write"]);

interface FramedComponent extends Component {
	inner: Component;
}

export default function (pi: ExtensionAPI) {
	const diagrams = new Map<string, string | null>();
	pi.registerMarkdownTransformer((markdown, { isStreaming, availableWidth }) => {
		if (isStreaming) return markdown;
		return markdown.replace(/(^ {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[ \t]*(?=\n|$)/gm, (block, indent: string, fence: string) => {
			const first = block.slice(0, block.indexOf("\n"));
			if (first.slice(indent.length + fence.length).trim().toLowerCase() !== "mermaid") return block;
			const source = block.slice(block.indexOf("\n") + 1, block.lastIndexOf("\n")).trim();
			if (!source || source.length > 10000) return block;
			if (!diagrams.has(source)) {
				if (diagrams.size >= 32) diagrams.delete(diagrams.keys().next().value!);
				try { diagrams.set(source, renderMermaidAscii(source)); }
				catch { diagrams.set(source, null); }
			}
			const diagram = diagrams.get(source);
			if (!diagram || diagram.split("\n").some(line => visibleWidth(line) + indent.length + 2 > availableWidth)) return block;
			return `${indent}\`\`\`text\n${diagram}\n${indent}\`\`\``;
		});
	}, { messageTypes: ["assistant"] });
	pi.registerToolRenderer((name, next) => {
		const native = next();
		if (name.startsWith("mcp__") && !native?.renderCall) {
			const [, server, ...tool] = name.split("__");
			return {
				...native,
				renderCall(args, theme, context) {
					const status = context.isError ? "error" : context.isPartial ? "warning" : "success";
					const icon = context.isError ? "✘" : context.isPartial ? "●" : "✔";
					const label = `${theme.fg(status, icon)} ${theme.fg("accent", "MCP")} ${theme.fg("muted", server || "server")} ${theme.fg("text", tool.join("__") || "tool")}`;
					const details = JSON.stringify(args, null, 2);
					return new Text(details && details !== "{}" ? `${label}\n${theme.fg("dim", details)}` : label, 0, 0);
				},
			};
		}
		if (!framedTools.has(name) || !native?.renderCall || !native.renderResult) return native;
		// A renderer with its own shell may depend on spanning the whole terminal.
		if (native.renderShell === "self") return native;

		const frame: (slot: "call" | "result", inner: Component, theme: Theme, context: RenderContext) => FramedComponent =
			(slot, inner, theme, context) => ({
				inner,
				invalidate() { inner.invalidate(); },
				render(width) {
					const pad = Math.min(context.outputPad, Math.max(0, Math.floor((width - 5) / 2)));
					const margin = " ".repeat(pad);
					const outer = Math.max(0, width - pad * 2);
					if (outer < 5) return inner.render(Math.max(1, width)).map(line => truncateToWidth(line, width, ""));
					const running = context.isPartial;
					const color = context.isError ? "error" : running ? "warning" : "success";
					const bg = context.isError ? "toolErrorBg" : running ? "toolPendingBg" : "toolSuccessBg";
					const border = (text: string) => theme.fg(color, text);
					const icon = context.isError ? "✘" : running ? "●" : "✔";
					const label = slot === "call" ? ` ${icon} ` : context.durationMs !== undefined ? ` ${(context.durationMs / 1000).toFixed(2)}s ` : "";
					const cap = (left: string, right: string) => {
						const title = truncateToWidth(label, outer - 2, "");
						return margin + border(left + title + "─".repeat(Math.max(0, outer - 2 - visibleWidth(title))) + right) + margin;
					};
					const rows = inner.render(outer - 4).map(line => {
						const clipped = truncateToWidth(line, outer - 4, "");
						const body = " " + clipped + " ".repeat(Math.max(0, outer - 3 - visibleWidth(clipped)));
						return margin + border("│") + theme.bg(bg, body) + border("│") + margin;
					});
					return slot === "call" ? [cap("╭", "╮"), ...rows] : [...rows, cap("╰", "╯")];
				},
			});

		return {
			...native,
			renderShell: "self",
			renderCall(args, theme, context) {
				const previous = context.lastComponent as FramedComponent | undefined;
				const inner = native.renderCall!(args, theme, { ...context, lastComponent: previous?.inner });
				return frame("call", inner, theme, context);
			},
			renderResult(result, options, theme, context) {
				const previous = context.lastComponent as FramedComponent | undefined;
				const inner = native.renderResult!(result, options, theme, { ...context, lastComponent: previous?.inner });
				return frame("result", inner, theme, context);
			},
		};
	});
}
