# Brand assets

## `storehand-logo.png` — placeholder, meant to be replaced

The README points at this one file. Drop your own artwork here under the same
name and the header updates everywhere it is used; nothing else needs editing.

What the file has to survive:

| | |
|---|---|
| Size | 240 × 240, square |
| Format | PNG, transparent or white background |
| Weight | Under 2 MB (Product Hunt's limit; ours is far below it) |
| Legibility | It ends up at 24 px as a favicon and around 96 px in the README. Test it small before deciding — fine detail and any lettering disappear first |

Keep it monochrome. The rest of this project is black on white, the terminal it
runs in is monochrome, and a mark that needs colour to work is a mark that
breaks in half the places it lands.

The README references the file through an absolute `raw.githubusercontent.com`
URL rather than a relative path, because `assets/` is not shipped in the npm
tarball — a relative link renders on GitHub but breaks on the npm package page.
