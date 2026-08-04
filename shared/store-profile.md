# The store profile

Every StoreHand skill reads the store profile before it does anything. The
profile lives in `.storehand/` in the directory the user is working in. One
directory per store.

```
your-store/
└── .storehand/
    ├── store.md      # what Claude needs to understand
    ├── store.yaml    # hard numbers
    └── state.json    # written by skills, git-ignored
```

## `store.md` — prose

Brand voice, audience, house rules, and anything a human would tell a new
employee on day one. Free-form markdown, because the reader is a language model.

## `store.yaml` — numbers

Machine-readable settings. Required keys:

| Key | Meaning |
|---|---|
| `store` | The `*.myshopify.com` domain |
| `timezone` | IANA timezone, e.g. `Europe/Amsterdam` — decides where "today" starts |
| `currency` | ISO code used in reports |
| `language` | The language the store sells in, as an ISO code (`nl`, `en`, `de`). **Everything StoreHand writes is written in this language, and anything it finds in another one is a finding.** Declared here on purpose: inferring it from what is already in the store keeps a supplier's English product names English forever |
| `inventory.low_stock_threshold` | A variant at or below this count is an alert |
| `pricing.min_margin_percent` | Never propose a price below this margin |
| `competitors` | List of URLs for the price watch skill; may be empty |

If a required key is missing, tell the user which one and point them at
the `storehand-setup` skill. Do not guess a default.

## `state.json` — skill bookkeeping

Written by skills, never by hand, and git-ignored. Current keys:

| Key | Written by | Meaning |
|---|---|---|
| `lastBriefingAt` | `daily-store-briefing` | ISO timestamp of the last successful briefing |
| `healthCheck` | `store-health-check` | `lastRunAt` (ISO timestamp of the last successful check) and `findings` (list of `{ id, firstSeenAt }`) so the next run can say "new" and "open since" |

Skills share this file: read the whole object, replace only your own key, and
write the whole object back — a skill that rewrites the file from scratch
erases another skill's memory.

A skill updates `state.json` **only after it has delivered a successful report**.
A failed run must not move the marker forward, or the next run silently skips
the data the failed run never saw.
