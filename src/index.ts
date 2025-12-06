#!/usr/bin/env bun
import { chromium, type Browser } from 'playwright-chromium'
import TurndownService, { type Rule } from 'turndown'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'

type ScrapedMessage = {
  role: string
  html: string
}

const STEP = (n: number, total: number, msg: string) => {
  console.log(`${chalk.gray(`[${n}/${total}]`)} ${msg}`)
}

const FAIL = (msg: string) => {
  console.error(chalk.red(`✖ ${msg}`))
}

const DONE = (msg: string) => {
  console.log(chalk.green(`✔ ${msg}`))
}

function usage(): void {
  console.log(`Usage: csctm <chatgpt-share-url>`)
  console.log(`Example: csctm https://chatgpt.com/share/69343092-91ac-800b-996c-7552461b9b70`)
}

function slugify(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return base.length ? base : 'chatgpt_conversation'
}

function uniquePath(basePath: string): string {
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

function cleanHtml(html: string): string {
  return html
    .replace(/<span[^>]*data-testid="webpage-citation-pill"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<a[^>]*data-testid="webpage-citation-pill"[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/\sdata-start="\d+"/g, '')
    .replace(/\sdata-end="\d+"/g, '')
}

async function scrape(url: string): Promise<{ title: string; markdown: string }> {
  const td = buildTurndown()
  let browser: Browser | null = null

  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    })

    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForSelector('article [data-message-author-role]', { timeout: 60_000 })

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

    return { title, markdown: lines.join('\n') }
  } finally {
    if (browser) await browser.close()
  }
}

async function main(): Promise<void> {
  const url = process.argv[2]
  if (!url || ['-h', '--help'].includes(url)) {
    usage()
    process.exit(url ? 0 : 1)
  }
  if (!/^https?:\/\//i.test(url)) {
    FAIL('Please pass a valid http(s) URL.')
    usage()
    process.exit(1)
  }

  try {
    STEP(1, 6, chalk.cyan('Launching headless Chromium'))
    STEP(2, 6, chalk.cyan('Opening share link'))
    const { title, markdown } = await scrape(url)

    STEP(3, 6, chalk.cyan('Converting to Markdown'))
    const name = slugify(title.replace(/^ChatGPT\s*-?\s*/i, ''))
    const outfile = uniquePath(path.join(process.cwd(), `${name}.md`))

    STEP(4, 6, chalk.cyan('Writing file'))
    fs.writeFileSync(outfile, markdown, 'utf8')

    DONE(`Saved ${path.basename(outfile)}`)
    STEP(5, 6, chalk.cyan('Location'))
    console.log(`   ${chalk.green(outfile)}`)
    STEP(6, 6, chalk.cyan('All done. Enjoy!'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    FAIL(message)
    process.exit(1)
  }
}

void main()
