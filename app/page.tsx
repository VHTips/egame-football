"use client";

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

const PLAYER_START: Position = { row: 2, col: 1 };

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
    const pos = {
      row: randomInt(0, ROWS - 1),
      col: randomInt(3, COLS - 1),
    };
    if (
      !positionsEqual(pos, player) &&
      !defenders.some((d) => positionsEqual(d, pos))
    ) {
      defenders.push(pos);
    }
  }
  return defenders;
};

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

function randomDefenderDelayMs() {
  return Math.random() < 0.5 ? 1000 : 1500;
}

const inBounds = (pos: Position) =>
  pos.row >= 0 && pos.row < ROWS && pos.col >= 0 && pos.col < COLS;

const manhattan = (a: Position, b: Position) =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col);

const Page: React.FC = () => {
  const [player, setPlayer] = useState<Position>(PLAYER_START);
  const [defenders, setDefenders] = useState<Position[]>([]);
  const [status, setStatus] = useState<GameStatus>("PLAYING");

  // Tackle flash state
  const [tackleFlashPos, setTackleFlashPos] = useState<Position | null>(null);
  const [tackleFlashActive, setTackleFlashActive] = useState(false);
  const [tackleFlashIndex, setTackleFlashIndex] = useState(0);

  const playerRef = useRef(player);
  const statusRef = useRef(status);
  const defenderTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const flashIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const moveSoundRef = useRef<HTMLAudioElement | null>(null);
  const touchdownSoundRef = useRef<HTMLAudioElement | null>(null);
  const tackleSoundRef = useRef<HTMLAudioElement | null>(null);
  const tacklePlayedRef = useRef(false);

  useEffect(() => {
    moveSoundRef.current = new Audio("/sounds/move.wav");
    touchdownSoundRef.current = new Audio("/sounds/touchdown.wav");
    tackleSoundRef.current = new Audio("/sounds/hitHurt.wav");
  }, []);

  useEffect(() => {
    playerRef.current = player;
    statusRef.current = status;
  }, [player, status]);

  const clearDefenders = useCallback(() => {
    defenderTimers.current.forEach(clearTimeout);
    defenderTimers.current = [];
  }, []);

  const clearTackleFlashTimers = useCallback(() => {
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
      flashIntervalRef.current = null;
    }
    if (flashStopTimeoutRef.current) {
      clearTimeout(flashStopTimeoutRef.current);
      flashStopTimeoutRef.current = null;
    }
  }, []);

  const startTackleFlash = useCallback(
    (pos: Position) => {
      clearTackleFlashTimers();
      setTackleFlashPos(pos);
      setTackleFlashActive(true);
      setTackleFlashIndex(0);

      flashIntervalRef.current = setInterval(() => {
        setTackleFlashIndex((prev) => (prev + 1) % 4);
      }, 125);

      flashStopTimeoutRef.current = setTimeout(() => {
        clearTackleFlashTimers();
        setTackleFlashActive(false);
        setTackleFlashPos(null);
        setTackleFlashIndex(0);
      }, 2000);
    },
    [clearTackleFlashTimers]
  );

  const chooseDefenderNext = useCallback((d: Position, p: Position): Position => {
    const dr = Math.sign(p.row - d.row);
    const dc = Math.sign(p.col - d.col);

    const verticalToward: Position = { row: d.row + dr, col: d.col };
    const horizontalToward: Position = { row: d.row, col: d.col + dc };

    const verticalValid = dr !== 0 && inBounds(verticalToward);
    const horizontalValid = dc !== 0 && inBounds(horizontalToward);

    const preferVertical = Math.random() < 0.8;

    const primary = preferVertical ? verticalToward : horizontalToward;
    const secondary = preferVertical ? horizontalToward : verticalToward;

    const primaryValid =
      (preferVertical ? verticalValid : horizontalValid) &&
      !positionsEqual(primary, d);

    const secondaryValid =
      (preferVertical ? horizontalValid : verticalValid) &&
      !positionsEqual(secondary, d);

    if (primaryValid) return primary;
    if (secondaryValid) return secondary;

    const candidates: Position[] = [
      { row: d.row - 1, col: d.col },
      { row: d.row + 1, col: d.col },
      { row: d.row, col: d.col - 1 },
      { row: d.row, col: d.col + 1 },
    ].filter(inBounds);

    const curDist = manhattan(d, p);
    const better = candidates.filter((c) => manhattan(c, p) < curDist);
    if (better.length > 0) {
      return better[Math.floor(Math.random() * better.length)];
    }

    return candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : d;
  }, []);

  const scheduleDefender = useCallback(
    (i: number) => {
      const id = setTimeout(() => {
        if (statusRef.current !== "PLAYING") return;

        setDefenders((prev) => {
          const next = [...prev];
          const d = next[i];
          const p = playerRef.current;

          next[i] = chooseDefenderNext(d, p);

          if (positionsEqual(next[i], p)) {
            startTackleFlash(next[i]);

            if (!tacklePlayedRef.current && tackleSoundRef.current) {
              tacklePlayedRef.current = true;
              try {
                tackleSoundRef.current.currentTime = 0;
                void tackleSoundRef.current.play();
              } catch {
                // ignore
              }
            }

            setStatus("TACKLED");
          }

          return next;
        });

        if (statusRef.current === "PLAYING") scheduleDefender(i);
      }, randomDefenderDelayMs());

      defenderTimers.current[i] = id;
    },
    [chooseDefenderNext, startTackleFlash]
  );

  const initGame = useCallback(() => {
    clearDefenders();
    clearTackleFlashTimers();

    tacklePlayedRef.current = false;

    setTackleFlashPos(null);
    setTackleFlashActive(false);
    setTackleFlashIndex(0);

    setPlayer(PLAYER_START);
    setStatus("PLAYING");

    const defs = generateDefenders(PLAYER_START);
    setDefenders(defs);
    defs.forEach((_, i) => scheduleDefender(i));
  }, [clearDefenders, clearTackleFlashTimers, scheduleDefender]);

  useEffect(() => {
    initGame();
    return () => {
      clearDefenders();
      clearTackleFlashTimers();
    };
  }, [initGame, clearDefenders, clearTackleFlashTimers]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (statusRef.current !== "PLAYING") {
        if (e.key === "Enter") initGame();
        return;
      }

      let dr = 0;
      let dc = 0;

      if (e.key === "ArrowUp") dr = -1;
      else if (e.key === "ArrowDown") dr = 1;
      else if (e.key === "ArrowLeft") dc = -1;
      else if (e.key === "ArrowRight") dc = 1;
      else return;

      setPlayer((prev) => {
        const next = {
          row: clamp(prev.row + dr, 0, ROWS - 1),
          col: clamp(prev.col + dc, 0, COLS - 1),
        };

        if (moveSoundRef.current) {
          try {
            moveSoundRef.current.currentTime = 0;
            void moveSoundRef.current.play();
          } catch {
            // ignore
          }
        }

        if (next.col === COLS - 1) {
          if (touchdownSoundRef.current) {
            try {
              touchdownSoundRef.current.currentTime = 0;
              void touchdownSoundRef.current.play();
            } catch {
              // ignore
            }
          }
          setStatus("TOUCHDOWN");
        }

        if (defenders.some((d) => positionsEqual(d, next))) {
          startTackleFlash(next);

          if (!tacklePlayedRef.current && tackleSoundRef.current) {
            tacklePlayedRef.current = true;
            try {
              tackleSoundRef.current.currentTime = 0;
              void tackleSoundRef.current.play();
            } catch {
              // ignore
            }
          }

          setStatus("TACKLED");
        }

        return next;
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [defenders, initGame, startTackleFlash]);

  const grid = useMemo(() => {
    const g = createEmptyGrid();
    g[player.row][player.col] = "PLAYER";
    defenders.forEach((d) => (g[d.row][d.col] = "DEFENDER"));
    return g;
  }, [player, defenders]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      {/* STADIUM WRAPPER */}
      <div
        className="relative rounded-3xl overflow-hidden"
        style={{
          width: 640,
          height: 360,
          backgroundImage: "url('/images/stadium.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* CENTERED FIELD */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="relative rounded-xl overflow-hidden"
            style={{
              width: 480,
              height: 200,
              backgroundImage: "url('/images/field.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {/* GRID + PIECES */}
            <div className="absolute inset-0 z-10">
              {grid.map((row, rIdx) => (
                <div key={rIdx} className="flex">
                  {row.map((cell, cIdx) => {
                    const isPlayer = cell === "PLAYER";
                    const isDefender = cell === "DEFENDER";

                    const isTackleFlashCell =
                      tackleFlashActive &&
                      tackleFlashPos &&
                      tackleFlashPos.row === rIdx &&
                      tackleFlashPos.col === cIdx;

                    let innerSquare: React.ReactNode = null;

                    if (isTackleFlashCell) {
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
                        <div className="w-9 h-9 rounded-sm flex items-center justify-center text-sm font-bold bg-white text-slate-900 border border-emerald-100">
                          34
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
                      <div
                        key={cIdx}
                        className="w-10 h-10 flex items-center justify-center"
                      >
                        {innerSquare}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Page;
