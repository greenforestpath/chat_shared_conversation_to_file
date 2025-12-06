#!/usr/bin/env bun
import { chromium, type Browser } from 'playwright-chromium'
import TurndownService, { type Rule } from 'turndown'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import pkg from '../package.json' assert { type: 'json' }

type ScrapedMessage = {
  role: string
  html: string
}

type CliOptions = {
  timeoutMs: number
  outfile?: string
  quiet: boolean
  checkUpdates: boolean
  versionOnly: boolean
  generateHtml: boolean
}

type ParsedArgs = CliOptions & { url: string }

const DEFAULT_TIMEOUT_MS = 60_000
const MAX_SLUG_LEN = 120
const INLINE_STYLE = `
:root {
  color-scheme: light;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0 auto;
  padding: 32px 20px 48px;
  max-width: 900px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  color: #0f172a;
  background: #f8fafc;
}
h1, h2, h3, h4, h5, h6 {
  color: #0f172a;
  line-height: 1.25;
  margin: 1.2em 0 0.4em;
}
p {
  margin: 0 0 1em;
}
a {
  color: #2563eb;
  text-decoration: none;
}
a:hover { text-decoration: underline; }
code, pre {
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
code {
  background: #e2e8f0;
  color: #0f172a;
  padding: 0.15em 0.35em;
  border-radius: 6px;
  font-size: 0.95em;
}
pre {
  background: #0b1221;
  color: #e2e8f0;
  padding: 16px;
  overflow: auto;
  border-radius: 10px;
  border: 1px solid #1f2937;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
}
pre code {
  background: none;
  padding: 0;
  color: inherit;
}
blockquote {
  margin: 1em 0;
  padding: 0.6em 1em;
  border-left: 4px solid #cbd5e1;
  background: #f1f5f9;
  color: #0f172a;
  border-radius: 6px;
}
table {
  border-collapse: collapse;
  margin: 1em 0;
  width: 100%;
}
th, td {
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
}
th {
  background: #f8fafc;
  text-align: left;
}
ul, ol {
  padding-left: 1.4em;
}
hr {
  border: 0;
  border-top: 1px solid #e2e8f0;
  margin: 2em 0;
}
.article {
  background: white;
  padding: 28px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
}
.meta {
  color: #475569;
  font-size: 0.95em;
  margin-bottom: 1em;
}
.hljs {
  color: #e2e8f0;
}
.hljs-keyword,
.hljs-selector-tag,
.hljs-literal,
.hljs-section,
.hljs-link {
  color: #7aa2f7;
}
.hljs-function .hljs-title,
.hljs-title.class_,
.hljs-title.function_ {
  color: #9ece6a;
}
.hljs-attr,
.hljs-name,
.hljs-tag {
  color: #7dcfff;
}
.hljs-string,
.hljs-meta .hljs-string {
  color: #e0af68;
}
.hljs-number,
.hljs-regexp,
.hljs-variable {
  color: #f7768e;
}
.hljs-built_in,
.hljs-builtin-name {
  color: #bb9af7;
}
.hljs-comment,
.hljs-quote {
  color: #94a3b8;
}
.hljs-addition {
  color: #2ec27e;
}
.hljs-deletion {
  color: #ff6b6b;
}
`.trim()

const mdRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      const { value } = hljs.highlight(code, { language: lang, ignoreIllegals: true })
      return `<pre class="code-block"><code class="hljs language-${lang}">${value}</code></pre>`
    }
    const escaped = mdRenderer.utils.escapeHtml(code)
    return `<pre class="code-block"><code class="hljs">${escaped}</code></pre>`
  }
})

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderHtmlDocument(markdown: string, title: string, source: string, retrieved: string): string {
  const body = mdRenderer.render(markdown)
  const safeTitle = escapeHtml(title.replace(/^ChatGPT\s*-?\s*/i, ''))
  const safeSource = escapeHtml(source)
  const safeRetrieved = escapeHtml(retrieved)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>${INLINE_STYLE}</style>
</head>
<body>
  <article class="article">
    <h1>${safeTitle}</h1>
    <div class="meta">Source: <a href="${safeSource}" rel="noreferrer noopener">${safeSource}</a><br/>Retrieved: ${safeRetrieved}</div>
    ${body}
  </article>
</body>
</html>`
}
const RESERVED_BASENAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9'
])

function parseArgs(args: string[]): ParsedArgs {
  let url = ''
  let timeoutMs = DEFAULT_TIMEOUT_MS
  let outfile: string | undefined
  let quiet = false
  let checkUpdates = false
  let versionOnly = false
  let generateHtml = true

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg) continue
    switch (arg) {
      case '--timeout-ms':
        timeoutMs = Number.parseInt(args[i + 1] ?? '', 10)
        i += 1
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = DEFAULT_TIMEOUT_MS
        break
      case '--outfile':
        outfile = args[i + 1]
        i += 1
        break
      case '--quiet':
        quiet = true
        break
      case '--check-updates':
        checkUpdates = true
        break
      case '--version':
      case '-v':
        versionOnly = true
        break
      case '--no-html':
        generateHtml = false
        break
      default:
        if (!url && !arg.startsWith('-')) {
          url = arg
        }
        break
    }
  }

  return { url, timeoutMs, outfile, quiet, checkUpdates, versionOnly, generateHtml }
}

const noop = () => {}
const STEP = (quiet: boolean) => (n: number, total: number, msg: string) => {
  if (quiet) return
  console.log(`${chalk.gray(`[${n}/${total}]`)} ${msg}`)
}

const FAIL = (quiet: boolean) => (msg: string) => {
  if (!quiet) console.error(chalk.red(`✖ ${msg}`))
  else console.error(msg)
}

const DONE = (quiet: boolean) => (msg: string) => {
  if (quiet) return
  console.log(chalk.green(`✔ ${msg}`))
}

function usage(): void {
  console.log(
    `Usage: csctm <chatgpt-share-url> [--timeout-ms 60000] [--outfile path] [--quiet] [--check-updates] [--version] [--no-html]`
  )
  console.log(`Example: csctm https://chatgpt.com/share/69343092-91ac-800b-996c-7552461b9b70 --timeout-ms 90000`)
}

export function slugify(title: string): string {
  let base = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!base.length) base = 'chatgpt_conversation'
  if (base.length > MAX_SLUG_LEN) base = base.slice(0, MAX_SLUG_LEN).replace(/_+$/, '')
  if (RESERVED_BASENAMES.has(base)) base = `${base}_chatgpt`
  return base
}

export function uniquePath(basePath: string): string {
  if (!fs.existsSync(basePath)) return basePath
  const { dir, name, ext } = path.parse(basePath)
  let idx = 2
  // Guaranteed return because filesystem is finite; loop breaks once an unused name is found.
  while (true) {
    const candidate = path.join(dir, `${name}_${idx}${ext}`)
    if (!fs.existsSync(candidate)) return candidate
    idx += 1
  }
}

function buildTurndown(): TurndownService {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })

  const codeRule: Rule = {
    filter: (node: HTMLElement) => node.nodeName === 'PRE' && node.firstElementChild?.nodeName === 'CODE',
    replacement: (_content: string, node: HTMLElement) => {
      const codeNode = node.firstElementChild as HTMLElement | null
      const className = codeNode?.getAttribute('class') ?? ''
      const match = className.match(/language-([\w-]+)/)
      const lang = match?.[1] ?? ''
      const codeText = (codeNode?.textContent ?? '').replace(/\u00a0/g, ' ')
      return `\n\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`
    }
  }

  const rulesArray = (td as TurndownService & { rules: { array: Rule[] } }).rules.array
  const existingRuleIndex = rulesArray.findIndex(rule => {
    if (typeof rule.filter === 'string') return ['code', 'pre'].includes(rule.filter.toLowerCase())
    if (typeof rule.filter === 'function') return rule.filter.toString().includes('CODE')
    return false
  })

  if (existingRuleIndex >= 0) rulesArray.splice(existingRuleIndex, 0, codeRule)
  else td.addRule('fencedCodeWithLang', codeRule)

  return td
}

async function checkForUpdates(): Promise<void> {
  const latestUrl =
    'https://api.github.com/repos/Dicklesworthstone/chatgpt_shared_conversation_to_markdown_file/releases/latest'
  try {
    const res = await fetch(latestUrl, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) return
    const data = (await res.json()) as { tag_name?: string }
    if (data?.tag_name) {
      console.log(chalk.gray(`Latest release: ${data.tag_name}`))
    }
  } catch {
    // silently ignore update check failures
  }
}

async function attemptWithBackoff(fn: () => Promise<void>, timeoutMs: number, label: string): Promise<void> {
  const attempts = 3
  const baseDelay = 500
  let lastErr: unknown
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fn()
      return
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) {
        const delay = baseDelay * (i + 1)
        await new Promise(res => setTimeout(res, delay))
      }
    }
  }
  throw new Error(`Failed after ${attempts} attempts while ${label}. Last error: ${lastErr}`)
}

function writeAtomic(target: string, content: string): void {
  const dir = path.dirname(target)
  const tmp = path.join(dir, `.${path.basename(target)}.tmp-${Date.now()}`)
  fs.writeFileSync(tmp, content, 'utf8')
  fs.renameSync(tmp, target)
}

function cleanHtml(html: string): string {
  return html
    .replace(/<span[^>]*data-testid="webpage-citation-pill"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<a[^>]*data-testid="webpage-citation-pill"[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/\sdata-start="\d+"/g, '')
    .replace(/\sdata-end="\d+"/g, '')
}

function normalizeLineTerminators(markdown: string): string {
  // Remove Unicode LS (\u2028) and PS (\u2029) which can break editors/linters.
  return markdown.replace(/[\u2028\u2029]/g, '\n')
}

async function scrape(url: string, timeoutMs: number): Promise<{ title: string; markdown: string; retrievedAt: string }> {
  const td = buildTurndown()
  let browser: Browser | null = null

  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    })

    await attemptWithBackoff(
      async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs / 2 })
        await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs })
      },
      timeoutMs,
      'loading the share URL (check that the link is public and reachable)'
    )

    await attemptWithBackoff(
      async () => {
        await page.waitForSelector('article [data-message-author-role]', { timeout: timeoutMs })
      },
      timeoutMs,
      'waiting for conversation content (page layout may have changed or the link may be private)'
    )

    const title = await page.title()
    const messages = (await page.$$eval(
      'article [data-message-author-role]',
      (nodes: Element[]) =>
        nodes.map(node => {
          const element = node as HTMLElement
          return {
            role: element.getAttribute('data-message-author-role') ?? 'unknown',
            html: element.innerHTML
          }
        })
    )) as ScrapedMessage[]

    if (!messages.length) throw new Error('No messages were found in the shared conversation.')

    const lines: string[] = []
    const titleWithoutPrefix = title.replace(/^ChatGPT\s*-?\s*/i, '')
    lines.push(`# ChatGPT Conversation: ${titleWithoutPrefix}`)
    lines.push('')
    const retrievedAt = new Date().toISOString()
    lines.push(`Source: ${url}`)
    lines.push(`Retrieved: ${retrievedAt}`)
    lines.push('')

    for (const msg of messages) {
      lines.push(`## ${msg.role === 'assistant' ? 'Assistant' : 'User'}`)
      lines.push('')
      let markdown = td.turndown(cleanHtml(msg.html))
      markdown = markdown.replace(/\n{3,}/g, '\n\n').trim()
      lines.push(markdown)
      lines.push('')
    }

    return { title, markdown: normalizeLineTerminators(lines.join('\n')), retrievedAt }
  } finally {
    if (browser) await browser.close()
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const { url, timeoutMs, outfile, quiet, checkUpdates, versionOnly, generateHtml } = opts

  const step = STEP(quiet)
  const fail = FAIL(quiet)
  const done = DONE(quiet)

  if (versionOnly) {
    console.log(`csctm v${pkg.version}`)
    return
  }

  if (!url || ['-h', '--help'].includes(url)) {
    usage()
    process.exit(url ? 0 : 1)
  }
  if (!/^https?:\/\//i.test(url)) {
    fail('Please pass a valid http(s) URL (public ChatGPT share link).')
    usage()
    process.exit(1)
  }

  try {
    const totalSteps = generateHtml ? 8 : 7
    let idx = 1

    step(idx++, totalSteps, chalk.cyan('Launching headless Chromium'))
    step(idx++, totalSteps, chalk.cyan('Opening share link'))
    const { title, markdown, retrievedAt } = await scrape(url, timeoutMs)

    step(idx++, totalSteps, chalk.cyan('Converting to Markdown'))
    const name = slugify(title.replace(/^ChatGPT\s*-?\s*/i, ''))
    const defaultOutfile = uniquePath(path.join(process.cwd(), `${name}.md`))
    const targetOutfile = outfile ? path.resolve(outfile) : defaultOutfile
    const htmlOutfile = path.join(path.dirname(targetOutfile), `${path.parse(targetOutfile).name}.html`)

    step(idx++, totalSteps, chalk.cyan('Writing Markdown'))
    writeAtomic(targetOutfile, markdown)

    if (generateHtml) {
      step(idx++, totalSteps, chalk.cyan('Rendering HTML'))
      const html = renderHtmlDocument(markdown, title, url, retrievedAt)
      const htmlTarget = fs.existsSync(htmlOutfile) ? uniquePath(htmlOutfile) : htmlOutfile
      writeAtomic(htmlTarget, html)
    }

    done(`Saved ${path.basename(targetOutfile)}`)
    if (!quiet) {
      step(idx++, totalSteps, chalk.cyan('Location'))
      console.log(`   ${chalk.green(targetOutfile)}`)
    }

    if (checkUpdates) {
      step(idx++, totalSteps, chalk.cyan('Checking for updates'))
      await checkForUpdates()
    }

    step(idx++, totalSteps, chalk.cyan('All done. Enjoy!'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    fail(message)
    process.exit(1)
  }
}

if (import.meta.main) {
  void main()
}
