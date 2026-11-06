#!/usr/bin/env node
/**
 * design-lint: fails when product code hardcodes a design value instead of
 * using a LumenLive design token. Synced into every repo as
 * src/design/design-lint.mjs; configured per repo by design-lint.config.json:
 *
 *   {
 *     "include": ["src"],                 // folders to scan
 *     "allow": ["src/lib/theme/builtins/**"] // content/data files that may hold colours
 *   }
 *
 * Flags: hex colours, colour functions (rgb/hsl/oklch/lab/lch/hwb/oklab),
 * Tailwind palette classes (bg-red-500, text-white, border-black/10, …) and
 * arbitrary shadows (shadow-[…], drop-shadow-[…]).
 *
 * Escape hatches (use sparingly, with a reason):
 *   // design-lint-ignore-next-line <reason>
 *   … // design-lint-ignore <reason>
 *
 * Usage: node src/design/design-lint.mjs [--config path]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

const cwd = process.cwd()
const argConfig = process.argv.indexOf("--config")
const configPath = join(cwd, argConfig > -1 ? process.argv[argConfig + 1] : "design-lint.config.json")
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {}

const include = config.include ?? ["src"]
const EXTENSIONS = new Set(config.extensions ?? [".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"])
const ALWAYS_SKIP = ["**/node_modules/**", "**/src/design/**", "**/*.d.ts"]

/** Minimal glob → RegExp (supports **, *, ?). Paths use forward slashes. */
function globToRegExp(glob) {
  let re = ""
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/"
        re += slash ? "(?:.*/)?" : ".*"
        i += slash ? 2 : 1
      } else re += "[^/]*"
    } else if (c === "?") re += "[^/]"
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`^${re}$`)
}
const skip = [...ALWAYS_SKIP, ...(config.exclude ?? [])].map(globToRegExp)
const allow = (config.allow ?? []).map(globToRegExp)

const PALETTE =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)"
const UTILITY =
  "(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|decoration|divide|fill|stroke|from|via|to|accent|caret|placeholder|shadow)"

const RULES = [
  {
    id: "hex-colour",
    re: /(?<![\w&/\-?=])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
    hint: "use a colour token (bg-*, text-*, var(--token), cssVar())",
  },
  {
    id: "colour-function",
    re: /(?<![\w-])(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(\s*[\d.]/g,
    hint: "use a colour token; for tints use /opacity or color-mix on a token",
  },
  {
    id: "palette-class",
    re: new RegExp(`(?<![\\w-])${UTILITY}-(?:white|black|${PALETTE})(?:\\/(?:\\d+|\\[[^\\]]+\\]))?(?![\\w-])`, "g"),
    hint: "use a semantic token class (bg-surface, text-danger-text, …)",
  },
  {
    id: "arbitrary-shadow",
    re: /(?<![\w-])(?:drop-)?shadow-\[/g,
    hint: "use a shadow token (shadow-panel, shadow-frame, …) or add one to design/tokens",
  },
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const rel = relative(cwd, full).split(sep).join("/")
    if (skip.some((re) => re.test(rel) || re.test(`${rel}/`))) continue
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (EXTENSIONS.has(name.slice(name.lastIndexOf(".")))) out.push(rel)
  }
  return out
}

const files = include.flatMap((d) => (existsSync(join(cwd, d)) ? walk(join(cwd, d)) : []))
const problems = []
let allowed = 0

for (const file of files) {
  if (allow.some((re) => re.test(file))) {
    allowed++
    continue
  }
  const lines = readFileSync(join(cwd, file), "utf8").split(/\r?\n/)
  lines.forEach((line, i) => {
    if (line.includes("design-lint-ignore") && !line.includes("design-lint-ignore-next-line")) return
    if (i > 0 && lines[i - 1].includes("design-lint-ignore-next-line")) return
    for (const rule of RULES) {
      rule.re.lastIndex = 0
      let m
      while ((m = rule.re.exec(line))) {
        problems.push({ file, line: i + 1, col: m.index + 1, rule, text: m[0] })
      }
    }
  })
}

if (problems.length) {
  for (const p of problems) {
    console.log(`${p.file}:${p.line}:${p.col}  ${p.rule.id}  "${p.text}"  → ${p.rule.hint}`)
  }
  const byRule = problems.reduce((acc, p) => ((acc[p.rule.id] = (acc[p.rule.id] ?? 0) + 1), acc), {})
  console.log(
    `\ndesign-lint: ${problems.length} hardcoded value(s) in ${new Set(problems.map((p) => p.file)).size} file(s) — ${Object.entries(byRule)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`
  )
  process.exit(1)
}
console.log(`design-lint: ${files.length - allowed} file(s) clean${allowed ? `, ${allowed} allowlisted` : ""}`)
