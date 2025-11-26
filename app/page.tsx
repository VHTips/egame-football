"use client";
// egame-football_11_26_25_1312_tackle-sound

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
const COLS = 12;
const NUM_DEFENDERS = 6;

// Helper to create an empty grid
const createEmptyGrid = (): CellType[][] =>
  Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => "EMPTY" as CellType)
  );

const positionsEqual = (a: Position, b: Position) =>
  a.row === b.row && a.col === b.col;

const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// Generate defenders in random, non-overlapping positions
// making sure they don't spawn on the player.
const generateDefenders = (player: Position): Position[] => {
  const defenders: Position[] = [];

  while (defenders.length < NUM_DEFENDERS) {
    // Keep defenders away from the first two columns so the player
    // has a little space.
    const row = randomInt(0, ROWS - 1);
    const col = randomInt(3, COLS - 1);

    const candidate = { row, col };

    // Avoid collisions with player or existing defenders
    const collidesWithPlayer = positionsEqual(candidate, player);
    const collidesWithDefender = defenders.some((d) =>
      positionsEqual(d, candidate)
    );

    if (!collidesWithPlayer && !collidesWithDefender) {
      defenders.push(candidate);
    }
  }

  return defenders;
};

// Random delay helper (each defender gets its own timing)
const randomDefenderDelayMs = () =>
  (Math.random() < 0.5 ? 1000 : 1500) + randomInt(-100, 100);

// Simple movement helpers for defenders
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

// Checks if a defender can move into the target cell
// (no overlapping other defenders; the player is allowed).
const canMoveIntoCell = (
  target: Position,
  defenders: Position[],
  selfIndex: number
) => {
  return !defenders.some(
    (d, idx) => idx !== selfIndex && positionsEqual(d, target)
  );
};

const getNextDefenderPosition = (
  defender: Position,
  player: Position,
  defenders: Position[],
  index: number
): Position => {
  // 80% of the time: move toward the player
  // 20%: random cardinal step for some jitter
  const chaseBias = Math.random();
  const current = defender;

  const candidates: Position[] = [];

  if (chaseBias < 0.8) {
    // Move toward the player (vertical or horizontal)
    const rowDiff = player.row - current.row;
    const colDiff = player.col - current.col;

    const verticalDir = rowDiff === 0 ? 0 : rowDiff > 0 ? 1 : -1;
    const horizontalDir = colDiff === 0 ? 0 : colDiff > 0 ? 1 : -1;

    // Try vertical move first if row difference is larger
    if (Math.abs(rowDiff) >= Math.abs(colDiff)) {
      if (verticalDir !== 0) {
        candidates.push({
          row: clamp(current.row + verticalDir, 0, ROWS - 1),
          col: current.col,
        });
      }
      if (horizontalDir !== 0) {
        candidates.push({
          row: current.row,
          col: clamp(current.col + horizontalDir, 0, COLS - 1),
        });
      }
    } else {
      if (horizontalDir !== 0) {
        candidates.push({
          row: current.row,
          col: clamp(current.col + horizontalDir, 0, COLS - 1),
        });
      }
      if (verticalDir !== 0) {
        candidates.push({
          row: clamp(current.row + verticalDir, 0, ROWS - 1),
          col: current.col,
        });
      }
    }
  } else {
    // Random cardinal step (up, down, left, right)
    const directions: Position[] = [
      { row: current.row - 1, col: current.col },
      { row: current.row + 1, col: current.col },
      { row: current.row, col: current.col - 1 },
      { row: current.row, col: current.col + 1 },
    ];

    for (const dir of directions) {
      candidates.push({
        row: clamp(dir.row, 0, ROWS - 1),
        col: clamp(dir.col, 0, COLS - 1),
      });
    }
  }

  // Filter out candidates that are invalid (overlap defenders, etc.)
  const validCandidates = candidates.filter((candidate) =>
    canMoveIntoCell(candidate, defenders, index)
  );

  // If no valid candidate, stay in place
  if (validCandidates.length === 0) return current;

  // Randomly pick among the valid candidates
  return validCandidates[randomInt(0, validCandidates.length - 1)];
};

const PLAYER_START: Position = { row: 3, col: 1 };

const Page: React.FC = () => {
  const [player, setPlayer] = useState<Position>(PLAYER_START);
  const [defenders, setDefenders] = useState<Position[]>([]);
  const [status, setStatus] = useState<GameStatus>("PLAYING");

  // Refs for current values used in async logic
  const playerRef = useRef<Position>(PLAYER_START);
  const statusRef = useRef<GameStatus>("PLAYING");
  const defendersTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Sound refs
  const moveSoundRef = useRef<HTMLAudioElement | null>(null);
  const touchdownSoundRef = useRef<HTMLAudioElement | null>(null);
  const tackleSoundRef = useRef<HTMLAudioElement | null>(null);
  const tackleSoundPlayedRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Initialize sounds on client
  useEffect(() => {
    moveSoundRef.current = new Audio("/sounds/move.wav");
    touchdownSoundRef.current = new Audio("/sounds/touchdown.wav");
    tackleSoundRef.current = new Audio("/sounds/hitHurt.wav");

    if (touchdownSoundRef.current) {
      touchdownSoundRef.current.volume = 1.0;
    }
    if (tackleSoundRef.current) {
      tackleSoundRef.current.volume = 1.0;
    }
  }, []);

  const clearDefenderTimeouts = useCallback(() => {
    defendersTimeoutsRef.current.forEach((id) => clearTimeout(id));
    defendersTimeoutsRef.current = [];
  }, []);

  const scheduleDefenderMove = useCallback((index: number) => {
    const delay = randomDefenderDelayMs();

    const timeoutId = setTimeout(() => {
      if (statusRef.current !== "PLAYING") {
        return;
      }

      const currentPlayer = playerRef.current;

      setDefenders((prev) => {
        if (!prev[index]) return prev;

        const beforeMove = [...prev];
        const currentDef = beforeMove[index];

        // Compute the next position based on current player position
        const nextPos = getNextDefenderPosition(
          currentDef,
          currentPlayer,
          beforeMove,
          index
        );

        beforeMove[index] = nextPos;

        // Check for collision with player
        if (positionsEqual(nextPos, currentPlayer)) {
          if (!tackleSoundPlayedRef.current && tackleSoundRef.current) {
            tackleSoundPlayedRef.current = true;
            try {
              tackleSoundRef.current.currentTime = 0;
              void tackleSoundRef.current.play();
            } catch {
              // Ignore play errors (e.g., user/browser restrictions)
            }
          }
          statusRef.current = "TACKLED";
          setStatus("TACKLED");
          return beforeMove;
        }

        return beforeMove;
      });

      // Re-schedule this defender's movement if game still in progress
      if (statusRef.current === "PLAYING") {
        scheduleDefenderMove(index);
      }
    }, delay);

    defendersTimeoutsRef.current.push(timeoutId);
  }, []);

  const initGame = useCallback(() => {
    clearDefenderTimeouts();

    const startPlayer: Position = { ...PLAYER_START };
    setPlayer(startPlayer);
    playerRef.current = startPlayer;

    setStatus("PLAYING");
    statusRef.current = "PLAYING";
    tackleSoundPlayedRef.current = false;

    const newDefenders = generateDefenders(startPlayer);
    setDefenders(newDefenders);

    newDefenders.forEach((_, index) => {
      scheduleDefenderMove(index);
    });
  }, [clearDefenderTimeouts, scheduleDefenderMove]);

  // Run once on mount
  useEffect(() => {
    initGame();
    return () => {
      clearDefenderTimeouts();
    };
  }, [initGame, clearDefenderTimeouts]);

  // Keyboard handling for player movement and restarting
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (statusRef.current !== "PLAYING") {
        if (event.key === "Enter") {
          initGame();
        }
        return;
      }

      const { key } = event;
      let delta: Position | null = null;

      if (key === "ArrowUp") {
        delta = { row: -1, col: 0 };
      } else if (key === "ArrowDown") {
        delta = { row: 1, col: 0 };
      } else if (key === "ArrowLeft") {
        delta = { row: 0, col: -1 };
      } else if (key === "ArrowRight") {
        delta = { row: 0, col: 1 };
      }

      if (!delta) return;

      setPlayer((prev) => {
        const next = {
          row: clamp(prev.row + delta!.row, 0, ROWS - 1),
          col: clamp(prev.col + delta!.col, 0, COLS - 1),
        };

        const moved = !positionsEqual(prev, next);

        // Check for touchdown
        if (next.col === COLS - 1) {
          setStatus("TOUCHDOWN");
          statusRef.current = "TOUCHDOWN";

          if (touchdownSoundRef.current) {
            try {
              touchdownSoundRef.current.currentTime = 0;
              void touchdownSoundRef.current.play();
            } catch {
              // Ignore play errors (e.g., user/browser restrictions)
            }
          }

          playerRef.current = next;
          return next;
        }

        // Collision with defender?
        if (defenders.some((d) => positionsEqual(d, next))) {
          if (!tackleSoundPlayedRef.current && tackleSoundRef.current) {
            tackleSoundPlayedRef.current = true;
            try {
              tackleSoundRef.current.currentTime = 0;
              void tackleSoundRef.current.play();
            } catch {
              // Ignore play errors
            }
          }
          setStatus("TACKLED");
          statusRef.current = "TACKLED";
        }

        // Play move sound only if we actually moved to a new cell
        if (moved && moveSoundRef.current) {
          try {
            moveSoundRef.current.currentTime = 0;
            void moveSoundRef.current.play();
          } catch {
            // Ignore play errors (e.g., user/browser restrictions)
          }
        }

        playerRef.current = next;
        return next;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [defenders, initGame]);

  // Build the grid representation for rendering
  const grid = useMemo(() => {
    const gridData = createEmptyGrid();

    // Place defenders
    defenders.forEach((def) => {
      gridData[def.row][def.col] = "DEFENDER";
    });

    // Place player (overwrites defender if in same cell, though in practice
    // we handle the collision as TACKLED)
    gridData[PLAYER_START.row][PLAYER_START.col] = "EMPTY";
    gridData[player.row][player.col] = "PLAYER";

    return gridData;
  }, [player, defenders]);

  const pageStyle =
    "min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4";

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
          <p className="text-xs text-slate-300">{statusText}</p>
        </div>

        <div className="inline-block border-4 border-slate-600 rounded-xl overflow-hidden">
          {/* Grid container */}
          {grid.map((row, rowIndex) => (
            <div key={rowIndex} className="flex">
              {row.map((cell, colIndex) => {
                const isEndZone = colIndex === 0 || colIndex === COLS - 1;
                const isPlayer = cell === "PLAYER";
                const isDefender = cell === "DEFENDER";

                const baseClasses =
                  "w-6 h-6 flex items-center justify-center text-xs font-bold";
                const cellClasses = isEndZone
                  ? "bg-blue-800"
                  : "bg-green-800 border border-green-900";

                const contentClasses = isPlayer
                  ? "text-green-200"
                  : isDefender
                  ? "text-red-300"
                  : "text-transparent";

                return (
                  <div
                    key={colIndex}
                    className={`${baseClasses} ${cellClasses}`}
                  >
                    <span className={contentClasses}>
                      {cell === "PLAYER"
                        ? "O"
                        : cell === "DEFENDER"
                        ? "X"
                        : ""}
                    </span>
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
