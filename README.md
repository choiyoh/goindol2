# 고인돌2 Homage — Stage 1 MVP

Play: https://choiyoh.github.io/goindol2/

Hand-drawn assets only. Public homage MVP for stage 1 (GitHub Pages from this repo root).

## How to run locally

From this folder (needs HTTP for ES modules — not `file://`):

```bash
python3 -m http.server 8080
```

Open http://localhost:8080/

## Controls

| Input | Action |
|---|---|
| ← → / A D | Walk (crouch-walk while holding ↓) |
| ↑ / W / Z / K | Jump (hold for full height; tap for short) |
| ↓ / S | Crouch — required for 2-tile tunnels |
| Space / Enter / X / J | Club attack (also confirm on menus) |
| P | Pause |
| R | Forfeit life → last checkpoint |
| Touch zones | Left / Right / Crouch / Jump / Club |

## Screen flow

`title` → `difficulty` → `play` → `clear` | `gameover`

| Screen | Input |
|---|---|
| Title | Space / Enter / attack / jump → difficulty |
| Difficulty | BEGINNER / EXPERT; ↑↓ select, Space / Enter / attack confirm |
| Play | Stage 1 loop (P pause) |
| STAGE CLEAR | Space → difficulty (selection kept) |
| GAME OVER | Space → title |

**BEGINNER** skips `expert_only` enemies. **EXPERT** adds them (extra turtle + small_dino on stage 1).

## Display

- Internal canvas **320×200** (playfield 320×176 + HUD 24)
- Tiles 16×16
- Start weapon: club
- Clear: touch `goal_light` while holding the lighter

## Files

```
index.html
README.md
stage1.json
assets/   bg, enemies, fx, hero, hud, items, tiles, title
js/       main, screens, config, input, level, collision, player,
          hero, enemies, camera, platforms, entities, tiles, props,
          render, hud, fx, background
```
