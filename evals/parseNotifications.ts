/**
 * Stage 1 of the synthetic end-to-end run: the phone's half.
 *
 * Reads synthetic_notifications.json and pushes each one through the *real*
 * shipped code — the same title gate the native listener applies, the same
 * parser the WebView runs — then writes the result to stdout as JSON for the
 * Python stage to feed to the merchant agent.
 *
 * Nothing here is a reimplementation: if this disagrees with the app, the app is
 * what changed.
 *
 *   npx vite-node evals/parseNotifications.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  TRANSACTION_TITLE,
  looksTransactional,
  parseAdvanziaBody,
} from '../utils/advanziaNotification';

const here = dirname(fileURLToPath(import.meta.url));
const notifications: { id: string; note: string; title: string; body: string }[] =
  JSON.parse(readFileSync(join(here, 'synthetic_notifications.json'), 'utf8'));

const results = notifications.map(n => {
  // The native listener's gate, mirrored exactly: title match, else a euro
  // amount makes it "suspicious", else it is dropped without a trace.
  const gate: 'transaction' | 'suspicious' | 'ignored' =
    n.title === TRANSACTION_TITLE ? 'transaction'
      : looksTransactional(n.body) ? 'suspicious'
        : 'ignored';

  return {
    id: n.id,
    note: n.note,
    title: n.title,
    body: n.body,
    gate,
    // Ignored notifications never reach the parser in the real app either.
    parse: gate === 'ignored' ? null : parseAdvanziaBody(n.body),
  };
});

process.stdout.write(JSON.stringify(results, null, 2));
