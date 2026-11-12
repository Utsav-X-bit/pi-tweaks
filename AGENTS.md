# Global Agent Instructions

These are defaults for my coding-agent environment, not assumptions about every repository.

- Follow the user's current request and applicable project instructions. Use these global preferences when they do not conflict.
- Inspect the relevant environment before assuming a tool, file, skill, service, or permission is available.
- Prefer the smallest change that solves the task. Avoid unrelated edits and irreversible actions.
- Report material limitations and skipped steps; do not claim a check or export succeeded without verifying it.

## Local repository search — prefer pi-fff

When the pi-fff extension is available, prefer its tools for **local file and content searches**:

| Need | Preferred tool | Notes |
| --- | --- | --- |
| Fuzzy filename/path discovery | `fffind` | Parameters: `pattern`, optional `path`, `limit` |
| Content search | `ffgrep` | Parameters: `pattern`, optional `path`, `ignoreCase`, `literal`, `context`, `limit`, `cursor` |
| Multiple literal content patterns (OR) | `fff-multi-grep` | Parameters: `patterns`, optional `constraints`, `context`, `limit`, `cursor` |

Rules:
1. For a local repository search, try a relevant available ff tool first. Scope queries to the smallest useful directory and cap results.
2. Use `ffgrep` for ordinary text searches and `fff-multi-grep` when searching several literal patterns together.
3. The old notes also mention `fffiles` with a `root` argument, but list `fffind` with a `path` argument. **Do not treat these as interchangeable.** Inspect the installed tool names/signatures and use whichever actually exists.
4. If the ff tools are unavailable or cannot answer the query, fall back to an available equivalent such as `rg`, `fd`, `grep`, or `find`. Do not block the task over a preferred tool.
5. Ordinary directory listings (`ls`) and non-local searches (e.g. web search) are not subject to this preference.

Environment note: the extension was installed at
`/home/utsav/.pi/agent/npm/node_modules/@ff-labs/pi-fff`.
This path is informational; use tool discovery rather than assuming it is present.

## Repository knowledge graph — Graphify

Apply this section **only** in repositories that contain `graphify-out/`.

- Before answering architecture or codebase-structure questions, review `graphify-out/GRAPH_REPORT.md` if it exists, especially important nodes and communities.
- If `graphify-out/wiki/index.md` exists, use it as a navigation entry point; consult source files when needed to confirm details.
- After modifying source code, run `graphify update .` **once near the end of the task** if the CLI is available and the repository is configured for it.
- If Graphify is absent, broken, or inappropriate for the task, continue normally and briefly note the omission when relevant.
- Do not treat generated graph output as more authoritative than the actual source code.

## Python environments and dependencies

Do not install Python packages into the system interpreter (`pip install` against system Python, system-wide `pipx`, or package-manager installs for Python libraries when an isolated environment works).

Preferred order:
1. Reuse the project's existing environment and dependency manager (`.venv`, `uv`, Poetry, etc.).
2. If none exists and a shared tool environment is appropriate, use `~/.ctf-tools/`.
3. Otherwise create a local virtual environment for the task.

Shared environment commands (only if needed):

```sh
python3 -m venv ~/.ctf-tools
~/.ctf-tools/bin/python -m pip install -U pip
~/.ctf-tools/bin/python -m pip install <package>
~/.ctf-tools/bin/python <script.py>
```

Do not recreate an existing environment or install dependencies unnecessarily. Honor the project's lockfile and dependency conventions.

## Dispatched subagents — network and testing

- Treat dispatched subagents as **offline by default** unless their actual environment explicitly confirms network access.
- Prefer local fixtures, mocks, test databases, and existing test suites over live HTTP calls.
- If a connection fails with an egress/retry-budget error, do not repeatedly retry the same endpoint. Switch to offline validation and report the limitation.
- Do not infer that the parent agent has the same network restrictions as its subagents.
- Do not report mocked tests as proof of live-service integration.

## Web research and browser use

Choose the least heavyweight **available** tool that suits the task:

1. Find URLs, documentation, or sources using `web_search`.
2. Read static page content using the URL-reading `read` tool.
3. Use omp's interactive browser (`eval` browser / Chromium) when JavaScript, user interactions, or visual verification is necessary.
4. If a preferred tool is unavailable or fails, use an appropriate supported fallback; avoid repeated ineffective attempts.
5. For CAPTCHA, sign-in, or anti-bot barriers, respect access controls. Request authorized user interaction or consult `skill://solve-captcha` **only when its use is authorized and permitted**; do not silently bypass protections.
6. Verify claims against retrieved content. Distinguish inaccessible pages from pages that have been checked successfully.

## Eraser MCP — existing-file diagram workflow

Use this workflow **only when the user requests an Eraser diagram or export**.

Known environment constraints at the time this file was written:
- Eraser's free plan had reached its new-file limit.
- AI diagram credits were exhausted.
- The designated existing scratch file was `DMeJ6G1pMQvTUKW0mKHz` (`MCP test flowchart`).

These are **time-sensitive account constraints**. Check current tool availability and account status instead of assuming they remain true.

When using the designated scratch file:

1. Call `list_diagrams` and inspect the current contents.
2. **Do not delete diagrams unless the user has explicitly authorized replacing the contents of that file.** If authorized, delete only the diagrams required for the requested replacement.
3. Write diagram DSL manually (e.g. Mermaid-style `flowchart TD ...`) and use `manually_create_diagram` with matching `diagramType` and `code`.
4. When a PNG is requested, call `export_diagram` with `format: png`, save it to the requested path (or `/tmp/<name>.png` if unspecified), and verify the file is a valid PNG.
5. Do not call `create_file`, `create_diagram`, or `update_diagram` while the observed account restrictions still block them. If the workflow cannot proceed safely, explain why rather than destroying unrelated work.

## Completion checks

- Run relevant tests, linting, or validation when feasible; state what actually ran.
- Review changed files and ensure no secrets, unrelated edits, or unwanted generated files were introduced.
- Summarize the result, key verification, and any unresolved limitation concisely.
