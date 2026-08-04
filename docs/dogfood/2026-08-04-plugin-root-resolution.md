# Dogfood — finding the plugin root, 2026-08-04

No store was touched. This one is about the step every skill runs before it ever
reaches a store, and which until today was written in a way that stopped the
skill dead.

## The bug, measured

All four skills carried this line:

> If `$CLAUDE_PLUGIN_ROOT` is empty, say so and stop; do not guess a path.

On a machine with StoreHand installed from the marketplace, in the environment
of a Bash tool call:

```bash
echo "CLAUDE_PLUGIN_ROOT=[${CLAUDE_PLUGIN_ROOT}]"
# CLAUDE_PLUGIN_ROOT=[]
```

Empty. Followed literally, every skill halts at step one, before the first
query, on a correct installation.

It stayed hidden because the assistant running a skill knows the path it read
the skill file from and quietly routed around the instruction — which is exactly
why it showed up in both demo recordings without ever breaking a run. A user who
follows the written words, or a model that does, gets nothing.

The obvious repair — set it once, up front — does not work either:

```bash
# call 1
export STOREHAND_PROEF=blijft-dit-staan   # → blijft-dit-staan
# call 2
echo "[${STOREHAND_PROEF:-LEEG}]"          # → [LEEG]
```

Shell state does not survive between tool calls. There is nothing to export
into, so the path has to be re-derived or carried across by hand.

## Two routes that do work

| Route | How | Verified |
|---|---|---|
| `PATH` | Claude Code appends `<install-dir>/bin` for every installed plugin, including plugins that ship no `bin/` at all — checked against a second, unrelated plugin on the same machine | Yes |
| Install register | `~/.claude/plugins/installed_plugins.json` records an exact `installPath`; keys are `<plugin>@<marketplace>`, so the marketplace may be named anything | Yes |

Neither is a documented contract, so neither is trusted on its own. Every
candidate must contain `shared/api-version.md` before it is accepted; one that
does not is discarded and the next is tried. `$CLAUDE_PLUGIN_ROOT` is still
tried first, so the day it starts arriving, it wins and the fallbacks go unused.

## What was run

Six environments, against the snippet as shipped:

| # | Situation | Result |
|---|---|---|
| 1 | Variable empty, plugin installed normally | Found via `PATH` |
| 2 | Variable set and valid | Variable wins |
| 3 | A decoy `PATH` entry matching the shape, earlier in the list | Decoy discarded, real install found |
| 4 | Empty home, bare `PATH`, nothing installed | `NOT FOUND`, no guess |
| 5 | Home directory containing a space, register route only | Found |
| 6 | Home directory containing a space, `PATH` route only | Found |

Cases 5 and 6 are in the test suite on purpose. A path with a space is the
classic way a snippet like this works on the author's machine and nowhere else.

## End-to-end, from a simulated install

The fixed tree was copied to
`…/.claude/plugins/cache/storehand/storehand/0.2.1`, a register file was written
pointing at it, and Step 0 was run from the *installed* copy with a stripped
environment. It printed that directory. Substituting it for
`$CLAUDE_PLUGIN_ROOT`, every plugin-owned reference in all four skills was
resolved:

```
20 references — 4 shared notes, 11 GraphQL files, 2 node scripts, 2 templates
alle verwijzingen in alle vier de skills resolveren
```

Nothing missing. One earlier miss in this check was a wrong filename in the
check itself (`orders.graphql`; the skill calls `orders-since.graphql`), not a
fault in the skill — worth recording, because a verification script that is
wrong looks exactly like a product that is broken.

## What this costs the user

One extra command at the start of a skill, whose output is a single line. In
exchange the skill no longer depends on the assistant silently knowing something
the instructions do not say.

## Left open

- The snippet leans on two undocumented behaviours of Claude Code. Both are
  verified and both are guarded by the `shared/api-version.md` check, but a
  future release could change either. If `$CLAUDE_PLUGIN_ROOT` ever starts
  arriving in Bash calls, route 1 takes over and the rest becomes dead weight
  that can be deleted.
- Not yet observed: a project-scoped install (`scope: "project"`). The register
  records `installPath` the same way, so it should resolve, but that is reasoning
  and not a measurement.
