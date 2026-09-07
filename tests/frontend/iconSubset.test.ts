import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECURRING_ICONS } from '../../utils/expenseSummary';

/**
 * Material Symbols are ligatures: the span holds the literal text `wifi` and
 * the font substitutes a glyph. The bundled font is a hand-listed subset, so a
 * name the app renders but the subset never asked for renders as its own name —
 * a row reading "home" or "wifi" instead of an icon. That shipped twice.
 *
 * scripts/fetch-icon-font.sh writes styles/fonts/icons.json as the receipt of
 * what it fetched, alongside the .woff2 it fetched. This test reads the receipt
 * rather than the list in the script, and checks the hash, so a subset that was
 * never regenerated (or never committed) fails here instead of in the UI.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const tsFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? tsFiles(join(dir, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(dir, entry.name)]
        : []
  );

const SOURCES = ['App.tsx', ...tsFiles('components'), ...tsFiles('utils')];

const NAME = /^[a-z][a-z0-9_]*$/;
// A span whose class carries the ligature font, up to its closing tag. The
// class may be a template literal, so stop at the first `>` and take whatever
// the body turns out to be — a name, or an expression to mine for names.
const SPAN = /material-symbols-outlined[\s\S]*?>([\s\S]*?)<\/span>/g;
const ICON_PROP = /\bicon\s*[:=]\s*\{?\s*['"]([a-z][a-z0-9_]*)['"]/g;
// Only quoted names in a result position — `cond ? 'cloud_off' : 'sync'`. A
// bare match would also collect the operand of `syncStatus === 'offline'`.
const RESULT = /[?:]\s*['"]([a-z][a-z0-9_]*)['"]/g;

/** Every glyph name a file can put in front of the ligature font. */
const iconsIn = (source: string): string[] => {
  const names: string[] = [];
  for (const [, body] of source.matchAll(SPAN)) {
    const text = body.trim();
    // `{icon}` and friends are filled by a caller; the literal is at that call
    // site, which ICON_PROP picks up there.
    if (NAME.test(text)) names.push(text);
    else for (const [, name] of text.matchAll(RESULT)) names.push(name);
  }
  for (const [, name] of source.matchAll(ICON_PROP)) names.push(name);
  return names;
};

const receipt = JSON.parse(readFileSync(join(ROOT, 'styles/fonts/icons.json'), 'utf8')) as {
  icons: string[];
  font: string;
  sha256: string;
};

describe('the bundled Material Symbols subset', () => {
  it('carries every glyph a component renders', () => {
    const subset = new Set(receipt.icons);
    const missing = new Set<string>();
    for (const file of SOURCES)
      for (const name of iconsIn(readFileSync(join(ROOT, file), 'utf8')))
        if (!subset.has(name)) missing.add(`${name} (${file})`);
    expect([...missing]).toEqual([]);
  });

  it('carries every glyph recurringIcon can return', () => {
    const subset = new Set(receipt.icons);
    expect(RECURRING_ICONS.filter(name => !subset.has(name))).toEqual([]);
  });

  it('is the font the receipt was written for', () => {
    const font = readFileSync(join(ROOT, 'styles/fonts', receipt.font));
    expect(createHash('sha256').update(font).digest('hex')).toBe(receipt.sha256);
  });
});
