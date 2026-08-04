---
name: daily-store-briefing
description: Open the day with a short read-only briefing on a Shopify store — new orders and revenue since the last briefing, payments that need attention, cancellations and refunds, and variants below the stock threshold. Use when the user asks how the store is doing, what happened overnight, for a morning or daily briefing, or for new orders since yesterday.
---

# Daily store briefing

One short report, every morning, from four read-only queries. Writes nothing to
the store, ever.

**Two kinds of path, do not mix them up.** Files belonging to this plugin —
`shared/safety.md`, `shared/store-profile.md`, `shared/api-version.md` and the
`queries/` directory — live under the plugin's install directory. The store
profile (`.storehand/`) lives in the user's working directory.

## Step 0 — Find the plugin

`$CLAUDE_PLUGIN_ROOT` is empty in the environment of a Bash tool call. That is
measured, not assumed; the working routes and the reasoning are in
`shared/plugin-root.md`. Run this once, before anything else:

```bash
ROOT=$( {
  printf '%s\n' "${CLAUDE_PLUGIN_ROOT:-}"
  printf '%s' "$PATH" | tr ':' '\n' | sed -n 's|/bin$||p' | grep -E '/storehand/[^/]+$'
  node -e 'const fs=require("fs"),os=require("os"),p=require("path");try{const j=JSON.parse(fs.readFileSync(p.join(os.homedir(),".claude","plugins","installed_plugins.json"),"utf8"));for(const[k,v]of Object.entries(j.plugins||{}))if(k.split("@")[0]==="storehand"&&v[0]&&v[0].installPath){console.log(v[0].installPath);break}}catch{}' 2>/dev/null
} | while IFS= read -r c; do
  [ -n "$c" ] && [ -f "$c/shared/api-version.md" ] && { printf '%s' "$c"; break; }
done )
[ -n "$ROOT" ] && echo "StoreHand plugin root: $ROOT" || echo "StoreHand plugin root NOT FOUND"
```

Shell state does not survive between tool calls, so there is nothing to export
into: take the path it printed and **substitute it literally** wherever these
instructions write `$CLAUDE_PLUGIN_ROOT`. Never guess it.

Printed `NOT FOUND`? Stop, and tell the user to reinstall the plugin with
`/plugin marketplace add storehand/storehand`.

Read `$CLAUDE_PLUGIN_ROOT/shared/safety.md` and
`$CLAUDE_PLUGIN_ROOT/shared/store-profile.md` before you start.

## Step 1 — Load the profile

Read `.storehand/store.yaml` from the working directory. You need `store`,
`timezone`, `currency` and `inventory.low_stock_threshold`.

- **No `.storehand/`:** tell the user to run the `storehand-setup` skill and
  stop. Do not ask for the domain and carry on — the profile is what makes the
  other skills work too.
- **A required key is missing:** name the key, point at `storehand-setup`, stop.

## Step 2 — Work out the period

Read `.storehand/state.json`:

- **`lastBriefingAt` present and readable** → the period starts there.
- **File absent** → this is a first run. The period starts 24 hours ago; say so
  in the report ("first briefing, showing the last 24 hours").
- **File present but unreadable or missing `lastBriefingAt`** → this is a
  failure, not a first run. Say so explicitly: the marker is damaged, you are
  falling back to 24 hours, and **anything older than that is unreported**. Do
  not label it a first briefing — that hides a gap of unknown size.

Format the boundary as an ISO 8601 UTC timestamp. Interpret day boundaries in
the profile's `timezone`, not in UTC and not in yours.

## Step 3 — Run the four queries

All four are read-only. **Never add `--allow-mutations`.**

The Shopify search filters contain single quotes, colons and `<=`. Inlining that
in a shell string is how you end up with a query that returns nothing and a
report that calls it a quiet day. **Write the variables to a file and pass
`--variable-file`.** Never build them inline.

Check `$CLAUDE_PLUGIN_ROOT/shared/api-version.md` first. If it names a pinned
version, add `--version <handle>` to every call below. If it says the version is
not pinned, leave the flag out — the CLI then uses the latest stable version.

Make a scratch directory once, then substitute `<since>` (Step 2) and
`<threshold>` (Step 1) with real values as you write each file:

```bash
V="$(mktemp -d)"
```

Shell state does not survive between tool calls. Either set `V` again in every
call below, or pick one fixed scratch path and reuse it — an unset `V` turns
`"$V/orders.json"` into `/orders.json`, which fails or writes to the wrong
place without ever mentioning `V`.

```bash
cat > "$V/orders.json" <<'JSON'
{"query":"created_at:>'<since>'","first":50}
JSON
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/daily-store-briefing/queries/orders-since.graphql" \
  --variable-file "$V/orders.json"
```

```bash
cat > "$V/payments.json" <<'JSON'
{"query":"financial_status:pending OR financial_status:unpaid OR financial_status:expired","first":50}
JSON
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/daily-store-briefing/queries/payment-problems.graphql" \
  --variable-file "$V/payments.json"
```

```bash
cat > "$V/cancellations.json" <<'JSON'
{"cancelled":"cancelled_at:>'<since>'","refunded":"updated_at:>'<since>' AND (financial_status:refunded OR financial_status:partially_refunded)","first":50}
JSON
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/daily-store-briefing/queries/cancellations-and-refunds.graphql" \
  --variable-file "$V/cancellations.json"
```

```bash
cat > "$V/stock.json" <<'JSON'
{"query":"inventory_quantity:<=<threshold>","first":50}
JSON
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/daily-store-briefing/queries/low-stock.graphql" \
  --variable-file "$V/stock.json"
```

The quoted heredoc (`<<'JSON'`) stops the shell touching the contents, so the
filter values arrive exactly as written. Read each command's output before moving
on; an error here must never become a zero in the report.

Progress lines with terminal escape codes go to stderr — and so does the
CLI's error box when a call fails, while stdout stays empty. `2>/dev/null`
therefore hides errors, not just noise: only silence stderr once a command
has proven to work. Check the exit code, and treat empty stdout as a failed
call, never as a quiet result.

## Step 3b — Re-check what came back

**Shopify silently ignores filter terms it does not recognise, and its search
index lags behind the data.** Verified on a live store: a misspelled field
returns everything unfiltered without an error, and `inventory_quantity:<=5`
returned a variant holding 24 units. Treat every filter as a way to fetch less,
never as proof.

Before anything reaches the report:

- **Orders, payments, cancellations, refunds:** drop records whose `createdAt`
  (or `cancelledAt`, or `updatedAt`) falls outside the period from Step 2.
- **Low stock:** drop variants whose `inventoryQuantity` is above the threshold
  from `store.yaml`.

If more than a couple of records fail this re-check, say so in the report. It
means the filter is not working, and a filter that lets wrong records through is
also capable of hiding right ones you never saw.

If `pageInfo.hasNextPage` is true, say the list was truncated. Do not paginate —
a briefing that needs more than 50 orders needs a report, not a briefing.

## Step 4 — Report

Fixed shape, in this order:

1. **One headline line**, counts and money only:
   > 3 new orders (€412) · 1 failed payment · 2 variants low · no cancellations
2. **What needs attention**, only the categories that are non-empty. Name orders
   by their `name` (`#1042`), not their GraphQL id. Mention the sales channel
   (`sourceName`) only when orders came from more than one — otherwise it is
   noise.
3. **Suggested actions** — concrete and few. Never act on them.

Keep it short enough to read with a coffee. Detail on request.

**When a category is long, summarise instead of listing.** A young or seasonal
store can easily have fifty variants under the threshold; printing all of them
buries the two things that actually changed. Above roughly fifteen, give the
shape — how many are at zero, how many are merely low, across how many products —
and offer the full list on request. Verified on a real store: a flat threshold
produced 49 alerts across 14 products, which is a wall of text, not a briefing.

If a list was truncated (`hasNextPage`), say the real number is higher rather
than reporting the count you happened to fetch.

## Step 5 — Update the marker

**Only after a successful report**, update `.storehand/state.json`: read the
file first, keep every key you did not write — other skills keep their own
memory in this same file — replace only `lastBriefingAt`, and write the whole
object back. If the file could not be parsed, say so and do not write it.

```json
{ "lastBriefingAt": "<the ISO timestamp of this run>" }
```

Every key you did not write goes back exactly as you found it.

If any query failed, leave the file untouched. Moving the marker after a partial
run means tomorrow silently skips whatever today never saw.

## Errors — never report a number you did not measure

| Situation | What to do |
|---|---|
| `shopify` not found or older than 4.5 | Show the install or `shopify upgrade` step, stop |
| Not authenticated / token expired | Show the exact `shopify store auth --store … --scopes read_orders,read_products,read_inventory,read_discounts,read_online_store_navigation` line, stop |
| One query fails | Report the categories that succeeded and state clearly which one failed, with the literal error |
| A field does not exist (API version drift) | Show the error, name the query file, say the query needs updating — see `$CLAUDE_PLUGIN_ROOT/shared/api-version.md` |
| Step 0 printed `NOT FOUND` | Stop and say the plugin root could not be resolved. Tell the user to reinstall. Never guess where the query files are |
| All queries fail | Report the failure. Never "nothing happened today" |

A quiet day and a broken integration look identical in a report that hides
errors. Never let them.
