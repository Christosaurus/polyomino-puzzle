#!/usr/bin/env node
/**
 * Batch-generate curated puzzle levels.
 *
 *   gen-levels --count 100 --seed pack-1 --out levels
 *
 * Writes `<out>/level_001.json` … in easiest-first order, plus `<out>/manifest.json`
 * with the seed, per-level summary and a difficulty histogram.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import {
  bucketByPercentile,
  generateBatch,
  rngFromSeed,
  serializeLevel,
} from "@polyomino/puzzle-core";

import { SHAPE_CATALOG } from "./shapes.js";

const HELP = `gen-levels — batch-generate polyomino puzzle levels

Options:
  --count <n>          how many levels to produce            (default 50)
  --seed <string>      generation seed, recorded per level   (default "pack-1")
  --out <dir>          output directory                      (default "levels")
  --buckets <n>        difficulty buckets                    (default 5)
  --max-attempts <n>   random subsets tried per level        (default 400)
  --help               show this help
`;

function main(): void {
  const { values } = parseArgs({
    options: {
      count: { type: "string", default: "50" },
      seed: { type: "string", default: "pack-1" },
      out: { type: "string", default: "levels" },
      buckets: { type: "string", default: "5" },
      "max-attempts": { type: "string", default: "400" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }

  const count = Number(values.count);
  const seed = values.seed as string;
  const outDir = values.out as string;
  const buckets = Number(values.buckets);
  const maxAttempts = Number(values["max-attempts"]);

  const shapes = SHAPE_CATALOG.filter((entry) => {
    if (entry.shape.size % 5 !== 0) {
      console.warn(`skip ${entry.label}: ${entry.shape.size} cells, not a multiple of 5`);
      return false;
    }
    if (entry.shape.size / 5 >= 12) {
      console.warn(`skip ${entry.label}: ${entry.shape.size} cells forces the whole piece set`);
      return false;
    }
    return true;
  });

  console.log(`Generating ${count} levels — seed "${seed}", ${shapes.length} shapes\n`);

  const started = Date.now();
  const batch = generateBatch({
    shapes,
    baseSeed: seed,
    count,
    rng: rngFromSeed(seed),
    maxAttempts,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`Produced ${batch.levels.length}/${count} levels in ${seconds}s`);
  console.log(`  attempts: ${batch.attempts}`);
  console.log(`  rejected: ${batch.noTiling} no-tiling, ${batch.ambiguous} ambiguous`);
  if (batch.failures > 0) console.log(`  ${batch.failures} slot(s) could not be filled`);

  if (batch.levels.length === 0) {
    console.error("\nNo levels generated — nothing written.");
    process.exitCode = 1;
    return;
  }

  const scored = bucketByPercentile(batch.levels, buckets);
  scored.forEach((entry, i) => {
    entry.level.id = `level_${String(i + 1).padStart(3, "0")}`;
  });

  mkdirSync(outDir, { recursive: true });
  for (const entry of scored) {
    writeFileSync(join(outDir, `${entry.level.id}.json`), `${serializeLevel(entry.level)}\n`);
  }

  const histogram = new Map<number, number>();
  for (const entry of scored) {
    histogram.set(entry.level.difficulty, (histogram.get(entry.level.difficulty) ?? 0) + 1);
  }
  console.log("\nDifficulty:");
  for (let d = 1; d <= buckets; d++) {
    const n = histogram.get(d) ?? 0;
    console.log(`  ${d} ${"#".repeat(n).padEnd(Math.max(...histogram.values()), " ")} ${n}`);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    seed,
    requested: count,
    produced: scored.length,
    buckets,
    shapes: shapes.map((s) => s.label),
    diagnostics: {
      attempts: batch.attempts,
      noTiling: batch.noTiling,
      ambiguous: batch.ambiguous,
      failures: batch.failures,
    },
    levels: scored.map((entry) => ({
      id: entry.level.id,
      difficulty: entry.level.difficulty,
      pieces: entry.level.pieces.join(""),
      rows: entry.level.shape.rows.length,
      cols: entry.level.shape.rows[0]?.length ?? 0,
      score: Number(entry.signals.score.toFixed(4)),
      solverNodes: entry.signals.solverNodes,
      forcedMoveFraction: Number(entry.signals.forcedMoveFraction.toFixed(3)),
      meanBranching: Number(entry.signals.meanBranching.toFixed(2)),
    })),
  };
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\nWrote ${scored.length} levels + manifest.json → ${outDir}/`);
}

main();
