# csctm — ChatGPT Shared Conversation → Markdown

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)
![Runtime](https://img.shields.io/badge/runtime-Bun%201.3+-purple)
![Status](https://img.shields.io/badge/status-alpha-orange)
![License](https://img.shields.io/badge/license-MIT-green)

Single-file Bun-native CLI that downloads a ChatGPT share link and saves a clean Markdown transcript with fenced code blocks, stable filenames, and rich terminal output.

<div align="center">

```bash
curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/chatgpt_shared_conversation_to_markdown_file/main/install.sh \
  | bash
```

</div>

---

## ✨ Highlights
- **Zero-setup binaries**: Installer prefers published release binaries per-OS; falls back to Bun source build automatically.
- **Accurate Markdown**: Preserves fenced code blocks with detected language, strips citation pills, normalizes whitespace and line terminators.
- **Deterministic filenames**: Slugifies the conversation title and auto-increments to avoid clobbering existing files.
- **Readable progress**: Colorized, step-based console output powered by `chalk`.

## 🧭 Usage
```bash
csctm <chatgpt-share-url> \
  [--timeout-ms 60000] [--outfile path] [--quiet] [--check-updates] [--version] \
  [--no-html] [--html-only] [--md-only] \
  [--gh-pages-repo owner/name] [--gh-pages-branch gh-pages] [--gh-pages-dir csctm] \
  [--remember] [--forget-gh-pages] [--dry-run] [--yes] [--gh-install]

csctm https://chatgpt.com/share/69343092-91ac-800b-996c-7552461b9b70 --timeout-ms 90000
```

What you’ll see:
- Headless Chromium launch (first run downloads the Playwright bundle).
- `✔ Saved <file>.md` plus the absolute path; an HTML twin (`.html`) is also written by default. Use `--no-html` to skip.
- (Optional) Publish to GitHub Pages with `--gh-pages-repo <owner/name>` (defaults to remembered repo or `my_shared_chatgpt_conversations`). Confirm by typing `PROCEED` unless you pass `--yes`. Use `--remember` to persist repo/branch/dir; `--forget-gh-pages` to clear; `--dry-run` to simulate.
- (Optional) Publish HTML/MD to GitHub Pages via `--gh-pages-repo <repo> [--gh-pages-branch gh-pages] [--gh-pages-dir csctm]` with `GITHUB_TOKEN` set.

## 🚀 Install (curl | bash)
- Default install to `~/.local/bin`; `DEST=/custom/path` or `--system` for `/usr/local/bin`.
- Adds PATH hints when `--easy-mode` is used.
- Windows: use Git Bash or WSL for the installer; native Windows binary is also produced in `dist/`.

Examples:
```bash
# Standard (latest release binary)
curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/chatgpt_shared_conversation_to_markdown_file/main/install.sh | bash

# Force source build
curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/chatgpt_shared_conversation_to_markdown_file/main/install.sh | bash -s -- --from-source

# Install to /usr/local/bin
curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/chatgpt_shared_conversation_to_markdown_file/main/install.sh | bash -s -- --system
```

## 🗂️ Output shape
- Title: `# ChatGPT Conversation: <title>`
- Metadata: `Source: <url>`, `Retrieved: <iso8601>`
- Per message: `## User` / `## Assistant`
- Code fences: language preserved when present (```` ```python ... ``` ````)
- Newlines: normalized to `\n`; Unicode LS/PS removed.
- HTML twin: standalone, zero-JS HTML with inline CSS and syntax highlighting (highlight.js theme), same base filename as the Markdown.
  - Light/dark (prefers-color-scheme) theming, language badges on code blocks, softened card layout, TOC, metadata pills, print-friendly tweaks.

## 🔍 How it works (pipeline)
1. Validate URL and print usage on `-h/--help`.
2. Launch headless Chromium (`playwright-chromium`) with a desktop UA.
3. Wait for `article [data-message-author-role]` to ensure content is present.
4. Extract role + inner HTML for each message.
5. Turndown + custom code-block rule → Markdown.
6. Clean citations, normalize whitespace and line terminators.
7. Slugify title, pick a non-conflicting filename, write to disk.

## 🛠️ Local build & dev
```bash
bun install
bun run build                 # dist/csctm for current platform

# Dev helpers
bun run lint                  # eslint
bun run typecheck             # tsc --noEmit
bun run check                 # lint + typecheck

# Cross-platform binaries (emit into dist/)
bun run build:mac-arm64
bun run build:mac-x64
bun run build:linux-x64
bun run build:linux-arm64
bun run build:windows-x64     # dist/csctm-windows-x64.exe
bun run build:all
```

## 🧪 End-to-end smoke (networked)
Uses the public share link above to verify scrape → Markdown. Requires network + Playwright download.
```bash
CSCTM_E2E=1 bun run test:e2e   # builds binary, runs against the shared URL
```

Checks performed:
- Binary exits 0
- Produces `.md` and `.html` files
- File length and line-count exceed minimums
- Contains expected header/source URL
- No stray CR-only line endings or disallowed Unicode separators
- HTML is static (no `<script>` tags) and contains inline styles.

## 🌐 GitHub Pages publishing (optional)
- Publish both `.md` and `.html` to a GitHub Pages branch:
  ```bash
  GITHUB_TOKEN=... csctm <share-url> \
    --gh-pages-repo youruser/my_shared_chatgpt_conversations \
    --gh-pages-branch gh-pages \
    --gh-pages-dir csctm \
    --gh-install    # optionally auto-install gh if missing (brew/apt/winget/choco)
  ```
- You’ll see a summary and must type `PROCEED` to publish (or pass `--yes`).
- Use `--remember` to persist repo/branch/dir for next runs; `--forget-gh-pages` to clear.
- `--dry-run` clones/builds the index but skips commit/push.
- Index page is auto-regenerated with cards linking to HTML/MD plus added-at timestamps.
- If you don’t specify a repo, it defaults to `my_shared_chatgpt_conversations` and will infer your GitHub user via `gh`; you can override anytime with `--gh-pages-repo`.

## ⚙️ CI & releases
- Workflow: lint → typecheck → unit tests → e2e scrape (Ubuntu) → matrix builds (macOS/Linux/Windows) → upload artifacts.
- Tagged pushes (`v*`) create a GitHub release via `gh release create` and attach built binaries.
- Playwright browsers are cached between e2e runs to speed up CI.
- Release bundles now include `sha256.txt` for checksum verification; installer will verify when available (or with `--verify`).
- README links are checked in CI (chatgpt share link excluded to avoid auth issues).

## 📦 Artifacts & install destinations
- Binaries: `dist/csctm` (macOS/Linux), `dist/csctm.exe` (Windows).
- Installer default: `~/.local/bin`; override with `DEST` or `--system`.

## 📋 Flags & env (installer)
- `VERSION=vX.Y.Z` pin a tag; otherwise resolves `latest`.
- `DEST=/path` install target (default `~/.local/bin`; `--system` → `/usr/local/bin`).
- `--from-source` force Bun build (requires `bun`, `git`).
- `--easy-mode` append PATH hints to common shells when possible.

## 🧰 Troubleshooting
- **Playwright download slow?** Pre-populate `PLAYWRIGHT_BROWSERS_PATH` or rerun after first download completes.
- **Binary not on PATH?** Add `~/.local/bin` (or your `DEST`) to PATH; re-open the shell.
- **Share layout changed?** The scraper waits for `article [data-message-author-role]`; open an issue with the share URL so selectors can be updated.
- **Need to force source build?** Use `--from-source` (Bun + git required).

## ⚠️ Failure modes & fixes
- **403/redirect/login page:** Ensure the link is a public ChatGPT share URL; retry with `--timeout-ms 90000`.
- **No messages found:** Page structure may have changed; selectors target `article [data-message-author-role]`. Please report the share URL.
- **Download stalls:** Set `PLAYWRIGHT_BROWSERS_PATH` to a cached Chromium bundle to skip downloads (see cache paths in FAQ).
- **Filename conflicts/invalid names:** Filenames are slugified, truncated to 120 chars, avoid Windows reserved names, and auto-suffix `_2`, `_3`, etc.
- **Partial writes:** Files are written atomically via temp+rename in the target directory.
- **Skip HTML twin:** Pass `--no-html` if you only need Markdown.
- **GitHub Pages publish fails:** Ensure `GITHUB_TOKEN` is set with repo write access; use `--gh-pages-branch` if the branch doesn’t exist yet (it will be created), and `--gh-pages-dir` to isolate exports.
 - **Repo not found:** Provide `--gh-pages-repo owner/name`. If using the default name, ensure `gh` is logged in so we can infer your username or create the repo.

## ❓ FAQ
- **Where do the binaries come from?** CI builds macOS/Linux/Windows artifacts on tagged releases; the installer fetches from the latest tag (`releases/latest`) unless you pin `VERSION=vX.Y.Z`.
- **How are filenames generated?** Conversation titles are lowercased, non-alphanumerics → `_`, trimmed of leading/trailing `_`; collisions append `_2`, `_3`, ….
- **Where does Playwright cache browsers?** Default: `~/.cache/ms-playwright` (Linux/macOS) or `%USERPROFILE%\\AppData\\Local\\ms-playwright` (Windows). CI caches this directory between runs.
- **Why does first run take longer?** Playwright downloads Chromium once. Subsequent runs reuse the cached browser bundle.
- **Can I control timeouts?** Yes: `--timeout-ms` sets both navigation and selector waits (default 60000ms).
- **Can I override the output path?** Yes: `--outfile /path/to/output.md` bypasses slug-based naming.
- **Can I reduce console output?** `--quiet` minimizes progress logs; errors still print.
- **Can I check for updates?** Add `--check-updates` to print the latest GitHub release tag (no network calls by default).
- **Can I verify downloads?** The installer fetches adjacent `.sha256` files when present; use `--verify` to require a checksum.
- **Can I run headful?** Not currently; the tool is headless-only for speed and determinism.
- **Can I change the user agent or selectors?** Edit `src/index.ts` (`chromium.launch` options and `page.waitForSelector` target) and rebuild.
- **How do I verify installs?** Run `csctm --help` and invoke the bundled E2E: `CSCTM_E2E=1 bun run test:e2e` (network + browser download required).
- **Which Markdown rules are customized?** A turndown rule injects fenced code blocks with detected language from `class="language-..."`; citation pills and data-start/end attributes are stripped.

## 📜 License
MIT

