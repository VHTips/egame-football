"use client";

// egame-footbal-v.01_11_25_25_1539

import React, { useCallback, useEffect, useMemo, useState } from "react";

type CellType = "EMPTY" | "PLAYER" | "DEFENDER";

type Position = { row: number; col: number };

type GameStatus = "PLAYING" | "TOUCHDOWN" | "TACKLED";

const ROWS = 5;
const COLS = 10;
const NUM_DEFENDERS = 6;
const TICK_MS = 250;

const createEmptyGrid = (): CellType[][] =>
  Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => "EMPTY" as CellType)
  );

const positionsEqual = (a: Position, b: Position) =>
  a.row === b.row && a.col === b.col;

const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const generateDefenders = (player: Position): Position[] => {
  const defenders: Position[] = [];

  while (defenders.length < NUM_DEFENDERS) {
    const pos: Position = {
      row: randomInt(0, ROWS - 1),
      col: randomInt(3, COLS - 1), // keep them away from the very left edge
    };

    const collidesPlayer = positionsEqual(pos, player);
    const collidesOther = defenders.some((d) => positionsEqual(d, pos));

    if (!collidesPlayer && !collidesOther) {
      defenders.push(pos);
    }
  }

  return defenders;
};

const clamp = (val: number, min: number, max: number) =>
  Math.max(min, Math.min(max, val));

const stepDefenderTowardPlayer = (def: Position, player: Position): Position => {
  const rowDir = Math.sign(player.row - def.row); // -1, 0, 1
  const colDir = Math.sign(player.col - def.col); // -1, 0, 1

  const options: Position[] = [];

  // Prefer to move toward the player, but we can randomize between vertical/horizontal
  if (colDir !== 0) {
    options.push({ row: def.row, col: clamp(def.col + colDir, 0, COLS - 1) });
  }
  if (rowDir !== 0) {
    options.push({ row: clamp(def.row + rowDir, 0, ROWS - 1), col: def.col });
  }

  // small chance to "jitter" randomly instead of pure chasing
  if (Math.random() < 0.2) {
    const jitterChoices: Position[] = [];

    if (def.col > 0) jitterChoices.push({ row: def.row, col: def.col - 1 });
    if (def.col < COLS - 1)
      jitterChoices.push({ row: def.row, col: def.col + 1 });
    if (def.row > 0) jitterChoices.push({ row: def.row - 1, col: def.col });
    if (def.row < ROWS - 1)
      jitterChoices.push({ row: def.row + 1, col: def.col });

    if (jitterChoices.length) {
      return jitterChoices[randomInt(0, jitterChoices.length - 1)];
    }
  }

  if (options.length === 0) {
    return def; // already on the player
  }

  // randomly pick between vertical / horizontal chase
  return options[randomInt(0, options.length - 1)];
};

const pageStyle =
  "min-h-screen flex items-center justify-center bg-slate-900 text-slate-100";

const Page: React.FC = () => {
  const [player, setPlayer] = useState<Position>({ row: 2, col: 0 });
  const [defenders, setDefenders] = useState<Position[]>(() =>
    generateDefenders({ row: 2, col: 0 })
  );
  const [status, setStatus] = useState<GameStatus>("PLAYING");
  const [tick, setTick] = useState(0);

  const resetGame = useCallback(() => {
    const start: Position = { row: 2, col: 0 };
    setPlayer(start);
    setDefenders(generateDefenders(start));
    setStatus("PLAYING");
    setTick(0);
  }, []);

  // Game loop timer
  useEffect(() => {
    if (status !== "PLAYING") return;

    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [status]);

  // Move defenders every tick
  useEffect(() => {
    if (status !== "PLAYING") return;

    setDefenders((prev) => {
      const next = prev.map((d) => stepDefenderTowardPlayer(d, player));

      // Check for tackles
      if (next.some((d) => positionsEqual(d, player))) {
        setStatus("TACKLED");
      }

      return next;
    });
  }, [tick, player, status]);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status !== "PLAYING") {
        if (e.key === "Enter") {
          e.preventDefault();
          resetGame();
        }
        return;
      }

      let dRow = 0;
      let dCol = 0;

      if (e.key === "ArrowUp") dRow = -1;
      else if (e.key === "ArrowDown") dRow = 1;
      else if (e.key === "ArrowLeft") dCol = -1;
      else if (e.key === "ArrowRight") dCol = 1;
      else return;

      e.preventDefault();

      setPlayer((prev) => {
        const next: Position = {
          row: clamp(prev.row + dRow, 0, ROWS - 1),
          col: clamp(prev.col + dCol, 0, COLS - 1),
        };

        // Touchdown?
        if (next.col === COLS - 1) {
          setStatus("TOUCHDOWN");
        }

        // Collision with defender?
        if (defenders.some((d) => positionsEqual(d, next))) {
          setStatus("TACKLED");
        }

        return next;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [defenders, resetGame, status]);

  const grid = useMemo(() => {
    const g = createEmptyGrid();

    defenders.forEach((d) => {
      g[d.row][d.col] = "DEFENDER";
    });

    g[player.row][player.col] = "PLAYER";

    return g;
  }, [player, defenders]);

  const statusText =
    status === "PLAYING"
      ? "Use arrow keys to move your O. Reach the right side. Avoid the Xs."
      : status === "TOUCHDOWN"
      ? "TOUCHDOWN! Press Enter to play again."
      : "TACKLED! Press Enter to try again.";

  return (
    <div className={pageStyle}>
      <div className="bg-slate-800 rounded-2xl p-6 shadow-2xl border border-slate-600">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-semibold tracking-wide mb-1">
            Simple Football
          </h1>
          <p className="text-sm text-slate-300">{statusText}</p>
        </div>

        <div className="bg-emerald-900 border border-emerald-500 rounded-xl p-3">
          {grid.map((row, rIdx) => (
            <div key={rIdx} className="flex justify-center">
              {row.map((cell, cIdx) => {
                const isEndZone = cIdx === COLS - 1 || cIdx === 0;
                const baseClasses =
                  "w-7 h-7 mx-0.5 my-0.5 flex items-center justify-center rounded-sm text-sm font-bold";

                let cellClasses = "bg-emerald-950 border border-emerald-700";

                if (isEndZone) {
                  cellClasses =
                    "bg-blue-900 border border-blue-500"; // end zones
                }

                if (cell === "PLAYER") {
                  cellClasses = "bg-emerald-300 text-slate-900";
                } else if (cell === "DEFENDER") {
                  cellClasses =
                    "bg-red-700 text-red-100 border border-red-300/80";
                }

                return (
                  <div key={cIdx} className={`${baseClasses} ${cellClasses}`}>
                    {cell === "PLAYER" ? "O" : cell === "DEFENDER" ? "X" : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-3 text-xs text-center text-slate-400">
          Status: {status}
        </div>
      </div>
    </div>
  );
};

export default Page;
