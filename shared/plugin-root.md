# Finding the plugin root

Every skill needs the absolute path to this plugin's own directory: the shared
notes, the `queries/`, `mutations/`, `scripts/` and `templates/` folders all
live there. The store profile (`.storehand/`) does not — that belongs to the
user's working directory, and mixing the two up is the single easiest way to
read the wrong file.

## The problem

The obvious answer is `$CLAUDE_PLUGIN_ROOT`. It does not work.

**In the environment of a Bash tool call the variable is empty.** That is
measured, not assumed — on a machine with StoreHand installed from the
marketplace:

```bash
echo "CLAUDE_PLUGIN_ROOT=[${CLAUDE_PLUGIN_ROOT}]"
# CLAUDE_PLUGIN_ROOT=[]
```

Until 2026-08-04 all four skills said *"if it is empty, say so and stop; do not
guess a path"*. Taken literally that halts every skill at step one. It did not
show up sooner because the assistant running the skill knows where it read the
skill file from and quietly worked around it — but a user following the written
instruction, or a stricter model, gets nothing.

Exporting it once does not help either, because shell state does not survive
between tool calls:

```bash
# call 1
export CLAUDE_PLUGIN_ROOT=/some/path
# call 2
echo "[${CLAUDE_PLUGIN_ROOT}]"   # []
```

## The routes that do work

Two, both verified on 2026-08-04:

1. **`PATH`.** Claude Code appends `<install-dir>/bin` to `PATH` for every
   installed plugin — including plugins that ship no `bin/` directory at all
   (checked against a second, unrelated plugin). Strip the `/bin` and you have
   the install directory.
2. **The install register.** `~/.claude/plugins/installed_plugins.json` records
   an exact `installPath` per plugin. Its keys are `<plugin>@<marketplace>`, so
   match on the part before the `@`; the marketplace may be named anything.

Neither is a documented contract, so neither is trusted on its own. Each
candidate is **verified** before it is used: the directory must actually contain
`shared/api-version.md`. A path that does not is discarded and the next
candidate is tried. This is the same rule the skills apply to store data — never
report something you did not check.

`$CLAUDE_PLUGIN_ROOT` is still tried first, so the day Claude Code does pass it
through, that becomes the answer and the fallbacks go unused.

## The snippet

Skills carry this block verbatim. `tests/plugin-root.test.mjs` asserts all four
copies are byte-identical, so they cannot drift apart:

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

Read line by line: try the variable, then every `PATH` entry that looks like a
StoreHand install, then the register; keep the first candidate that proves
itself; say so plainly when none does.

Paths are passed newline-delimited and read with `IFS= read -r`, so an install
under a home directory with a space in it (`/Users/John Smith/…`) survives.
That case is covered by a test, because it is the classic way a snippet like
this breaks on someone else's machine and never on yours.

## Why the skills still write `$CLAUDE_PLUGIN_ROOT`

Because shell state is gone by the next tool call, there is nothing to export
into. The skill runs the snippet once, reads the absolute path off the output,
and substitutes that literal path wherever the instructions write
`$CLAUDE_PLUGIN_ROOT`. Keeping the placeholder spelled that way means the query
paths stay readable as templates, and `scripts/validate-plugin.mjs` can go on
resolving them against the repository root to prove every referenced file
exists.

## When it prints NOT FOUND

Stop. Do not guess, do not search the disk. Tell the user the plugin directory
could not be located and to reinstall:

```
/plugin marketplace add storehand/storehand
```
