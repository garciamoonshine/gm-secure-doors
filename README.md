# GM Secure Doors

**Coded-key door locks for Minecraft Bedrock — vanilla doors, no padlock, no flicker.**

A locked door is swapped in place for a state-driven custom block that reuses the vanilla door
texture. Because the engine has no hand-open path for a custom block, the client never predicts a
swing — so locking a door doesn't make it flicker or jump. The key *is* the lock: nothing is
dropped, nothing is added, nothing is placed.

![GM Secure Doors](docs/hero.jpg)

[garciamoonshine.com](https://garciamoonshine.com) · [Download the .mcaddon](dist/GM-Secure-Doors-v1.0.0.mcaddon)

---

## What it does

| Action | Result |
|---|---|
| **Sneak + tap** a vanilla door with a Door Key | Locks it. The key gets a code (`K#a1b2c`) if it had none |
| **Tap** a locked door with the matching key | Opens it |
| **Tap** it again | Closes it |
| **Tap** without the key / with a wrong key | `Doors Locked` / `Wrong key`, nothing opens |
| **Sneak + tap** with the matching key | Releases the lock — it becomes a normal door again |
| **Break** a locked door | Refused (creative only) |
| **Blow it up** | Survives — locked doors are filtered out of explosions |
| **Pressure plate / lever** | Can only *close* a locked door, never open it |
| **Coded key + blank key in offhand** | Copies the code to the blank key |

Supported doors: **oak, spruce, birch, jungle, acacia, dark oak and iron doors** (both halves of
double doors are handled, and each door keeps its own hinge side, so a double pair still mirrors).

Deliberately **not** touched: trapdoors, fence gates, and other add-ons' doors (e.g. QB Doors).

## Install

1. Download [`dist/GM-Secure-Doors-v1.0.0.mcaddon`](dist/GM-Secure-Doors-v1.0.0.mcaddon) and open it —
   Minecraft imports both packs.
2. Apply **GM Secure Doors** behaviour + resource pack to your world.
3. Craft a **Door Key**: gold ingot over iron nugget (shape: `A` / `B`), or take one from creative.

Requires Minecraft Bedrock **1.21.90+** (Script API `@minecraft/server 2.0.0`). Tested on a
dedicated server running **1.26.52**.

## How it works

- Each material has two custom blocks (`gm:sdoor_<material>_lower` / `_upper`) with states
  `gm:dir`, `gm:hinge`, `gm:open`, `gm:upper`, `gm:mirror`, `gm:swing`, `gm:omirror`.
- The model is **one geometry with 24 bones**; `bone_visibility` (Molang block-state queries) picks
  the correct panel for the state, and `permutations` supply the matching collision box.
- Locking reads the vanilla door's `minecraft:cardinal_direction`, `door_hinge_bit` and legacy
  integer `direction`, then rebuilds both halves as secure blocks. Releasing writes the recorded
  values back verbatim, so the door returns exactly as it was.
- Blocks carry `tag:door`, so vanilla's double-door pairing logic still sees a door beside a door
  and doesn't flip the neighbour's hinge.

## How hard this was

This add-on took far longer than its size suggests, because Bedrock's door data model is full of
undocumented traps. All of these were found the hard way:

1. **Two direction states.** Doors carry `minecraft:cardinal_direction` *and* a legacy integer
   `direction` (`cardinal=north` is `direction=2`). Restoring only the modern one leaves the door
   rotated, because the renderer uses the integer.
2. **Custom block faces are not what you expect.** A 3-pixel-thick panel needs UVs derived from each
   box's own dimensions; using one UV set for every state stretches the texture into a smear.
3. **The X axis is flipped.** In block-model space, the `+X` box renders on the world's west side.
   Everything was landing one cell-side off until that was measured.
4. **Oak is special.** The oak door *block* is `minecraft:wooden_door` (the item is `oak_door`), and
   its texture is `door_wood_*` rather than `door_oak_*`. Every other material follows
   `door_<material>_*` — and those textures are drawn mirrored relative to oak's, so non-oak doors
   need the opposite closed-pose flip.
5. **Halves disagree.** A door's two halves can hold *different* hinge bits; the **upper** half is
   the one that distinguishes the two doors of a double pair.
6. **Vanilla re-evaluates on rebuild.** Rebuilding a door next to its partner makes the engine
   re-derive the hinge, silently flipping it — so the door's state must be re-asserted after the
   block update settles, or it degrades on every lock/release cycle.
7. **Cancelling the interaction doesn't stop the animation.** `beforeEvents.playerInteractWithBlock`
   cancelling *does* stop the server-side open (verified: the block state stays closed), but the
   client keeps drawing its predicted swing for ~0.5 s because no corrective update is ever sent.
   That is why the lock has to be a custom block rather than a script on top of a vanilla door.
8. **Pack caching.** Bumping a manifest version is not enough: many clients keep serving the cached
   resource pack, so model changes never arrive. Changing the resource pack's **UUID** forces a
   re-download — worth knowing before spending an evening debugging code that was never loaded.

The final appearance rules were calibrated against eight vanilla doors, and are encoded as explicit
lookup tables (`CLOSED_MIRROR`, `OPEN_MIRROR`) plus `swing = hinge`.

## Licence and assets

- Code, JSON and the key icon: **MIT** (see [LICENSE](LICENSE)).
- **No Mojang assets are included.** The resource pack maps its atlases to the *client's own*
  vanilla door textures (`textures/blocks/door_*`), so nothing copyrighted is redistributed. The
  base game must be installed, which it always is.
- Not affiliated with Mojang or Microsoft.

## Compatibility notes

- Other add-ons that replace vanilla doors, or that register their own `*_door` blocks, are not
  affected — this pack only accepts `minecraft:<material>_door` and `minecraft:wooden_door`.
- On a server, apply the packs once; new players receive them automatically.

---

Made by [GarciaMoonshine](https://garciamoonshine.com). Bug reports and pull requests welcome.
