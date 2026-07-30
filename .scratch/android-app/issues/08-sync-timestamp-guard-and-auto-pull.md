# Sync timestamp guard and auto-pull on foreground

Type: task
Status: open
Blocked by: 07

## Question

Sync is manual today — `triggerSync` fires only from a header button tap (`App.tsx:274,291`) and
pushes the whole state blob with a blind `update().eq('user_key', ...)`
(`services/supabaseService.ts:104`). With one device that is survivable. With a phone as a second
writer, the last device to tap sync silently destroys the other's edits.

Implement:

- **Auto-pull when the app comes to the foreground**, so the phone starts from current state
  rather than whatever it held when last backgrounded.
- **A timestamp guard before push.** Compare the remote watermark against the value observed at
  last pull; if remote is newer, stop and prompt (keep mine / take remote) rather than
  overwriting.

**The watermark must span both tables.** The obvious implementation guards on
`user_finances.updated_at` alone — that is wrong. A Telegram expense write only touches
`user_expenses`, leaving `user_finances.updated_at` untouched, so the guard would pass and the
expense would still be lost. Guard on
`max(user_finances.updated_at, max(user_expenses.updated_at))`, or an equivalent that no writer
can bypass.

Also settle:

- What happens when the app foregrounds with no network.
- Whether push stays manual once pull is automatic, or becomes automatic too.
- Whether the conflict prompt can be resolved per-section or is all-or-nothing.

Blocked by "Make expense push non-destructive" because the guard is a second line of defence, not
the fix — building it first would disguise the real bug.
