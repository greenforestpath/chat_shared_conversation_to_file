# csctm — ChatGPT Shared Conversation to Markdown

Single-file Bun-native CLI that downloads a ChatGPT share link and saves a clean Markdown transcript with code fences preserved.

## Quick start

```bash
bun install
bun run build   # produces dist/csctm for your current platform
./dist/csctm https://chatgpt.com/share/69343092-91ac-800b-996c-7552461b9b70
```

The tool will:
1. Launch headless Chromium (playwright-chromium)
2. Load the shared conversation
3. Extract all turns (user/assistant)
4. Convert to Markdown (with fenced code blocks)
5. Save `<conversation_title>.md` into the current directory (lowercased, spaces → underscores). If a file exists, `_2`, `_3`, … are appended.

## Install as a global-ish command

From this folder:
```bash
bun run build
sudo cp dist/csctm /usr/local/bin/csctm   # or any directory on your $PATH
```

## Usage
```
csctm <chatgpt-share-url>
csctm https://chatgpt.com/share/69343092-91ac-800b-996c-7552461b9b70
```

## Build single-file binaries for mac / Linux / Windows

Bun's `--compile --target` flag can cross-compile on macOS and Linux. The included scripts emit per-OS binaries into `dist/`:

```bash
# macOS
bun run build:mac-arm64
bun run build:mac-x64

# Linux
bun run build:linux-arm64
bun run build:linux-x64

# Windows (generates dist/csctm-windows-x64.exe)
bun run build:windows-x64

# Everything in one go
bun run build:all
```

## Notes
- Tested with Bun 1.3.x on macOS arm64. Cross-compiling via the scripts above creates native single-file binaries for macOS (arm64/x64), Linux (x64/arm64), and Windows (x64).
- Uses `playwright-chromium`, so the first run will download a headless Chromium bundle into the Playwright cache.
- Terminal output is colored and step-based for clarity.

## Development

```bash
bun run lint       # eslint (flat config)
bun run typecheck  # tsc --noEmit (strict)
bun run check      # runs both
```

## License
MIT
