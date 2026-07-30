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
when to reach for it.

## Contributor licence agreement

Pull requests require signing the CLA — see [CLA.md](CLA.md). A bot handles it
on your first pull request.
