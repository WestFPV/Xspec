# Gate model assets

The Track Builder race-gate library uses these four GLB models:

- `neon-square.glb` — Neon Square
- `neon-ladder.glb` — Neon Ladder
- `neon-flag.glb` — Neon Flag
- `neon-hurdle.glb` — Neon Hurdle
- `neon-dive.glb` — Neon Dive

The editor preserves each imported model's authored scale, centers it horizontally, and places its lowest point on the ground. The Builder color control recolors the models' neon material. In-world procedural stand-ins are used while a GLB loads or if it is unavailable. Relay podium gates are Builder props, not race-gate assets.

The gate library tiles use matching neon illustrations in `public/images/gates/` (`neon-square.svg`, `neon-ladder.svg`, `neon-flag.svg`, `neon-hurdle.svg`, and `neon-dive.svg`). These image tiles are shown directly and do not use generated fallback artwork.
