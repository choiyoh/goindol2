# 고인돌2 Homage — Stage 1 MVP

Play: https://choiyoh.github.io/goindol2/

Hand-drawn assets only. Deployed from this repo root (GitHub Pages).

---

# 고인돌2 Homage — Stage 1 MVP Engine

Private practice homage scaffold. **Original map** (`../homage/stage1.json`). Hand-drawn hero sprites in `assets/hero/`, enemies in `assets/enemies/`, tiles in `assets/tiles/`, and items/props in `assets/items/` — no ripped assets, nothing loaded from `../data/`.

## How to run

From this folder:

```bash
cd /workspace/gondol2/game
python3 -m http.server 8080
```

Or from the parent:

```bash
cd /workspace/gondol2
python3 -m http.server 8080
# then open http://localhost:8080/game/
```

Open `http://localhost:8080/` (if served from `game/`) or `http://localhost:8080/game/`.

ES modules require HTTP (not `file://`).

## Controls

| Input | Action |
|---|---|
| ← → / A D | Walk (crouch-walk while holding ↓) |
| ↑ / W / Z / K | Jump (hold for full ~56px; tap ~36px) |
| ↓ / S | Crouch — **required** for 2-tile tunnels |
| Space / Enter / X / J | Club attack (also confirm on menus) — stand sheet, or crouch-attack sheet while crouched (crouch ×4 damage) |
| P | Pause |
| R | Forfeit life → last checkpoint |
| Touch zones | Left / Right / Crouch / Jump / Club |


## Screen flow (MVP)

States in `js/main.js`: `title` → `difficulty` → `play` → `clear` | `gameover`.

| Screen | Art / input |
|---|---|
| Title | `assets/title/` bg + logo; Space / Enter / attack / jump → difficulty |
| Difficulty | **BEGINNER** / **EXPERT** at x=132, y=108 (14px apart), bone cursor bob; ↑↓ / W S select; Space / Enter / attack confirm |
| Play | Existing stage1 loop (pause P still works) |
| STAGE CLEAR | title_bg + `STAGE CLEAR!` + SCORE + `ITEMS taken/total`; Space → difficulty (selection kept) |
| GAME OVER | same bg + `GAME OVER` + SCORE + ITEMS; Space → title |

### Difficulty (DESIGN §2.11)

Original uses **Beginner / Expert** only (not Easy/Normal/Hard).

| Menu | `game.difficulty` | `game.expert` | Effect |
|---|---|---|---|
| BEGINNER | `BEGINNER` | `false` | `expert_only` enemies skipped |
| EXPERT | `EXPERT` | `true` | stage1 adds expert turtle + small_dino |

`game.difficulty` / `game.expert` persist across results → next run (and later stage transitions).

### Collection rate

At level load: `game.itemsTotal = level.entities.items.length` (stage1 = **78**).
On each item pickup: `game.itemsTaken++`. Results show `ITEMS 34/78` via title font (`/` in font.png).

## Display & physics (DESIGN.md)

- Internal canvas **320×200** (playfield 320×176 + HUD 24). Integer scale, no smoothing.
- Tiles 16×16. Terrain IDs: 0 empty, 1 grass, 2 rock, 3 one-way, 4 spikes, 5 hidden wall.
- Walk ~117 px/s; sim at **60 fps with dt**.
- Hitboxes (feet-center anchor): stand **20×34**, crouch **20×24**. Art taller (stand drawHeight 41px / crouch 28px) — **collision uses hitbox only**.
- Hero anim: idle (**2-frame breath**, meta `frameMs [500,500]`) / walk (8f @ **25 fps** from meta `suggestedFpsAt117pxPerSec`) / crouch-walk (4f @ ~**7.5 fps** = crouchSpeed/footSlidePerFrame) / air poses from `hero_air_hurt` (`jump_up` vy<−40, `jump_top` |vy|<40, `fall`) / `hurt` pose while hit-invuln blinks. Facing flips left (feet anchor).
- **Club attack:** Space/X/J plays `hero_attack` (stand, 350 ms, frameMs 30/60/160/100) or `hero_crouchattack` (crouch, 460 ms, 120/60/160/120), chosen at swing start and locked until done (no walk anim mid-swing; facing locked). Frames are driven by `player.attackT` + sheet `frameMs`. The club **hitbox comes from JSON meta** `clubHitboxRelAnchor` (feet-relative, mirrored by facing) and is live only on `hitFrame` 2 (stand 90–250 ms, crouch 180–340 ms). Damage applies **once per swing** per target. Anim priority: attack > hurt > air > crouch > walk > idle.
- **Playtest note (GM):** 25 fps × 8 frames ≈ 6 steps/sec may look like a foot shuffle — leave FPS from meta; revisit later if needed.
- Stand-up: when crouch key released, only rises if standing hitbox clears ceiling; otherwise stays crouched.
- Lives 3, hearts 3. Enemy touch → lose heart. Spikes / map pit → instant death.
- Start weapon: **club (몽둥이)**. Clear: touch `goal_light` while holding lighter.

## Level source

`stage1.json` ships in-repo. Do not point the engine at any ripped `/data/` trees.

## Entity stubs vs deferred

**Stubbed (drawn + basic interact)**

| Type | Behavior now |
|---|---|
| `player_start` | Spawn feet position |
| `checkpoint` | Sets respawn on touch |
| `lighter` | Pickup → `hasLighter` |
| `goal_light` | Clear if holding lighter |
| `platform` | Moves by `dir`/`distance`/`speed` (ping-pong); dropdown falls after delay. **Timing TBD for playtest** |
| `item` | Score / heart / 1up pickup |
| `enemy` (turtle) | Behavior 10: emerge → walk patrol in `spawn_area`; club/stomp/flip death; hitbox from meta |
| `enemy` (other) | Static rect stub; touch hurts; stomp or club can kill |
| `spawn_area` | Visual + bounds for turtle patrol |
| `secret` (breakable) | Solid obstacle; club damages HP (crouch ×4) |
| `deco` | Sign sprite from props sheet |

**Deferred**

| Type | Notes |
|---|---|
| Enemy AI / behaviors 0–9, 11–12 | Parsed props kept; turtles (10) wired |
| Other `spawn_area` uses | Turtle patrol bounds; other kinds visual only |
| `gate` teleport | Gate sprite drawn; ↓ warp not wired |
| `secret` small/big | Marker only; no hit-drop food yet |
| `section` | Parsed for tools; not drawn in play |
| Camera look-ahead / surround | Simple follow + `scrollLimitTile` clamp |
| Audio | — |

## Turtle enemy (behavior 10)

Hand-drawn sheet `assets/enemies/turtle.png` + `turtle.json` (cell 36×16, faces **left**, drawHeight 14px — fits 2-tile tunnels).

| | |
|---|---|
| Spawn | 3 on stage1: id104 s2, id107 tunnel, id118 s7 (`expert_only`) |
| Beginner | **2** turtles (104, 107); expert adds 118 |
| AI | idle/burrowed → emerge ~0.4s → walk patrol inside `spawn_area` |
| Speed | **45 px/s** (anim-matched crawl; not `suggestedWalkSpeedPx * ORIG_HZ` ≈163) |
| Hitbox | `hitboxRelAnchor` (−16,−13,32×13) relative to feet — not the 16×16 placeholder |
| Club | hp 20; stand club 25 = 1-hit; hurt flash then flip frames 5–6 (~0.4s) on death |
| Stomp | Falling onto top kills (existing bounce) |

Feet stored like the player: map `(x+w/2, y+h)`. Sheet default faces left; `facing > 0` flips horizontally.

## Files

```
game/
  index.html
  README.md
  stage1.json -> ../homage/stage1.json
  assets/hero/
    hero_idle.png + hero_idle.json                 (2f breath, 41px)
    hero_walk.png + hero_walk.json
    hero_crouchwalk.png + hero_crouchwalk.json
    hero_attack.png + hero_attack.json             (stand club, hitFrame 2)
    hero_crouchattack.png + hero_crouchattack.json (crouch club, ≤30px tall)
    hero_air_hurt.png + hero_air_hurt.json         (jump_up / jump_top / fall / hurt)
  assets/tiles/
    tileset.png + tileset.json                     (hand-drawn 16px autotiles, 16 cols)
  assets/enemies/
    turtle.png + turtle.json                       (7f: walk 0–3, hurt 4, flip 5–6)
  assets/items/
    items.png + items.json                         (16×16: foods, bone, heart, 1up, diamond, letter_B/O/U, lighter)
    props.png + props.json                         (platform, breakable(+hit), sign, gate, checkpoint, goal)
  assets/title/
    title_bg.png, logo.png, cursor_bone.png, font.png + font.json, title.json
  js/
    main.js       entry + screen states + loop
    screens.js    title / difficulty / result (font blit)
    config.js     physics / display constants
    input.js      keyboard + touch (Enter = attack/confirm)
    level.js      Tiled JSON parse (enemy feet + areaBounds)
    collision.js  tiles, one-way, spikes
    player.js     move / jump / crouch headroom / club timing
    hero.js       sprite load / anim / draw (feet anchor) / getClubHitbox
    enemies.js    turtle sheet / AI / hitbox / draw
    camera.js
    platforms.js  moving platforms (timing TBD)
    entities.js   pickups (+ itemsTaken), checkpoints, non-turtle stubs
    tiles.js      tileset load + autotile lookup (port of hand/tiles/preview.py)
    props.js      items/props sheet load + draw helpers (bob, tile platform, goal flicker)
    render.js     terrain + hero + enemies + items/props sprites + HUD
    hud.js        bottom strip (clear/over → screens.js)
    fx.js         particles
    background.js parallax sky
```

Debug hitbox outline: `import { setShowHitbox } from './hero.js'` then `setShowHitbox(true)` (default off) — body hitbox yellow, club hitbox red on hitFrame.

Items/props: drawn from `assets/items/` via `js/props.js` (copied from `goindol2/hand/items/`). Item kinds map 1:1 to frames; `letter` uses `letter` prop → `letter_B`/`letter_O`/`letter_U`. Floating pickups bob ±1.5px @ ~600ms. Platforms tile the 32×16 strip when wider. Breakables switch to `breakable_hit` at ≥hp/2 damage. Goal alternates `goal_lit1`/`goal_lit2` every 200ms when the player has the lighter (or stage cleared); otherwise `goal_unlit`. Small/big secrets stay faint markers (no sheet frames). Draw-only — collision boxes unchanged. Rect stubs remain if sheets fail to load.

Tiles: terrain is drawn from `assets/tiles/tileset.png` via `js/tiles.js` (lookup = `goindol2/hand/tiles/preview.py`: mask T1 R2 B4 L8 set when neighbour not in {1,2,5}, outside = solid; var=(tx*7+ty*13)&1; rock/hidden col=mask row=var; grass row 2 col=var*8+(mask>>1); oneway row 3 col 0/1/2/3 = left/mid/right/single; spikes row 3 col 4+var). Hidden (5) is always drawn like rock — semi-transparent reveal when inside is deferred. If the tileset fails to load, the old procedural rects are used.
