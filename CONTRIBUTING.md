# Contributing to StoreHand

## Ground rules

1. **Every skill is dogfooded before it ships.** A skill that has never run
   against a real store does not get merged. Put the evidence in
   `docs/dogfood/`: the commands, the real output, the date, and what was
   awkward about it.
2. **StoreHand proposes, you approve.** No skill writes to a store without
   showing the change and asking. See `shared/safety.md`.
3. **Never report a number you did not measure.** A failed query is reported as
   a failure, never as a zero.
4. **No telemetry, no network calls** other than the Shopify CLI reaching the
   user's own store.
5. **Queries are files.** Skills use committed `.graphql` files, not queries
   improvised at runtime — a briefing must give the same answer twice.

## Before you open a pull request

```bash
node --test
node scripts/validate-plugin.mjs .
```

Both must pass. CI runs exactly these.

## Adding a skill

```
skills/<skill-name>/
├── SKILL.md              # frontmatter name must equal the directory name
└── queries/*.graphql     # any Shopify queries the skill runs
```

`SKILL.md` frontmatter needs `name` and `description`. Write the description for
the model that has to decide whether to use your skill: say what it does and
when to reach for it. Keep it on **one line** — YAML block scalars (`>` or `|`)
are rejected by the validator, because a silently truncated description makes a
skill impossible to find.

Paths inside a skill are not relative to the user's directory. Anchor anything
belonging to the plugin on `$CLAUDE_PLUGIN_ROOT`; the validator resolves query
paths written that way and rejects ones it cannot resolve.

## Contributor licence agreement

Pull requests require agreeing to the CLA — see [CLA.md](CLA.md). Until the
signing bot is wired up, say in your pull request that you have read CLA.md and
agree to it.
