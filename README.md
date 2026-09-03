# polyomino-puzzle

Ubongo/IQ-Fit-style polyomino packing puzzle. Curated levels with a guaranteed
solution: a target shape is filled exactly with a defined set of pieces.

## Platform plan

Developed entirely on Windows in TypeScript. No Mac required.

1. **Web prototype** (TypeScript + Canvas) — playable in iPhone Safari.
2. **Expo / React Native app** — same core logic, shipped to the App Store via
   EAS cloud builds.

## Packages

| Package | What it is |
|---|---|
| `packages/puzzle-core` | Pure logic, no UI. Polyomino shapes, exact-cover solver, level generator, difficulty scorer, level JSON schema. Fully unit-tested. |
| `packages/level-gen-cli` | *(planned)* Node CLI that batch-generates and curates level JSON files. |
| `packages/web` | *(planned)* Prototype UI. |

## Pieces

The classic 12 free pentominoes (F I L N P T U V W X Y Z), 60 cells total.
Rotation **and** reflection allowed. Each level uses a subset.

## Develop

```bash
npm install
npm test
```

## Build order

1. `puzzle-core`: Polyomino + Shape + solver (with solution counting) + tests
2. Level JSON schema
3. `level-gen-cli`: generate 200+ levels, hand-check a sample
4. `web`: vertical slice — load one level, drag/rotate/place, win condition
5. Difficulty scoring + bucketing + level select + progress
6. Playtest on iPhone
7. Expo app + App Store + in-app purchases
