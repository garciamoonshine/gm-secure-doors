// GM Secure Doors - coded door keys built on the QB Doors mechanism.
// Locking a door replaces both halves with state-driven secure door blocks (gmsd:door_*).
// Their geometry and open state are block states that ONLY this script writes, and the engine
// has no hand-open path for a custom block - so the client can never predict a swing and there
// is nothing to flicker. Unlocking puts the original vanilla door back.

import { world, system, ItemStack, BlockPermutation } from "@minecraft/server";

const ROT_KEY = "gmsd:rot";
const CW = { north: "east", east: "south", south: "west", west: "north" };
const ROT_DEFAULT = 0;   // measured: vanilla cardinal=north puts the panel on the SOUTH edge,
                          // our model puts "north" on the EAST edge -> +90 lines them up
function rotOf() {
    try { const v = world.getDynamicProperty(ROT_KEY); return typeof v === "number" ? v : ROT_DEFAULT; } catch { return ROT_DEFAULT; }
}
function rotate(dir, deg) {
    const steps = ((Math.round(deg / 90) % 4) + 4) % 4;
    let d = dir;
    for (let i = 0; i < steps; i++) d = CW[d] ?? d;
    return d;
}

const NS = "gmsd";
const KEY_ID = "gmsd:door_key";
const STORE = "gmsd:locks";
const TUNE = "gmsd:tune";        // { "<pos>": {mirror, swing} } - kept forever, survives release
const MATS = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "iron"];
const DIRS = ["north", "east", "south", "west"];
const NUM2DIR = { 0: "south", 1: "west", 2: "north", 3: "east" };  // measured on the real doors
const DIR2NUM = { south: 0, west: 1, north: 2, east: 3 };  // measured: cardinal=north == int 2

function store() {
    try {
        const r = world.getDynamicProperty(STORE);
        const o = r ? JSON.parse(r) : {};
        return o && typeof o === "object" ? o : {};
    } catch { return {}; }
}
function save(o) { try { world.setDynamicProperty(STORE, JSON.stringify(o)); } catch { } }
function readTune() {
    try { const r = world.getDynamicProperty(TUNE); const o = r ? JSON.parse(r) : {}; return o && typeof o === "object" ? o : {}; }
    catch { return {}; }
}
const writeTune = (o) => { try { world.setDynamicProperty(TUNE, JSON.stringify(o)); } catch { } };
const posKey = (b) => `${Math.floor(b.location.x)},${Math.floor(b.location.y)},${Math.floor(b.location.z)}|${b.dimension.id}`;
/** stable key for a door: always its LOWER half, whichever half was tapped */
function doorTuneKey(block) {
    const lo = (st(block, "upper_block_bit") === true || st(block, NS + ":upper") === true) ? block.below() : block;
    return posKey(lo || block);
}
function keyOf(b) {
    return `${b.dimension.id}|${Math.floor(b.location.x)},${Math.floor(b.location.y)},${Math.floor(b.location.z)}`;
}

const st = (b, n) => { try { return b.permutation.getState(n); } catch { return undefined; } };
const mine = (b) => { try { return b.typeId.startsWith(NS + ":door_"); } catch { return false; } };
// Bedrock quirks: the oak door BLOCK is "minecraft:wooden_door" (the ITEM is oak_door).
const BLOCK2MAT = { "minecraft:wooden_door": "oak" };
function matToBlock(mat) {
    return mat === "oak" ? "minecraft:wooden_door" : `minecraft:${mat}_door`;
}
function vanillaMat(b) {
    try {
        const t = b.typeId;
        if (BLOCK2MAT[t]) return BLOCK2MAT[t];
        if (!t.startsWith("minecraft:") || !t.endsWith("_door")) return undefined;
        const m = t.slice(10, -5);
        return MATS.includes(m) ? m : undefined;
    } catch { return undefined; }
}
function minePair(b) {
    const upper = st(b, NS + ":upper") === true;
    const other = upper ? b.below() : b.above();
    return upper ? [other, b] : [b, other];
}
function vanillaPair(b) {
    const upper = st(b, "upper_block_bit") === true;
    const other = upper ? b.below() : b.above();
    return upper ? [other, b] : [b, other];
}
function vanillaDir(b) {
    // modern Bedrock doors use minecraft:cardinal_direction ("north"/"east"/...).
    // the old integer "direction" state is only a fallback.
    const cd = st(b, "minecraft:cardinal_direction");
    if (DIRS.includes(String(cd))) return String(cd);
    const d = st(b, "direction");
    if (DIRS.includes(String(d))) return String(d);
    return NUM2DIR[d] ?? "north";
}

function toSecure(vanillaBlock, meta) {
    const [low, up] = vanillaPair(vanillaBlock);
    const dir = vanillaDir(low);
    const hinge = st(low, "door_hinge_bit") === true;
    const ids = [];
    const targets = [low, up];
    for (let i = 0; i < targets.length; i++) {
        const half = i === 0 ? "lower" : "upper";
        const target = targets[i];
        try {
            let p = BlockPermutation.resolve(`${NS}:door_${meta.mat}_${half}`);
            try { p = p.withState(NS + ":dir", dir); } catch { }
            try { p = p.withState(NS + ":hinge", hinge); } catch { }
            try { p = p.withState(NS + ":open", false); } catch { }
            try { p = p.withState(NS + ":upper", half === "upper"); } catch { }
            target.setPermutation(p);
            ids.push(keyOf(target));
        } catch (e) { console.warn("[GMSD] toSecure failed: " + e); }
    }
    return ids;
}
/** work out the original door from the block itself when a legacy record is incomplete */
function resolveMeta(block, meta) {
    const out = { ...(meta || {}) };
    // material from our own block id: gmsd:door_<mat>_<half>
    if (!out.mat) {
        const m = /^gmsd:door_(.+)_(?:lower|upper)$/.exec(block.typeId);
        if (m) out.mat = m[1];
    }
    if (!out.mat) {
        for (const k of MATS) if (block.typeId.includes("_" + k + "_")) { out.mat = k; break; }
    }
    if (!out.cardinal) out.cardinal = st(block, NS + ":dir") ?? "north";
    return out;
}
function toVanilla(secureBlock, metaIn) {
    const meta = resolveMeta(secureBlock, metaIn);
    if (!meta.mat) { console.warn("[GMSD] release failed: unknown material for " + secureBlock.typeId); return false; }
    const [low, up] = minePair(secureBlock);
    const dir = meta.cardinal ?? st(low, NS + ":dir") ?? "north";
    // trust the record: vanilla re-evaluates a door's hinge when it is rebuilt next to its
    // double-door partner, which is what silently degraded the state on every release
    const hinge = meta.hinge === true;
    const targets = [low, up];
    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        try {
            let p = BlockPermutation.resolve(matToBlock(meta.mat));
            const back = meta.cardinal ?? dir;
            try { p = p.withState("minecraft:cardinal_direction", back); } catch { }
            // restore the door's ORIGINAL legacy integer (Bedrock renders from this one)
            if (meta.legacyDir !== undefined) { try { p = p.withState("direction", meta.legacyDir); } catch { } }
            else { try { p = p.withState("direction", DIR2NUM[back]); } catch { } }
            try { p = p.withState("door_hinge_bit", hinge); } catch { }
            try { p = p.withState("upper_block_bit", i === 1); } catch { }
            try { p = p.withState("open_bit", false); } catch { }
            target.setPermutation(p);
        } catch (e) { console.warn("[GMSD] toVanilla failed: " + e); }
    }
    system.runTimeout(() => {
        try {
            const pair = minePair(secureBlock);
            for (let i = 0; i < pair.length; i++) {
                const target = pair[i];
                if (!isVanillaDoor(target)) continue;
                let q = target.permutation;
                try { q = q.withState("minecraft:cardinal_direction", meta.cardinal ?? dir); } catch { }
                if (meta.legacyDir !== undefined) { try { q = q.withState("direction", meta.legacyDir); } catch { } }
                try { q = q.withState("door_hinge_bit", hinge); } catch { }
                try { q = q.withState("upper_block_bit", i === 1); } catch { }
                try { q = q.withState("open_bit", false); } catch { }
                target.setPermutation(q);
            }
            console.warn(`[GMSD] re-asserted ${meta.mat} cardinal=${meta.cardinal} legacy=${meta.legacyDir} hinge=${hinge}`);
        } catch { }
    }, 2);
}
function setOpen(secureBlock, open) {
    for (const b of minePair(secureBlock)) {
        try { b.setPermutation(b.permutation.withState(NS + ":open", open)); } catch { }
    }
}

const slot = (pl, w) => { try { return pl.getComponent("minecraft:equippable")?.getEquipmentSlot(w); } catch { return undefined; } };
const codeOf = (it) => {
    if (!it) return undefined;
    try { return (it.getLore() || []).find((l) => typeof l === "string" && l.startsWith("K#")); } catch { return undefined; }
};
function heldKey(pl) {
    const s = slot(pl, "Mainhand");
    if (!s || !s.hasItem()) return undefined;
    const it = s.getItem();
    if (!it || it.typeId !== KEY_ID) return undefined;
    return { slot: s, item: it, code: codeOf(it) };
}
const fresh = () => "K#" + Array.from({ length: 5 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
function stamp(e, code) {
    try {
        e.slot.setLore([code, ...(e.item.getLore() || []).filter((l) => !l.startsWith("K#"))]);
        e.code = code;
    } catch (err) { console.warn("[GMSD] stamp failed: " + err); }
}
const say = (pl, t) => { try { pl.sendMessage(t); } catch { } };
function snd(block, ids, vol = 0.6, pitch = 1) {
    for (const id of ids) {
        try { block.dimension.playSound(id, block.center(), { volume: vol, pitch }); return; } catch { }
    }
}
const LOCKED_SND = ["qbdoors.door.locked", "note.bass"];
const OPEN_SND = ["qbdoors.door.lock", "random.click"];
const creative = (pl) => { try { return String(pl.getGameMode()).toLowerCase() === "creative"; } catch { return false; } };

system.beforeEvents.startup.subscribe((init) => {
    try {
        init.blockComponentRegistry.registerCustomComponent(NS + ":door", {
            onPlayerInteract: (ev) => {
                const pl = ev.player ?? ev.entitySource;
                const block = ev.block;
                if (!pl || !block) return;
                try { lastBlockTap.set(pl.id, system.currentTick); } catch { }
                const meta = store()[keyOf(block)];
                if (!meta) return;
                const key = heldKey(pl);

                if (pl.isSneaking && key) {
                    if (key.code === meta.code) {
                        console.warn(`[GMSD] release at ${block.location.x},${block.location.y},${block.location.z} type=${block.typeId} mat=${meta.mat ?? "(derived)"}`);
                        toVanilla(block, meta);              // <-- the missing restore
                        const s2 = store();
                        for (const b of minePair(block)) delete s2[keyOf(b)];
                        save(s2);
                        say(pl, "§eDoor Lock released §7- normal door again.");
                        snd(block, OPEN_SND, 0.5, 1.2);
                    } else {
                        say(pl, "§cThis door belongs to a different key.");
                        snd(block, LOCKED_SND, 0.5, 1.5);
                    }
                    return;
                }

                if (!key || key.code !== meta.code) {
                    say(pl, key ? "§cWrong key" : "§cDoors Locked");
                    snd(block, LOCKED_SND, 0.7, 1.5);
                    return;
                }
                const nowOpen = st(block, NS + ":open") === true;
                setOpen(block, !nowOpen);            // toggle: no auto-close
                snd(block, nowOpen ? LOCKED_SND : OPEN_SND, 0.5, 1.2);
            },
        });
        console.warn("[GMSD] component " + NS + ":door registered");
    } catch (e) { console.warn("[GMSD] component registration failed: " + e); }
});


/* ---- taps on OUR secure doors: same event that makes registration work --------------- */
function handleSecureTap(player, block) {
    const meta = store()[keyOf(block)];
    const key = heldKey(player);

    // sneak + key = release (no air tapping anywhere)
    if (player.isSneaking && key) {
        if (!meta) { say(player, "§7This door is not locked."); return true; }
        console.warn(`[GMSD] release(sneak) at ${block.location.x},${block.location.y},${block.location.z} key=${key.code} rec=${meta.code}`);
        if (key.code === meta.code) {
            toVanilla(block, meta);
            const s2 = store();
            for (const b of minePair(block)) delete s2[keyOf(b)];
            save(s2);
            say(player, "§eDoor Lock released §7- normal door again.");
            snd(block, OPEN_SND, 0.5, 1.2);
        } else {
            say(player, "§cThis door belongs to a different key.");
            snd(block, LOCKED_SND, 0.5, 1.5);
        }
        return true;
    }

    if (!meta) return false;
    if (!key || key.code !== meta.code) {
        say(player, key ? "§cWrong key" : "§cDoors Locked");
        snd(block, LOCKED_SND, 0.7, 1.5);
        return true;
    }
    const nowOpen = st(block, NS + ":open") === true;
    setOpen(block, !nowOpen);
    snd(block, nowOpen ? LOCKED_SND : OPEN_SND, 0.5, 1.2);
    return true;
}

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const player = ev.player;
    const block = ev.block;
    if (!player || !block) return;
    // our own secure doors first (release / open / refuse)
    if (mine(block)) {
        ev.cancel = true;
        system.run(() => { try { handleSecureTap(player, block); } catch (e) { console.warn("[GMSD] tap failed: " + e); } });
        return;
    }
    const mat = vanillaMat(block);
    if (!mat) return;
    const key = heldKey(player);
    if (!player.isSneaking || !key) return;

    ev.cancel = true;
    try { lastBlockTap.set(player.id, system.currentTick); } catch { }
    system.run(() => {
        const db = store();
        const [low, up] = vanillaPair(block);
        const ids0 = vanillaPair(block).map(keyOf).find((id) => db[id]);
        if (vanillaMat(low) !== mat) { say(player, "§cThis door cannot be locked."); return; }
        const code = key.code || fresh();
        if (!key.code) stamp(key, code);
        const cardinal = vanillaDir(low);
        const legacy = st(low, "direction");
        // vanilla doors can disagree between halves; the UPPER half's bit is what
        // distinguishes the two doors of a double pair (verified in game)
        const hingeVal = (st(up, "door_hinge_bit") ?? st(low, "door_hinge_bit")) === true;
        // ---- closed-pose appearance table (calibrated against vanilla doors) ---------------
        // closed panel sits on R(cardinal): X-thin panels follow the hinge, Z-thin are mirrored.
        const CLOCK = { north: "east", east: "south", south: "west", west: "north" };
        const closedEdge = CLOCK[cardinal] ?? "east";
        const xThin = closedEdge === "east" || closedEdge === "west";
        // ---- lookup tables calibrated against eight vanilla doors ------------------------
        const CLOSED_MIRROR = { north: { f: false, t: true }, east: { f: true, t: true },
                                south: { f: true, t: false }, west: { f: false, t: true } };
        const OPEN_MIRROR = { north: false, east: false, south: true, west: true };
        // oak uses the vanilla "door_wood_*" texture; every other material uses
        // "door_<material>_*" which is drawn mirrored relative to it - so non-oak doors need
        // the opposite closed-pose flip (measured on spruce/iron; open pose is unaffected)
        const matFlip = mat !== "oak";
        const mirrorDefault = (CLOSED_MIRROR[cardinal]?.[hingeVal ? "t" : "f"] ?? true) !== matFlip;
        const omirrorDefault = OPEN_MIRROR[cardinal] ?? false;
        const swingDefault = hingeVal;
        const tune = readTune()[doorTuneKey(low)] || {};
        const meta = { code, mat, cardinal, dir: rotate(cardinal, rotOf()), legacyDir: legacy,
                       hinge: hingeVal,
                       mirror: tune.mirror ?? mirrorDefault,
                       omirror: tune.omirror ?? omirrorDefault,
                       swing: tune.swing ?? swingDefault };
        console.warn(`[GMSD] lock ${low.location.x},${low.location.y},${low.location.z} type=${low.typeId} cardinal=${cardinal} legacy=${meta.legacyDir} hinge=${meta.hinge} upperHinge=${st(up,"door_hinge_bit")} upperCardinal=${st(up,"minecraft:cardinal_direction")}`);
        console.warn(`[GMSD] pose mat=${mat} cardinal=${cardinal} hinge=${hingeVal} -> mirror=${meta.mirror} swing=${meta.swing} omirror=${meta.omirror}`);
        const ids = toSecure(block, meta);
        try { for (const b of minePair(block)) { b.setPermutation(b.permutation.withState(NS+":mirror", meta.mirror === true).withState(NS+":swing", meta.swing === true).withState(NS+":omirror", meta.omirror === true)); } } catch (e) { console.warn("[GMSD] pose apply failed: " + e); }
        for (const id of ids) db[id] = meta;
        save(db);
        say(player, `§aDoor Lock registered §7- only this key (§f${code}§7) opens it now.`);
        try { player.playSound("random.levelup", { pitch: 1.4, volume: 0.6 }); } catch { }
    });
});

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const player = ev.player;
    const block = ev.block;
    if (!block || !mine(block)) return;
    const meta = store()[keyOf(block)];
    if (!meta) return;
    const key = heldKey(player);
    const allowed = (key && key.code === meta.code) || creative(player);
    if (!allowed) {
        ev.cancel = true;
        system.run(() => {
            say(player, "§cDoors Locked §7- unbreakable.");
            snd(block, LOCKED_SND, 0.6, 1.5);
        });
        return;
    }
    system.run(() => {
        const [low, up] = minePair(block);
        const survivor = block.location.y > low.location.y ? low : up;
        try { toVanilla(survivor, meta); } catch { }
        const s2 = store();
        for (const b of minePair(block)) delete s2[keyOf(b)];
        save(s2);
        try { block.dimension.spawnItem(new ItemStack(`minecraft:${meta.mat}_door`, 1), block.center()); } catch { }
    });
});

world.beforeEvents.explosion.subscribe((ev) => {
    let list;
    try { list = ev.getImpactedBlocks(); } catch { return; }
    if (!list || !list.length) return;
    const kept = list.filter((b) => { try { return !mine(b); } catch { return true; } });
    if (kept.length !== list.length) { try { ev.setImpactedBlocks(kept); } catch { } }
});

world.afterEvents.itemUse.subscribe((ev) => {
    const pl = ev.source;
    const item = ev.itemStack;
    if (!pl || !item || item.typeId !== KEY_ID) return;
    // tapping in the air with a coded key releases the nearest locked door of that key
    const code = codeOf(item);
    if (!code) return;
    const off = slot(pl, "Offhand");
    if (!off || !off.hasItem()) return;
    const other = off.getItem();
    if (!other || other.typeId !== KEY_ID || codeOf(other)) return;
    try {
        off.setLore([code, ...(other.getLore() || []).filter((l) => !l.startsWith("K#"))]);
        say(pl, `§aCopied §f${code} §7to the off hand key.`);
    } catch (e) { console.warn("[GMSD] copy failed: " + e); }
});


// per-door appearance tuning (once per door, stored with the lock)
//   scriptevent gmsd:mirror <radius>   -> flip the handle side
//   scriptevent gmsd:swing  <radius>   -> flip which side it opens to
const rec0 = (r) => ({ mirror: r.mirror === true, swing: r.swing === true });
function tuneNearest(player, field, radius) {
    const db = store();
    const dim = player.dimension, o = player.location;
    let best = null, bestD = Infinity;
    for (const id of Object.keys(db)) {
        const parts = id.split("|");
        if (parts[0] !== dim.id) continue;
        const c = parts[1].split(",").map(Number);
        const d = Math.hypot(c[0] - o.x, c[1] - o.y, c[2] - o.z);
        if (d <= radius && d < bestD) { bestD = d; best = { id, c, rec: db[id] }; }
    }
    if (!best) { say(player, "§7No locked door nearby."); return; }
    // remember this choice permanently for the door position (records get deleted on release)
    const tune = readTune();
    let lower = best.c;
    try {
        const bb = dim.getBlock({ x: best.c[0], y: best.c[1], z: best.c[2] });
        if (bb && st(bb, NS + ":upper") === true) { const lo = bb.below(); lower = [Math.floor(lo.location.x), Math.floor(lo.location.y), Math.floor(lo.location.z)]; }
    } catch { }
    const key = `${lower[0]},${lower[1]},${lower[2]}|${dim.id}`;
    const rec = { ...(tune[key] || {}), ...[rec0(best.rec)] };
    rec[field] = !(best.rec[field] === true);
    tune[key] = { mirror: rec.mirror === true, swing: rec.swing === true };
    writeTune(tune);
    console.warn(`[GMSD] tune saved key="${key}" mirror=${tune[key].mirror} swing=${tune[key].swing}`);
    // apply to every record of this door pair
    for (const id of Object.keys(db)) {
        const parts = id.split("|");
        if (parts[0] !== dim.id) continue;
        const c = parts[1].split(",").map(Number);
        if (Math.abs(c[0] - best.c[0]) > 1 || Math.abs(c[2] - best.c[2]) > 1 || Math.abs(c[1] - best.c[1]) > 1) continue;
        db[id] = { ...db[id], [field]: rec[field] };
    }
    save(db);
    try {
        const block = dim.getBlock({ x: best.c[0], y: best.c[1], z: best.c[2] });
        if (block && mine(block)) {
            for (const b of minePair(block)) {
                b.setPermutation(b.permutation.withState(NS + ":" + field, rec[field] === true));
            }
        }
    } catch { }
    say(player, `§a${field} = ${rec[field] ? "on" : "off"}`);
    console.warn(`[GMSD] tune ${field}=${rec[field]} at ${best.c.join(",")}`);
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id === "gmsd:rot") {
        const next = (rotOf() + 90) % 360;
        world.setDynamicProperty(ROT_KEY, next);
        console.warn(`[GMSD] facing offset is now ${next} degrees`);
        try {
            const p = ev.sourceEntity ?? world.getAllPlayers()[0];
            if (p) p.sendMessage(`§eFacing offset: §f${next}° §7- lock a test door and look`);
        } catch { }
        return;
    }
    if (ev.id === "gmsd:mirror" || ev.id === "gmsd:swing") {
        const pl = ev.sourceEntity ?? world.getAllPlayers()[0];
        const field = ev.id === "gmsd:mirror" ? "mirror" : "swing";
        if (!pl) { console.warn("[GMSD] tune needs a player"); return; }
        tuneNearest(pl, field, Math.max(1, Math.min(32, parseInt((ev.message || "8").trim(), 10) || 8)));
        return;
    }
    if (ev.id !== "gmsd:unlock" && ev.id !== "gmsd:list") return;
    const db = store();
    const ids = Object.keys(db);
    if (ev.id === "gmsd:list") {
        console.warn(`[GMSD] locked doors: ${ids.length}`);
        for (const i of ids) console.warn(`[GMSD]   ${i} -> ${db[i].code}`);
        return;
    }
    const r = Math.max(1, Math.min(64, parseInt((ev.message || "8").trim(), 10) || 8));
    const origin = ev.sourceEntity ?? world.getAllPlayers()[0];
    if (!origin) return;
    let n = 0;
    for (const i of ids) {
        const parts = i.split("|");
        if (parts[0] !== origin.dimension.id) continue;
        const xyz = parts[1].split(",").map(Number);
        const dx = xyz[0] - origin.location.x;
        const dy = xyz[1] - origin.location.y;
        const dz = xyz[2] - origin.location.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) > r) continue;
        try {
            const b = origin.dimension.getBlock({ x: xyz[0], y: xyz[1], z: xyz[2] });
            if (b && mine(b)) toVanilla(b, db[i]);
        } catch { }
        delete db[i];
        n++;
    }
    save(db);
    console.warn(`[GMSD] released ${n} door(s)`);
    try { origin.sendMessage(`§aReleased ${n} door(s)`); } catch { }
}, { namespaces: ["gmsd"] });


// console repair: rebuild vanilla doors from our own blocks (fixes orphans left by old builds)

console.warn("[GMSD] GM Secure Doors ready - vanilla doors only, QB Doors untouched.");
