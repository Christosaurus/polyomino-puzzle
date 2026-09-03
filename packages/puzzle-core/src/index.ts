/**
 * @polyomino/puzzle-core — pure puzzle logic, no UI.
 *
 * Shared by the level-generator CLI and by the game clients (web prototype,
 * later the Expo app). Everything here runs and is tested on plain Node.
 */

export * from "./cells.js";
export * from "./pentomino.js";
export * from "./shape.js";
export * from "./solver.js";
