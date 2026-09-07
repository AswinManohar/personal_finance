# Building the APK, and pointing capture at your bank

Two things this covers, because in practice they are the same job: getting Cashflow onto your own
phone as an APK, and making the notification capture read *your* bank instead of mine.

Capture as shipped is hard-wired to one card: Advanzia's Android app, its German wording, euro
amounts. That is not a limitation of the design — the native listener is deliberately dumb and all
the real reading happens in one testable TypeScript module — but it does mean a fork has four
specific places to edit before a single transaction lands in the inbox.

---

## 1. Build the APK

### What you need

| Tool | Version | Why |
|---|---|---|
| Node | 20+ | Vite build |
| JDK | **21** | Capacitor 7 compiles at `JavaVersion.VERSION_21`; JDK 17 fails the build |
| Android SDK | platform **36**, build-tools 36 | `compileSdkVersion = 36` in `android/variables.gradle` |
| Gradle | bundled | The wrapper pins 8.11.1, AGP 8.9.1 — don't use a system Gradle |

The SDK comes either with Android Studio or with the standalone `cmdline-tools`. The app targets
SDK 35 and runs on API 23+ (`android/variables.gradle`).

### Point Gradle at your SDK

`android/local.properties` is gitignored, so it does not exist in a fresh clone. Create it:

```properties
sdk.dir=/home/you/Android/Sdk
```

`npm run android:run` additionally wants `ANDROID_HOME` for `adb` and the emulator; the script
defaults it to `$HOME/Android/Sdk` if you have not exported one.

### Assemble it

```bash
npm install
npm run android:apk
```

That is two steps behind one name. `android:apk` runs `android:sync` first, which is
`vite build` followed by `npx cap sync android` — the web bundle in `dist/` is *copied into* the
APK, not loaded from a server. Then Gradle assembles:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it over USB:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The debug APK is signed with the local debug keystore Android generates for you, which is enough to
sideload onto your own phone. There is no release signing config in `android/app/build.gradle`, so
`assembleRelease` produces an *unsigned* APK the phone will refuse — see below if you want one.

Other useful entry points:

```bash
npm run android:open   # open the project in Android Studio
npm run android:run    # build, sync, install and launch on a connected device
```

### Which backend the APK talks to

Inside the APK the WebView's origin is `https://localhost`, where no backend exists, so a relative
`/api/...` fetch would resolve to the WebView itself. `services/apiBase.ts` rewrites those to a real
host — the Railway deployment by default, or `VITE_API_BASE_URL` if you set it at build time:

```bash
VITE_API_BASE_URL=http://192.168.1.20:8000 npm run android:apk
```

Two things are *not* env vars and will point at my project until you change them in source:

- **Supabase URL and anon key** — literals in `services/supabaseService.ts`. They are compiled in
  deliberately (the anon key is a public credential; row-level security is what scopes access), but
  a fork must swap in its own project.
- **The default API host** — `RAILWAY_API` in `services/apiBase.ts`.

Merchant guessing is a backend call (`/api/merchants/guess`), so a fork needs its own FastAPI
instance with `OPENAI_API_KEY` set. Without one the app still captures; the review sheet just
prefills `Other` with the raw descriptor.

### A signed release build

Only worth it if you want a non-debug APK. Generate a keystore, then add a `signingConfigs` block
to `android/app/build.gradle` and reference it from `buildTypes.release`. `*.jks`, `*.keystore` and
`keystore.properties` are all gitignored, on purpose and in advance — the release key is what ties
the app to its Google OAuth client, and committing it would put the ability to sign updates for
this `applicationId` into the repo's history.

Be aware of what changing the signing certificate costs: the Android OAuth client is registered
against `com.aswinmanohar.cashflow` **plus the signing cert's SHA-1**. A fork with its own keystore
(or its own `appId`) needs its own OAuth client — see `GOOGLE_AUTH_SETUP.md` — or Google sign-in
will fail on device while working fine on the web.

---

## 2. Turn on notification access

Nothing is captured until Android is told to let the listener bind. The onboarding lives in the
Expenses screen, inside the capture card, and only appears when something is actually wrong:

1. **Notification access** — "Turn on notification access" opens the system settings list; find
   Cashflow and enable it. This is the one that matters; without it the listener never runs.
2. **Post notifications** — "Allow notifications" grants `POST_NOTIFICATIONS`. Without it capture
   still works, but the phone cannot tell you a transaction arrived; items only show up in the inbox.
3. **Battery: Unrestricted** — hardening, not a requirement. It stops Android killing the listener
   in the background.

Notification access is revocable from system settings with no callback to the app, so the status is
re-read on every resume. "Last captured …" in the inbox is the evidence that it is still working —
a broken capture and a quiet month look identical otherwise.

---

## 3. Make it read your bank

Ground truth first. Trigger a real transaction notification, then dump it off the phone:

```bash
adb shell dumpsys notification --noredact | grep -B5 -A25 'your.bank.package'
adb shell pm list packages | grep -i bank    # if you don't know the package name
```

You want three things from that dump: the **package name**, the exact `android.title`, and the exact
`android.bigText`. Everything below is fitting the code to those three strings.

### 3a. The native gate — `android/app/src/main/java/com/aswinmanohar/cashflow/AdvanziaNotificationListener.java`

This class applies three cheap checks and then writes the raw text to a queue. It does no parsing,
because it has to run while the WebView is dead and is effectively untestable.

| Constant | Change it to |
|---|---|
| `ADVANZIA_PACKAGE` | your bank app's package |
| `TRANSACTION_TITLE` | the exact title every transaction notification carries |
| `EURO_AMOUNT` | your currency's shape, if not `11,89 €` |

The group-summary check should stay. Android synthesises a titleless, textless summary once an app
posts enough notifications, and without that guard it lands in the inbox as a bogus unparsed item
every time.

### 3b. The parser — `utils/advanziaNotification.ts`

This is where the actual reading happens, and it is the most dangerous module in the feature: a
wrong reading here invents an expense that never happened, or books a refund as a charge. It fails
closed in three tiers, and a rewrite should keep that shape.

- **`REJECT_MARKERS`** (tier 0) — words that mean *this is not a charge*: declined, refunded,
  reversed. The shipped German list is explicitly provisional guesswork; replace it with your
  bank's real wording. A miss here is the worst failure mode in the feature, because a refund read
  as a payment is a plausible-looking expense nobody questions.
- **`AMOUNT_PATTERN` / `parseGermanAmount`** — German decimal rules, hard-refusing anything else.
  **If your bank writes `1,234.56`, you must change this.** Read with German rules that string
  becomes `1.23456` — an expense wrong by a factor of 1000 that nothing downstream would catch.
- **`STRICT_PATTERN`** (tier 1) — the exact known sentence, yielding amount, card ending and
  merchant. Note the greedy merchant group and anchored suffix: real merchant strings contain
  commas and get truncated mid-word by the acquirer, so punctuation must never act as a delimiter.
- **`LOOSE_AMOUNT` / `LOOSE_CARD` / `LOOSE_MERCHANT`** (tier 2) — independent fragments, so a
  reworded sentence still yields parts. Anything that lands here is flagged "needs checking" and
  cannot be confirmed without a human opening it.

### 3c. Keep the two copies in step

Two things are duplicated between Java and TypeScript on purpose, because the native side has to
make the call with the WebView dead:

- `TRANSACTION_TITLE`
- the euro-amount regex (`EURO_AMOUNT` in Java, `looksTransactional` in TS)

Nothing enforces this. Change one, change the other, or capture quietly half-breaks.

### 3d. Prove it before you trust it

```bash
npm test -- advanziaParser        # the parser's own suite
npm test                          # the rest, including the inbox
```

`tests/frontend/advanziaParser.test.ts` is where new sentences belong — one case per real
notification you have seen, including declines and refunds. For an end-to-end pass, put your
samples in `evals/synthetic_notifications.json` and run:

```bash
uv run python -m evals.run_synthetic     # needs OPENAI_API_KEY
```

That shells out to the *shipped* TypeScript gate and parser, then feeds each surviving descriptor to
the real merchant agent and prints what the review sheet would be prefilled with. If it disagrees
with the app, the app is what changed.

---

## 4. Change the prompt

The LLM is doing one narrow job: turning an acquirer descriptor (`DM DROGERIE SAGT DANKE`,
`REWE Bonn, Friedenspla` — truncated mid-word at 22 characters) into a name a person would write and
a category. It never sees an amount and never decides whether something is an expense.

The prompt is `_INSTRUCTIONS` in **`api/routers/merchants.py`**. It runs on the *backend*, which is
the useful part: editing it needs a backend redeploy, not a new APK. Nothing about the guess is
persisted, and the phone remembers each answer locally, so the endpoint is only hit once per unseen
merchant.

Rewrite it for your own locale and card habits — the shipped text is explicitly about European
uppercase acquirer strings. Keep the last two sentences in spirit if not in wording:

> If you cannot tell what the merchant is, echo a tidied version of the descriptor as the name and
> use category Other rather than inventing a business. Never guess an amount, a date, or anything
> not present.

An LLM asked to identify a business will happily invent one, and a confabulated merchant name on a
real charge is worse than the raw string.

### Changing the categories

`output_type=MerchantGuess` is what makes an unlisted category structurally impossible — the model
cannot answer with a free-text apology, and any run that cannot produce a valid `MerchantGuess`
fails loudly as a 502. That guarantee is only worth anything if all three declarations agree:

1. `CATEGORIES` — the tuple interpolated into the prompt, `api/routers/merchants.py`
2. `MerchantGuess.category` — the `Literal[...]`, same file, a few lines up
3. `ExpenseCategory` — the enum in `types.ts`, which the phone validates the response against

The client re-checks the category against its own enum and treats a mismatch as "no guess", so
adding a category to the backend alone means the new one is silently discarded on the phone.

### Model and cost

```bash
OPENAI_MODEL=gpt-5.1     # default; any Pydantic AI OpenAI model id
OPENAI_API_KEY=sk-...    # required, or /api/merchants/guess returns 503
LOGFIRE_TOKEN=...        # optional tracing; without it instrumentation is a no-op
```

Every failure — no key, offline, rate limit, provider outage — is caught on the phone and falls back
to `Other` with the raw descriptor. It costs the prefill, never the capture.

### Judging a prompt change

Unit tests stub the model out entirely, so they say nothing about whether the guesses are any good.
The eval suite does the other half:

```bash
uv run python -m evals.merchant_guess    # costs money; needs OPENAI_API_KEY
```

It scores the real agent against real descriptors, with category expectations as *accepted sets*
rather than single blessed answers — dm is a drugstore, which a reasonable person files under Food
or Other. With `LOGFIRE_TOKEN` set the runs stream to Logfire, so a prompt or model change can be
compared against the previous run instead of judged from one console dump.
