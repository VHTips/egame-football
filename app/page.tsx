"use client";
// egame-football-v.09_11_26_25_1626_resize reshape

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

// Generate defenders away from the player and from each other
const generateDefenders = (player: Position): Position[] => {
  const defenders: Position[] = [];

  while (defenders.length < NUM_DEFENDERS) {
    const pos: Position = {
      row: randomInt(0, ROWS - 1),
      col: randomInt(3, COLS - 1), // keep them away from the very left edge
    };

    const collidesWithPlayer = positionsEqual(pos, player);
    const collidesWithDefender = defenders.some((d) => positionsEqual(d, pos));

    if (!collidesWithPlayer && !collidesWithDefender) {
      defenders.push(pos);
    }
  }

  return defenders;
};

const clamp = (val: number, min: number, max: number) =>
  Math.max(min, Math.min(max, val));

// Defenders move on independent random delays (1 or 1.5 seconds)
function randomDefenderDelayMs(): number {
  return Math.random() < 0.5 ? 1000 : 1500;
}

// Compute the next position for a given defender, chasing the player
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
    // Try vertical move first
    if (verticalDir !== 0) {
      candidates.push({
        row: current.row + verticalDir,
        col: current.col,
      });
    }
    // Then horizontal move
    if (horizontalDir !== 0) {
      candidates.push({
        row: current.row,
        col: current.col + horizontalDir,
      });
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

const pageStyle =
  "min-h-screen flex items-center justify-center bg-slate-900 text-slate-100";

// Start position: center row (row 3 visually), col 1
const PLAYER_START: Position = { row: 2, col: 1 };

const Page: React.FC = () => {
  const [player, setPlayer] = useState<Position>(() => PLAYER_START);
  const [defenders, setDefenders] = useState<Position[]>([]);
  const [status, setStatus] = useState<GameStatus>("PLAYING");

  // Tackle flash state
  const [tackleFlashPos, setTackleFlashPos] = useState<Position | null>(null);
  const [tackleFlashActive, setTackleFlashActive] = useState(false);
  const [tackleFlashIndex, setTackleFlashIndex] = useState(0);

  // Refs so timeouts and handlers see latest values
  const playerRef = useRef<Position>(PLAYER_START);
  const statusRef = useRef<GameStatus>("PLAYING");
  const defendersTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  // Schedule a movement timeout for a specific defender index
  const scheduleDefenderMove = useCallback(
    (index: number) => {
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

          const nextPos = getNextDefenderPosition(
            currentDef,
            currentPlayer,
            beforeMove,
            index
          );

          beforeMove[index] = nextPos;

          // Check for collision with player
          if (positionsEqual(nextPos, currentPlayer)) {
            // Start tackle flash
            setTackleFlashPos(nextPos);
            setTackleFlashActive(true);
            setTackleFlashIndex(0);

            if (!tackleSoundPlayedRef.current && tackleSoundRef.current) {
              tackleSoundPlayedRef.current = true;
              try {
                tackleSoundRef.current.currentTime = 0;
                void tackleSoundRef.current.play();
              } catch {
                // ignore play errors
              }
            }
            statusRef.current = "TACKLED";
            setStatus("TACKLED");
            return beforeMove;
          }

          return beforeMove;
        });

        if (statusRef.current === "PLAYING") {
          scheduleDefenderMove(index);
        }
      }, delay);

      defendersTimeoutsRef.current[index] = timeoutId;
    },
    [setDefenders]
  );

  const initGame = useCallback(() => {
    clearDefenderTimeouts();

    const startPlayer: Position = { ...PLAYER_START };
    setPlayer(startPlayer);
    playerRef.current = startPlayer;

    setStatus("PLAYING");
    statusRef.current = "PLAYING";
    tackleSoundPlayedRef.current = false;

    // reset tackle flash
    setTackleFlashActive(false);
    setTackleFlashPos(null);
    setTackleFlashIndex(0);

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

  // Handle keyboard input
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

      if (statusRef.current !== "PLAYING") {
        return;
      }

      let dRow = 0;
      let dCol = 0;

      if (key === "ArrowUp") dRow = -1;
      else if (key === "ArrowDown") dRow = 1;
      else if (key === "ArrowLeft") dCol = -1;
      else if (key === "ArrowRight") dCol = 1;
      else return;

      setPlayer((prev) => {
        const next: Position = {
          row: clamp(prev.row + dRow, 0, ROWS - 1),
          col: clamp(prev.col + dCol, 0, COLS - 1),
        };

        const moved = next.row !== prev.row || next.col !== prev.col;

        // Touchdown?
        if (next.col === COLS - 1) {
          setStatus("TOUCHDOWN");
          statusRef.current = "TOUCHDOWN";

          // Play touchdown sound immediately
          if (touchdownSoundRef.current) {
            try {
              touchdownSoundRef.current.currentTime = 0;
              void touchdownSoundRef.current.play();
            } catch {
              // ignore play errors
            }
          }
        }

        // Collision with defender?
        if (defenders.some((d) => positionsEqual(d, next))) {
          // Start tackle flash
          setTackleFlashPos(next);
          setTackleFlashActive(true);
          setTackleFlashIndex(0);

          if (!tackleSoundPlayedRef.current && tackleSoundRef.current) {
            tackleSoundPlayedRef.current = true;
            try {
              tackleSoundRef.current.currentTime = 0;
              void tackleSoundRef.current.play();
            } catch {
              // ignore play errors
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
            // Ignore play errors
          }
        }

        playerRef.current = next;
        return next;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [defenders, initGame]);

  // Tackle flash effect (2 seconds, 125ms per color step)
  useEffect(() => {
    if (!tackleFlashActive || !tackleFlashPos) {
      return;
    }

    const startTime = Date.now();

    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= 2000) {
        setTackleFlashActive(false);
        setTackleFlashPos(null);
        setTackleFlashIndex(0);
        clearInterval(intervalId);
        return;
      }
      setTackleFlashIndex((prev) => (prev + 1) % 4);
    }, 125);

    return () => clearInterval(intervalId);
  }, [tackleFlashActive, tackleFlashPos]);

  // Build the grid representation for rendering
  const grid = useMemo(() => {
    const base = createEmptyGrid();

    base[player.row][player.col] = "PLAYER";
    defenders.forEach((d) => {
      base[d.row][d.col] = "DEFENDER";
    });

    return base;
  }, [player, defenders]);

  return (
    <div className={pageStyle}>
      <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-600">
        {/* Flat field: solid green interior, blue end zones;
            X/O squares and flash rendered on top */}
        <div className="inline-block bg-emerald-900 border border-emerald-700 rounded-xl p-0 overflow-hidden">
          {grid.map((row, rIdx) => (
            <div key={rIdx} className="flex">
              {row.map((cell, cIdx) => {
                const isEndZone = cIdx === 0 || cIdx === COLS - 1;
                const isPlayer = cell === "PLAYER";
                const isDefender = cell === "DEFENDER";

                const isTackleFlashCell =
                  tackleFlashActive &&
                  tackleFlashPos &&
                  tackleFlashPos.row === rIdx &&
                  tackleFlashPos.col === cIdx;

                // Outer field cell: flat green or blue, no borders, no gaps
                const outerFieldClasses = isEndZone
                  ? "w-10 h-10 flex items-center justify-center bg-blue-900"
                  : "w-10 h-10 flex items-center justify-center bg-emerald-900";

                // Inner square (player/defender/flash), centered in field cell
                let innerSquare: React.ReactNode = null;

                if (isTackleFlashCell) {
                  // 0: white, 1: black, 2: bright red, 3: bright blue
                  let flashClasses = "";
                  if (tackleFlashIndex === 0) {
                    flashClasses = "bg-white text-black border border-white";
                  } else if (tackleFlashIndex === 1) {
                    flashClasses = "bg-black text-white border border-white";
                  } else if (tackleFlashIndex === 2) {
                    flashClasses =
                      "bg-red-500 text-white border border-red-200";
                  } else {
                    flashClasses =
                      "bg-sky-500 text-black border border-sky-200";
                  }
                  innerSquare = (
                    <div
                      className={`w-9 h-9 rounded-sm flex items-center justify-center text-sm font-bold ${flashClasses}`}
                    >
                      {isPlayer ? "O" : isDefender ? "X" : ""}
                    </div>
                  );
                } else if (isPlayer) {
                  innerSquare = (
                    <div className="w-9 h-9 rounded-sm flex items-center justify-center text-sm font-bold bg-emerald-300 text-slate-900 border border-emerald-100">
                      O
                    </div>
                  );
                } else if (isDefender) {
                  innerSquare = (
                    <div className="w-9 h-9 rounded-sm flex items-center justify-center text-sm font-bold bg-red-700 text-red-100 border border-red-300/80">
                      X
                    </div>
                  );
                }

                return (
                  <div key={cIdx} className={outerFieldClasses}>
                    {innerSquare}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Page;
