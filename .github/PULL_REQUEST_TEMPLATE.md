<!--
Thanks for this. The checklist below is the house style, not bureaucracy — each
line is there because skipping it once cost us something. See CONTRIBUTING.md.
-->

## What this changes

<!-- One paragraph. What was wrong or missing, and what it does now. -->

## How you know it works

<!--
Evidence, not intent. Commands and real output beat "tested locally".
A skill that has never run against a real store does not get merged — put the
run in docs/dogfood/ and link it here.
-->

## Checklist

- [ ] No real store data anywhere in the diff — no `*.myshopify.com` handle, shop id, gid, customer name, email or identifying figure
- [ ] `node --test` passes
- [ ] `node scripts/validate-plugin.mjs .` passes
- [ ] `git config core.hooksPath hooks` is set, so the pre-commit scan ran
- [ ] If a skill changed: a dogfood note in `docs/dogfood/` with the commands and the real output
- [ ] If a skill can now write to a store: it still proposes into a file the user edits, and applies only what survived
- [ ] Queries live in committed `.graphql` files, not improvised at runtime
- [ ] Anything unverified is written down as unverified, not as fact
