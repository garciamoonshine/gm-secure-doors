# MCPEDL submission pack — GM Secure Doors v1.0.0

MCPEDL has **no public upload API** (checked: `mcpedl.com/api`, `api.mcpedl.com`, `mcpedl.com/submit`
all redirect; submissions are a logged-in web form). So this must be submitted by hand. Everything
needed is below — copy/paste is all that's left.

Submission page: <https://mcpedl.com/submit-addon/>

---

## Files to upload

| What | Where |
|---|---|
| `.mcaddon` (both packs in one file) | `dist/GM-Secure-Doors-v1.0.0.mcaddon` |
| Stable download URL (mirror, if they ask for a link) | <https://github.com/garciamoonshine/gm-secure-doors/releases/download/v1.0.0/GM-Secure-Doors-v1.0.0.mcaddon> |
| Cover / hero image | `docs/hero.jpg` |
| Icon | `resource_pack/pack_icon.png` |
| Source / repo | <https://github.com/garciamoonshine/gm-secure-doors> |

Suggested screenshots (take in-game, 16:9): one locked door with the key in hand, one open door,
and one showing the `Doors Locked` message.

---

## Title

```
GM Secure Doors — Coded Key Locks for Vanilla Doors
```

## Short description (listing summary)

```
Lock any vanilla door with a coded key. No padlock, no flicker, unbreakable while locked — and it
still looks and swings exactly like the door you placed.
```

## Category / tags

- Category: **Add-On** → *Utility / Security*
- Tags: `security`, `doors`, `locks`, `keys`, `survival`, `script`, `vanilla-friendly`

## Full description (paste as the body)

```markdown
## What it does

Sneak and tap a vanilla door while holding a **Door Key**, and the door locks. The key receives a
short code (`K#a1b2c`) the first time it is used.

- Tap a locked door with the matching key — it opens, tap again and it closes
- Tap without the key, or with the wrong key — `Doors Locked` / `Wrong key`, nothing moves
- Locked doors cannot be broken (creative only) and survive explosions
- Pressure plates and levers can only *close* a locked door, never open it
- Sneak and tap again with the key to release the lock — the door becomes normal again
- Put a coded key in your hand and a blank key in your offhand to copy the code

One key can lock several doors. There is no padlock item and nothing is dropped — the key **is**
the lock.

## Supported doors

Oak, spruce, birch, jungle, acacia, dark oak and iron doors. Both halves of double doors are handled,
and each door keeps its own hinge side, so a double pair still mirrors correctly.

Trapdoors, fence gates and other add-ons' doors (for example QB Doors) are deliberately not touched.

## No flicker, no tricks

A locked door is replaced in place by a state-driven custom block that uses the vanilla door texture.
Because the game has no hand-open path for a custom block, the client never predicts a swing — so
tapping a locked door shows a locked message instead of a door that flips open for half a second.

## Crafting

Door Key: one gold ingot above one iron nugget.

## Requirements

- Minecraft Bedrock **1.21.90+** (uses Script API `@minecraft/server 2.0.0`)
- Tested on a dedicated server running **1.26.52**

## Notes

- No Mojang assets are included: the resource pack points at the game's own vanilla door textures.
- Source code is MIT licensed and available on GitHub:
  https://github.com/garciamoonshine/gm-secure-doors
```

## Changelog entry

```
v1.0.0 — first public release.
Coded Door Keys with K# codes and key copying; seven door materials; double-door pairs with
per-door hinge sides; locked doors unbreakable and blast-proof; redstone can only close; no
Mojang assets bundled.
```

## Checklist before submitting

- [ ] Test the `.mcaddon` in a **fresh world** (not just the dev server) — import, enable both packs, craft a key, lock a door
- [ ] Take 2–3 screenshots
- [ ] Confirm the repo and release links are public (they are: repo 200, asset 201 uploaded)
- [ ] Submit, then paste the resulting MCPEDL URL back here so it can be added to the README
