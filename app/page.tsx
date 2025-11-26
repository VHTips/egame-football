"use client";
// egame-footbal-v.01_11_25_25_2055_defenders_speed_fix

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type CellType = "EMPTY" | "PLAYER" | "DEFENDER";

type Position = { row: number; col: number };

type GameStatus = "PLAYING" | "TOUCHDOWN" | "TACKLED";

const ROWS = 5;
const COLS = 10;
const NUM_DEFENDERS = 6;

// Base player start position
const PLAYER_START: Position = { row: 2, col: 0 };

// Helper to get a random integer between min and max (inclusive)
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 2s or 3s delay, chosen randomly each time
function randomDefenderDelayMs(): number {
  return Math.random() < 0.5 ? 1000 : 1500;
}

// Check if two positions are the same
function isSamePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

const Page: React.FC = () => {
  const [player, setPlayer] = useState<Position>(PLAYER_START);
  const [defenders, setDefenders] = useState<Position[]>([]);
  const [status, setStatus] = useState<GameStatus>("PLAYING");

  // Refs to keep latest values inside timeouts
  const playerRef = useRef<Position>(PLAYER_START);
  const statusRef = useRef<GameStatus>("PLAYING");
  const defendersTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Keep refs updated whenever state changes
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Clear all defender timeouts
  const clearDefenderTimeouts = useCallback(() => {
    defendersTimeoutsRef.current.forEach((id) => clearTimeout(id));
    defendersTimeoutsRef.current = [];
  }, []);

  // Compute the next position for a given defender
  function getNextDefenderPosition(
    current: Position,
    playerPos: Position,
    allDefenders: Position[],
    index: number
  ): Position {
    const rowDiff = playerPos.row - current.row;
    const colDiff = playerPos.col - current.col;

    const verticalDir = rowDiff === 0 ? 0 : rowDiff > 0 ? 1 : -1;
    const horizontalDir = colDiff === 0 ? 0 : colDiff > 0 ? 1 : -1;

    const candidates: Position[] = [];

    const moveTowardPlayerFirst = Math.random() < 0.8; // 80% bias toward chasing

    if (moveTowardPlayerFirst) {
      // Prefer axis with larger distance
      if (Math.abs(rowDiff) > Math.abs(colDiff)) {
        if (verticalDir !== 0) {
          candidates.push({ row: current.row + verticalDir, col: current.col });
        }
        if (horizontalDir !== 0) {
          candidates.push({ row: current.row, col: current.col + horizontalDir });
        }
      } else {
        if (horizontalDir !== 0) {
          candidates.push({ row: current.row, col: current.col + horizontalDir });
        }
        if (verticalDir !== 0) {
          candidates.push({ row: current.row + verticalDir, col: current.col });
        }
      }
    } else {
      // Jitter: random cardinal direction
      const dirs = [
        { dr: -1, dc: 0 },
        { dr: 1, dc: 0 },
        { dr: 0, dc: -1 },
        { dr: 0, dc: 1 },
      ];
      const dir = dirs[randomInt(0, dirs.length - 1)];
      candidates.push({ row: current.row + dir.dr, col: current.col + dir.dc });
    }

    // Fallback: stay in place if nothing else works
    candidates.push(current);

    // Helper to check if another defender already occupies a cell
    const isOccupiedByDefender = (row: number, col: number): boolean =>
      allDefenders.some((d, i) => i !== index && d.row === row && d.col === col);

    // Pick the first valid candidate
    for (const cand of candidates) {
      if (
        cand.row >= 0 &&
        cand.row < ROWS &&
        cand.col >= 0 &&
        cand.col < COLS &&
        !isOccupiedByDefender(cand.row, cand.col)
      ) {
        return cand;
      }
    }

    return current;
  }

  // Schedule a movement timeout for a specific defender index
  const scheduleDefenderMove = useCallback(
    (index: number) => {
      const delay = randomDefenderDelayMs();

      const timeoutId = setTimeout(() => {
        // If game is no longer playing, do nothing
        if (statusRef.current !== "PLAYING") {
          return;
        }

        const currentPlayer = playerRef.current;

        setDefenders((prev) => {
          // In case defenders array changed size
          if (!prev[index]) return prev;

          const beforeMove = [...prev];
          const currentDef = beforeMove[index];

          const nextPos = getNextDefenderPosition(
            currentDef,
            currentPlayer,
            beforeMove,
            index
          );

          beforeMove[index] = nextPos;

          // Check for collision with player
          if (isSamePosition(nextPos, currentPlayer)) {
            statusRef.current = "TACKLED";
            setStatus("TACKLED");
            return beforeMove;
          }

          return beforeMove;
        });

        // After moving, if still playing, schedule the next move for this defender
        if (statusRef.current === "PLAYING") {
          scheduleDefenderMove(index);
        }
      }, delay);

      defendersTimeoutsRef.current[index] = timeoutId;
    },
    [setDefenders]
  );

  // Initialize or reset the entire game
  const initGame = useCallback(() => {
    clearDefenderTimeouts();

    const startPlayer = { ...PLAYER_START };
    setPlayer(startPlayer);
    playerRef.current = startPlayer;

    setStatus("PLAYING");
    statusRef.current = "PLAYING";

    // Generate defenders away from the player and from each other
    const newDefenders: Position[] = [];
    while (newDefenders.length < NUM_DEFENDERS) {
      const candidate: Position = {
        row: randomInt(0, ROWS - 1),
        col: randomInt(3, COLS - 1), // keep them away from the very left
      };

      const collidesWithPlayer = isSamePosition(candidate, startPlayer);
      const collidesWithOthers = newDefenders.some((d) =>
        isSamePosition(d, candidate)
      );

      if (!collidesWithPlayer && !collidesWithOthers) {
        newDefenders.push(candidate);
      }
    }

    setDefenders(newDefenders);

    // Schedule individual movement timers for each defender
    newDefenders.forEach((_, index) => {
      scheduleDefenderMove(index);
    });
  }, [clearDefenderTimeouts, scheduleDefenderMove]);

  // Run once on mount
  useEffect(() => {
    initGame();
    // Cleanup on unmount
    return () => {
      clearDefenderTimeouts();
    };
  }, [initGame, clearDefenderTimeouts]);

  // Keyboard controls: arrows move the player, Enter restarts when not playing
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;

      if (key === "Enter") {
        if (statusRef.current !== "PLAYING") {
          event.preventDefault();
          initGame();
        }
        return;
      }

      // Only allow movement while playing
      if (statusRef.current !== "PLAYING") return;

      let nextRow = playerRef.current.row;
      let nextCol = playerRef.current.col;

      if (key === "ArrowUp") {
        nextRow = Math.max(0, nextRow - 1);
      } else if (key === "ArrowDown") {
        nextRow = Math.min(ROWS - 1, nextRow + 1);
      } else if (key === "ArrowLeft") {
        nextCol = Math.max(0, nextCol - 1);
      } else if (key === "ArrowRight") {
        nextCol = Math.min(COLS - 1, nextCol + 1);
      } else {
        return;
      }

      // If position wouldn't change, ignore
      if (
        nextRow === playerRef.current.row &&
        nextCol === playerRef.current.col
      ) {
        return;
      }

      const newPlayerPos: Position = { row: nextRow, col: nextCol };

      const defenderOnNewCell = defenders.some((d) =>
        isSamePosition(d, newPlayerPos)
      );

      if (defenderOnNewCell) {
        setPlayer(newPlayerPos);
        playerRef.current = newPlayerPos;
        setStatus("TACKLED");
        statusRef.current = "TACKLED";
        return;
      }

      if (newPlayerPos.col === COLS - 1) {
        setPlayer(newPlayerPos);
        playerRef.current = newPlayerPos;
        setStatus("TOUCHDOWN");
        statusRef.current = "TOUCHDOWN";
        return;
      }

      setPlayer(newPlayerPos);
      playerRef.current = newPlayerPos;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [defenders, initGame]);

  // Build the grid from player + defenders
  const grid: CellType[][] = useMemo(() => {
    const baseGrid: CellType[][] = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => "EMPTY" as CellType)
    );

    defenders.forEach((def) => {
      if (
        def.row >= 0 &&
        def.row < ROWS &&
        def.col >= 0 &&
        def.col < COLS
      ) {
        baseGrid[def.row][def.col] = "DEFENDER";
      }
    });

    if (
      player.row >= 0 &&
      player.row < ROWS &&
      player.col >= 0 &&
      player.col < COLS
    ) {
      baseGrid[player.row][player.col] = "PLAYER";
    }

    return baseGrid;
  }, [player, defenders]);

  const getCellClasses = (row: number, col: number, cell: CellType) => {
    const isLeftEndZone = col === 0;
    const isRightEndZone = col === COLS - 1;

    const base =
      "flex items-center justify-center border border-slate-700 text-sm font-semibold w-10 h-10 sm:w-12 sm:h-12";

    if (cell === "PLAYER") {
      return `${base} bg-emerald-500 text-slate-900`;
    }

    if (cell === "DEFENDER") {
      return `${base} bg-rose-500 text-slate-900`;
    }

    if (isLeftEndZone || isRightEndZone) {
      return `${base} bg-sky-700 text-sky-200`;
    }

    return `${base} bg-slate-800 text-slate-300`;
  };

  const statusMessage =
    status === "PLAYING"
      ? "Use arrow keys to move. Reach the right side for a touchdown!"
      : status === "TOUCHDOWN"
      ? "Touchdown! Press Enter to play again."
      : "Tackled! Press Enter to try again.";

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-950/70 border border-slate-800 rounded-xl shadow-xl p-4 sm:p-6">
        <h1 className="text-lg sm:text-xl font-bold text-center mb-1">
          Simple Football Game
        </h1>
        <p className="text-xs sm:text-sm text-center text-slate-400 mb-4">
          O = You (Offense) · X = Defenders · Endzones are blue columns
        </p>

        <div className="flex justify-center mb-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-800/80 px-3 py-1 text-xs text-slate-300">
            <span className="inline-block w-3 h-3 rounded-full bg-emerald-500" />
            <span>Defenders move every 2–3 seconds (random per defender)</span>
          </div>
        </div>

        <div className="flex justify-center mb-3">
          <div className="flex flex-col gap-1">
            {grid.map((rowCells, rowIndex) => (
              <div key={rowIndex} className="flex gap-1 justify-center">
                {rowCells.map((cell, colIndex) => (
                  <div
                    key={colIndex}
                    className={getCellClasses(rowIndex, colIndex, cell)}
                  >
                    {cell === "PLAYER"
                      ? "O"
                      : cell === "DEFENDER"
                      ? "X"
                      : ""}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-center text-slate-300 mb-2">
          {statusMessage}
        </div>

        <div className="text-xs text-center text-slate-500">
          Status: <span className="font-semibold">{status}</span>
        </div>
      </div>
    </div>
  );
};

export default Page;
