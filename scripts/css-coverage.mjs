#!/usr/bin/env node
// Per-page CSS coverage snapshot, used to prove a stylesheet change did not
// silently drop a rule some page still depends on.
//
// For every rendered page it records which of the classes in that page's markup
// are DEFINED by the stylesheets that page actually links. Run it before a
// change, run it after, diff the two: any class that was defined before and is
// undefined after — on a page that still uses it — is a regression, and the
// diff names the page and the class.
//
// This is the invariant worth testing here because the failure mode of pruning
// or replacing CSS is exactly "a utility this page needed is no longer served".
// It is not a substitute for looking at the pages; it is what makes looking at
// a handful of them sufficient, by proving the other hundred are unaffected.
//
// Usage:
//   node scripts/css-coverage.mjs snapshot <out.json>
//   node scripts/css-coverage.mjs diff <before.json> <after.json> [--ignore <regex>]
//
// --ignore names the losses that are the POINT of the change, so the run can
// still end green. Removing a rule while leaving the class in markup is normal
// when the class is inert (a `dark:` variant with no dark mode to trigger it);
// the regex is how you assert "these, and only these". Keep it as narrow as the
// intent — a broad pattern hides the regression you are testing for.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const PUBLIC = "public";

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (e.endsWith(".html")) out.push(p);
  }
  return out;
}

// Attribute values, allowing the unquoted form: `hugo --minify` drops the quotes
// wherever it can, so `class=grow` and `rel=stylesheet` are both normal in the
// built output and a quotes-only regex silently matches nothing.
const ATTR = (name) =>
  new RegExp(`${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "g");
const attrValue = (m) => m[1] ?? m[2] ?? m[3] ?? "";

// Classes appearing in class attributes.
function classesInHtml(html) {
  const out = new Set();
  for (const m of html.matchAll(ATTR("class"))) {
    for (const c of attrValue(m).split(/\s+/)) if (c) out.add(c);
  }
  return out;
}

// Stylesheets the page links, plus any inline <style> blocks. Local hrefs only —
// this measures what we ship, not third-party CSS.
function sheetsFor(file, html) {
  const css = [];
  for (const m of html.matchAll(/<link[^>]+>/g)) {
    const rel = [...m[0].matchAll(ATTR("rel"))].map(attrValue)[0];
    if (rel !== "stylesheet") continue;
    const href = [...m[0].matchAll(ATTR("href"))].map(attrValue)[0];
    if (!href || /^https?:/.test(href)) continue;
    const path = href.startsWith("/")
      ? join(PUBLIC, href.slice(1))
      : resolve(dirname(file), href);
    try {
      css.push(readFileSync(path, "utf8"));
    } catch {
      /* a link to something we did not build; absence shows up as undefined classes */
    }
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) css.push(m[1]);
  return css.join("\n");
}

// Every class token the stylesheet DEFINES. Tailwind escapes the punctuation in
// its generated names (`.md\:w-1\/2`, `.top-\[110vh\]`), so unescape before
// comparing against the plain tokens found in markup.
function classesInCss(css) {
  const out = new Set();
  const re = /\.((?:\\.|[A-Za-z0-9_-])(?:\\.|[A-Za-z0-9_\-/[\]%.:!])*)/g;
  for (const m of css.matchAll(re)) out.add(m[1].replace(/\\(.)/g, "$1"));
  return out;
}

function snapshot() {
  const pages = {};
  for (const file of walk(PUBLIC).sort()) {
    const html = readFileSync(file, "utf8");
    const used = classesInHtml(html);
    if (used.size === 0) continue;
    const defined = classesInCss(sheetsFor(file, html));
    const covered = [...used].filter((c) => defined.has(c)).sort();
    pages[file.replace(`${PUBLIC}/`, "")] = {
      used: used.size,
      covered,
      uncovered: [...used].filter((c) => !defined.has(c)).sort(),
    };
  }
  return pages;
}

function diff(before, after, ignore) {
  const bad = new Map(); // page -> [class]
  const excused = new Set();
  let gone = 0;
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const page of [...names].sort()) {
    const b = before[page];
    const a = after[page];
    if (b && !a) {
      console.log(`  page no longer built: ${page}`);
      gone++;
      continue;
    }
    if (!b && a) {
      console.log(`  page added: ${page}`);
      continue;
    }
    // A class that WAS covered and now is not, while the page still uses it.
    const lost = b.covered.filter(
      (c) => !a.covered.includes(c) && a.uncovered.includes(c),
    );
    const real = [];
    for (const c of lost) {
      if (ignore && ignore.test(c)) excused.add(c);
      else real.push(c);
    }
    if (real.length) bad.set(page, real);
  }
  for (const [page, cls] of bad) {
    console.log(`  ${page}`);
    for (const c of cls) console.log(`      lost rule for .${c}`);
  }
  const n = [...bad.values()].reduce((t, c) => t + c.length, 0);
  if (excused.size) {
    console.log(
      `\n${excused.size} class(es) lost a rule but matched --ignore: ${[...excused].sort().join(", ")}`,
    );
  }
  console.log(
    n === 0
      ? `\nOK — no page lost a rule it still uses.${gone ? ` (${gone} page(s) no longer built)` : ""}`
      : `\nFAIL — ${n} lost rule(s) across ${bad.size} page(s).`,
  );
  return n === 0 ? 0 : 1;
}

const argv = process.argv.slice(2);
const ignoreAt = argv.indexOf("--ignore");
// Deliberately NOT global: a /g regex carries lastIndex between .test() calls and
// would start skipping matches.
const ignore = ignoreAt === -1 ? null : new RegExp(argv[ignoreAt + 1]);
if (ignoreAt !== -1) argv.splice(ignoreAt, 2);
const [cmd, a, b] = argv;
if (cmd === "snapshot") {
  const snap = snapshot();
  writeFileSync(a, JSON.stringify(snap, null, 1));
  const pages = Object.keys(snap).length;
  const cov = Object.values(snap).reduce((n, p) => n + p.covered.length, 0);
  console.log(`snapshot: ${pages} pages, ${cov} covered class-uses -> ${a}`);
} else if (cmd === "diff") {
  process.exit(
    diff(
      JSON.parse(readFileSync(a, "utf8")),
      JSON.parse(readFileSync(b, "utf8")),
      ignore,
    ),
  );
} else {
  console.error(
    "usage: css-coverage.mjs snapshot <out.json> | diff <before.json> <after.json> [--ignore <regex>]",
  );
  process.exit(2);
}
