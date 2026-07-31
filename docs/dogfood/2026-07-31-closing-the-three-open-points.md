# 2026-07-31 — Closing skill #2's three open points

The probe run of 2026-07-30 left three decisions open and one suggested test
unbuilt. All four are now settled, and each change was exercised against the
live store rather than only against fixtures.

## 1. EXPIRED with a future end date — the contradiction is the finding

Decided: neither side wins. When `status` and the dates disagree, that
disagreement is reported as `promo:<title>:status-mismatch`. From outside the
store there is no way to tell which half is wrong, and both readings are worth
a look.

Three shapes count: `EXPIRED` while `endsAt` is still ahead, `SCHEDULED` while
`startsAt` is already past, and `ACTIVE` while `startsAt` is in the future.

**Untested hypothesis, recorded as such:** a discount that hits its usage limit
early may be what produces the first shape. The skill is instructed to report
what it sees and not name this cause. Settling it needs one throwaway discount
— still on the task list.

## 2. SCHEDULED discounts — folded into the existing rules

Decided: no new rule class. Where the problem is identical, the rule now
applies to `SCHEDULED` too. A discount counts as *pending* when it is `ACTIVE`
or `SCHEDULED`:

- pending with no `endsAt` → `no-end`, because an open-ended promo is open-ended
  whether it runs now or starts next week;
- pending and ending within 7 days → `ends-soon`, naming both dates for a
  scheduled one: its whole window can open and close between two weekly runs,
  so this is the only run that will ever mention it.

Rejected: an explicit "starts soon" heads-up. A correctly scheduled promo is
not a defect, and a health check is not a calendar.

## 3. Soft 404 — built in as a calibration probe

Decided: yes, in the skill, as one probe per URL family (max three) fired
before the link check. Rationale: if a theme answers 200 for missing pages,
every URL passes and the check reports "no broken links" having measured
nothing — the silent-failure shape this repo keeps getting burned by.

The verdict is deliberately three-valued. `false` only when every probe
returned a real not-found; `true` when a family answered 200; `null` when a
probe could not complete. An unreachable probe is not a clean bill of health.

**Live proof, including an accident worth keeping.** The first live run was
given the apex domain instead of the canonical `www` host. Every URL came back
`offDomain` — exactly the Amendment 2 failure mode — and the probe returned
`soft404: null` rather than falsely reporting clean. The three-valued design
earned itself back on its first real run, by accident.

Re-run against the canonical host, all three families returned real 404s
(`soft404: false`). The manual negative control done by hand in three previous
runs is now part of the skill.

## 4. The filter test — built, and it found its own silent-success bug

`scripts/verify-filters.mjs`, a maintainer tool (needs a connected store, so
not part of `npm test`; the verdict logic is unit-tested and the CLI around it
is a thin shell).

It leans on the mechanism the earlier probe established: Shopify silently
ignores an unknown *field* and returns everything, while an unknown *value* on
a known field matches nothing. So asking a known field for an impossible value
separates the two — **and does so without needing a store that holds a mix of
data**, which is what made the originally suggested filtered-vs-unfiltered
comparison unusable here.

First live run, against a store with 42 products and zero orders:

| Field | Resource | Result |
|---|---|---|
| `status` | products | **ok** — unfiltered 42, impossible 0 |
| `inventory_quantity` | productVariants | **ok** — unfiltered 250 (probe cap), impossible 0 |
| `financial_status` | orders | inconclusive — no orders |
| `cancelled_at` | orders | inconclusive — no orders |
| `created_at` | orders | inconclusive — no orders |
| `updated_at` | orders | inconclusive — no orders |

The four order filters stay unprovable for the documented reason: with zero
orders, everything and nothing are the same list. The first real order closes
all four in one run — now automatically instead of by hand.

**Two bugs the live run caught in the tool itself:**

1. `shopify store execute --json` already unwraps the GraphQL `data` envelope
   and prints `{ "<resource>": … }`. The parser expected a layer that is not
   there, so all six probes errored.
2. Worse: after six failed calls the script still printed *"Every field that
   could be proven narrows as expected"*. A run that proved nothing read as a
   pass — the exact silent-success shape this script exists to catch elsewhere.
   Fixed: zero proven fields is now an explicit failure, and the summary states
   how many of how many were actually proven.

The second one is the lesson worth keeping: **a tool built to catch silent
success shipped with silent success in it.** It was only visible because the
tool was run for real instead of trusted on green unit tests.
