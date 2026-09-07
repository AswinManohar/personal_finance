# Building a Notification-Capture Pipeline: Engineering Lessons

This document captures the transferable lessons from building Advanzia notification capture —
an Android `NotificationListenerService` that reads bank notifications and turns them into
reviewable expenses, with an LLM agent for merchant interpretation.

The feature itself is unremarkable. What made it instructive is that it touches money, runs on a
device you cannot fully simulate, and depends on a model that can be confidently wrong. Every
lesson below came from something actually going wrong.

---

## 1. Ground Truth Before Parsing

The work started from screenshots of notifications. Screenshots show the *rendering*, not the
data. Pulling the actual payload off the device with

```bash
adb shell dumpsys notification --noredact
```

changed three design decisions in one go:

| What the screenshot suggested | What the data showed |
|---|---|
| Text is truncated ("…") | `android.bigText` carries the **full** sentence; the ellipsis is collapsed-view rendering |
| The bank groups its notifications | It doesn't — **Android** auto-groups them and synthesises a **content-free summary** that would have landed in the inbox as junk on every 4th notification |
| Merchant names are clean | `REWE Bonn, Friedenspla` — truncated mid-word by the acquirer, *and containing a comma* |

That last one alone invalidated the obvious regex. Any parser splitting the merchant on
punctuation would have been quietly wrong.

**The Concept:** Before writing a parser, capture the real bytes. Rendered output, documentation
and screenshots are all lossy views of the thing you actually have to parse. The cost of
capturing ground truth is minutes; the cost of parsing a hallucinated format is a bug you only
find in production.

---

## 2. Fail Closed When Handling Money

The single most dangerous line of code in this feature was almost this:

```ts
Number(raw.replace(/\./g, '').replace(',', '.'))   // German: "1.234,56" → 1234.56
```

Fed the English-formatted `1,234.56`, that returns **`1.23456`** — an expense wrong by three
orders of magnitude, with nothing downstream to catch it. The fix is to refuse anything not
unambiguously in the expected format:

```ts
const AMOUNT_PATTERN = /^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/;   // must end in ,dd
```

The same principle produced the reject-list. Declines and refunds almost certainly reuse the
same notification title, so a permissive regex would have booked a **declined** payment as a real
expense, or a **refund** as a charge with the sign inverted.

**The Concept:** For financial or safety-critical parsing, ambiguity must produce *refusal*, not
a best guess. A refused input costs a manual correction; a silently misparsed one corrupts data
you will trust later. Ask of every branch: "if I'm wrong here, does the user find out?"

---

## 3. Flag, Don't Filter — and Never Auto-Merge

The original plan deduplicated captures on `(amount, merchant, ±5 minutes)`. Reasonable-sounding,
and quietly destructive: **buying two identical coffees minutes apart is ordinary**, and that
rule would have silently deleted one of them.

Once the device data showed every notification carries a unique, stable ID, the fix was obvious —
but the general lesson isn't about IDs:

- Exact identity → **deduplicate**.
- Fuzzy resemblance → **flag it and let a human decide**. Never delete.

The same shape appears throughout the design. A notification the parser couldn't fully read isn't
hidden — it's shown with a **"needs checking"** badge and cannot be confirmed without being
opened. A suspected refund isn't dropped — it's shown with **no way to add it**.

**The Concept:** Heuristics may *annotate*, never *destroy*. The moment a probabilistic rule is
allowed to delete or merge data, its false-positive rate becomes a silent data-loss rate.

---

## 4. Design for the Failure Mode of Silence

If this feature breaks, nothing happens. No error, no crash — just an empty inbox, which looks
exactly like a quiet spending week. Systems whose failure mode is *absence* need deliberate
liveness evidence:

- **"Last captured 2h ago"** in the UI — an empty inbox proves nothing on its own.
- **A capture-health alarm**: if a notification arrives that *looks* transactional (quotes a euro
  amount) but doesn't match the expected format, say so immediately. That's what a bank silently
  rewording their copy looks like from inside the app.
- **Strict parsing on purpose**, so a format change surfaces as a visible flag rather than
  silently matching nothing.

**The Concept:** For any watcher, poller, or listener, ask "how would I know if this stopped
working?" If the answer is "I'd eventually notice something missing", you need a heartbeat, a
last-success timestamp, or an anomaly signal. Absence of errors is not evidence of success.

---

## 5. Tests Can Pass While the Feature Is Inert

Every unit test passed. 221 of them. The deep link — tapping a notification to review a capture —
**did nothing at all**.

The `appUrlOpen` listener had been placed inside the component that renders the inbox, to avoid
editing the root component. But the app opens on a different tab, so that component wasn't
mounted, so no listener existed:

```
Capacitor/AppPlugin: Notifying listeners for event appUrlOpen
Capacitor/AppPlugin: No listeners found for event appUrlOpen
```

No test could catch it: **in jsdom, the component under test is always mounted.** The bug lived
entirely in the gap between the test environment and the real one.

**The Concept:** Unit tests verify logic given an environment. They cannot verify assumptions
*about* that environment — mounting, lifecycle, permissions, process death, OS policy. Those need
a real device or a real deployment. Budget for that verification as a distinct activity, not as
an afterthought once tests are green.

Related: **the shortcut that caused it was framed as "fewer touch points."** Avoiding a change to
a central file felt tidy and traded away correctness. Deep links are application-scoped, so they
belong in application-scoped code. When a shortcut moves logic to the wrong architectural layer,
the tidiness is an illusion.

---

## 6. Research Can Be Confidently Wrong

Up-front research concluded, in bold: *"Play-store caveats: none apply — this is a sideloaded
app."* The implication was that sideloading removes obstacles.

The opposite is true. An APK installed via `adb` has `installerPackageName=null`, and Android 13+
treats notification-listener access as a **restricted setting** — the permission toggle is greyed
out entirely until the user digs into an overflow menu and taps *"Allow restricted settings"*.
The feature is *unusable* without a step no documentation mentioned, and restricted settings
exists **specifically** to gate sideloaded apps.

**The Concept:** Research produces confident prose whether or not it is correct, and an LLM's
research is no exception. Treat conclusions as hypotheses with an expiry date, and record
corrections *against the original claim* when reality disagrees — a research document that
quietly stays wrong will mislead the next person, who will be you.

---

## 7. Observability Must Not Endanger What It Observes

Adding Logfire tracing looked routine:

```python
logfire.instrument_fastapi(app)
```

It raised at **import time** because an optional extra wasn't installed — taking down the entire
API. A monitoring feature broke the thing being monitored, and the phone depends on that backend.

Two mitigations, both worth generalising:

```python
logfire.configure(send_to_logfire="if-token-present")   # no token → no-op, not a crash
try:
    logfire.instrument_fastapi(app)
except Exception as exc:                                 # lose the spans, keep serving
    logfire.warn("instrumentation unavailable: {error}", error=str(exc))
```

**The Concept:** Cross-cutting concerns — tracing, metrics, analytics, feature flags — must
degrade to no-ops, never to failures. Ask "what happens if this dependency is missing,
misconfigured, or unreachable?" and make sure the answer is "less visibility", not "outage".

---

## 8. Evaluate the Evaluators

The first live eval run of the merchant-guessing agent scored 95.2%. Both "failures" were
**bugs in the evaluators**, not the agent:

- A rule required the output be no longer than the input. The model had turned
  `REWE Bonn, Friedenspla` into `REWE Bonn Friedensplatz` — correctly *un-truncating* it. The
  rule punished the single most valuable thing the model does.
- A rule penalised ALL-CAPS output. For an unintelligible reference code the instructions
  explicitly say to echo the input, so caps were correct.

The corrected suite scores 100%. More importantly, the suite now has tests *of itself* asserting
that a deliberately lazy model scores **strictly worse** than a decent one:

```python
def test_a_useless_answer_scores_worse_than_a_plausible_one():
    lazy = run_with("DM DROGERIE SAGT DANKE", "Other")   # echoes input, everything "Other"
    decent = run_with("dm", "Food")
    assert lazy < decent
```

**The Concept:** An eval that passes everything is worse than no eval — it reports green while
measuring nothing. Prove your evaluators *discriminate* by running them against a deliberately
bad baseline. And when an eval fails, the first hypothesis should be "my expectation is wrong",
not "the model is wrong".

---

## 9. Typed Output as a Guardrail

The merchant agent uses a Pydantic model as its output type:

```python
class MerchantGuess(BaseModel):
    name: str
    category: Literal["Housing", "Food", "Transport", "Utilities", "Entertainment", "Other"]

agent = Agent("openai:gpt-5.1", output_type=MerchantGuess, ...)
```

This isn't convenience — it's enforcement. A category outside the app's enum **cannot reach the
client as a success**, no matter how the model phrases it. The framework validates and retries;
if it still can't comply, the run fails loudly and the client falls back to a safe default.

**The Concept:** When an LLM's output feeds a typed system, make the schema the contract at the
boundary. Prompt instructions are requests; schemas are constraints. Design the failure path too:
here, any failure means "no guess", the phone falls back to `Other`, and capture is never blocked
— the model is an *enhancement*, never a dependency.

---

## 10. Cache the Expensive Judgement

Merchant descriptors repeat constantly — you shop at the same handful of places. So the model is
asked **once** per novel descriptor; the confirmed answer is stored locally and reused forever:

learned map → (miss) → LLM → (fail) → safe default

Note the ordering of the fallbacks, and that **only a user confirmation writes to the map**. A
guess the user never accepted must not cement itself for all future transactions.

**The Concept:** For expensive, non-deterministic operations over a repeating key space, layer:
deterministic cache first, expensive call for novel inputs, safe default on failure. And be
careful what you write to the cache — learning from unconfirmed output makes a single bad guess
permanent.

---

## 11. Keep the Untestable Layer Stupid

The native Java listener does exactly three things: check the package, skip group summaries,
check the title. Everything else — parsing, dedup, guessing, all UI — lives in TypeScript.

The reason is testability. Native Android code needs a device, a build, an install and a real
notification to exercise. TypeScript needs `npm test`. So the boundary was drawn to put as
little logic as possible on the expensive side, with the file system as the hand-off point (which
also decouples lifetimes: the listener writes while the app process is dead).

**The Concept:** Draw architectural boundaries along *testability* gradients, not just along
technical ones. Whatever sits in the hard-to-test layer should be so simple that reading it is
sufficient verification.

---

## 12. Plan in Decisions, Not Tasks

The feature was planned as a **map of decision tickets** — each one a question whose resolution is
a decision, worked one at a time, with explicit sections for:

- **Fog of war** — questions known to be coming but not yet sharp enough to state precisely.
  Deliberately *not* pre-sliced into fake tasks.
- **Out of scope** — work consciously ruled out, with the reason, so it stays ruled out.

This paid off when reality contradicted the plan. When device data showed a stronger dedup key,
the decision was *revisited and reversed with the reasoning recorded* rather than silently
followed. When Gemini turned out to no longer exist in the codebase, the stale decision was
corrected on the map rather than implemented as written.

**The Concept:** Distinguish "what must be decided" from "what must be built". Decisions that are
recorded with their reasoning can be *revised* when evidence changes; decisions buried in a task
list get followed off a cliff. Write down what you deliberately chose *not* to do — that's the
part everyone forgets and re-litigates later.

---

## Quick Checklist

Before shipping anything in this shape again:

- [ ] Captured real ground-truth data before writing the parser?
- [ ] Does every ambiguous input fail *closed* and *visibly*?
- [ ] Can any heuristic delete or merge user data? (It shouldn't.)
- [ ] If this silently stopped working, how would I find out?
- [ ] Verified on a real device/deployment, not just in the test environment?
- [ ] Do observability and other cross-cutting deps degrade to no-ops?
- [ ] Do the evals discriminate against a deliberately bad baseline?
- [ ] Is the LLM an enhancement with a safe fallback, not a dependency?
- [ ] Are secrets and credential files gitignored *before* the first commit?
