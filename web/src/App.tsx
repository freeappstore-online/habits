import { useState, useEffect, useCallback, useMemo } from "react";
import { Shell } from "./components/Shell";

/* -- Types ------------------------------------------------ */

interface Habit {
  id: string;
  name: string;
  emoji: string;
  completions: string[]; // "YYYY-MM-DD"
}

/* -- Helpers ---------------------------------------------- */

const STORAGE_KEY = "habits-data";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build array of dates for the last ~3 months (91 days), oldest first. */
function last91Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 90; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(fmtDate(d));
  }
  return days;
}

/**
 * Arrange 91 days into a grid of 13 columns (weeks) x 7 rows (days).
 * Each cell is either a date string or null (padding at the start).
 * Rows: 0=Sun .. 6=Sat. Columns: weeks, newest on the right.
 */
function buildCalendarGrid(days: string[]): (string | null)[][] {
  // 7 rows, up to 14 columns
  const rows: (string | null)[][] = Array.from({ length: 7 }, () => []);
  // Figure out the day-of-week of the first date
  const firstDow = new Date(days[0]! + "T00:00:00").getDay();
  // Pad the first week
  for (let r = 0; r < firstDow; r++) {
    rows[r]!.push(null);
  }
  for (const day of days) {
    const dow = new Date(day + "T00:00:00").getDay();
    rows[dow]!.push(day);
  }
  // Pad to equal length
  const maxLen = Math.max(...rows.map((r) => r.length));
  for (const row of rows) {
    while (row.length < maxLen) row.push(null);
  }
  return rows;
}

function calcStreaks(completions: string[]): { current: number; best: number } {
  if (completions.length === 0) return { current: 0, best: 0 };

  const sorted = [...new Set(completions)].sort().reverse();
  const td = todayStr();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yd = fmtDate(yesterday);

  // Current streak: consecutive days ending at today or yesterday
  let current = 0;
  const startDate =
    sorted[0] === td || sorted[0] === yd ? sorted[0] : null;
  if (startDate) {
    const ref = new Date(startDate + "T00:00:00");
    for (let i = 0; i < sorted.length; i++) {
      const expected = new Date(ref);
      expected.setDate(expected.getDate() - i);
      if (sorted[i] === fmtDate(expected)) {
        current++;
      } else {
        break;
      }
    }
  }

  // Best streak
  const asc = [...sorted].reverse();
  let best = 0;
  let run = 1;
  for (let i = 1; i < asc.length; i++) {
    const prev = new Date(asc[i - 1]! + "T00:00:00");
    prev.setDate(prev.getDate() + 1);
    if (asc[i] === fmtDate(prev)) {
      run++;
    } else {
      best = Math.max(best, run);
      run = 1;
    }
  }
  best = Math.max(best, run);

  return { current, best };
}

function loadHabits(): Habit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Habit[];
  } catch {
    /* ignore corrupt data */
  }
  return [];
}

function saveHabits(habits: Habit[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
}

/* -- Heatmap cell colour ---------------------------------- */

function cellColor(filled: boolean, isToday: boolean): string {
  if (filled) return "var(--color-accent)";
  if (isToday) return "var(--color-muted)";
  return "var(--color-line)";
}

/* -- Sub-components --------------------------------------- */

function CalendarHeatmap({
  completionSet,
  days,
  grid,
}: {
  completionSet: Set<string>;
  days: string[];
  grid: (string | null)[][];
}) {
  const td = todayStr();
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  // Month labels: find the first occurrence of each month in the days array
  const months: { label: string; col: number }[] = [];
  let lastMonth = "";
  for (const day of days) {
    const m = day.slice(0, 7); // "YYYY-MM"
    if (m !== lastMonth) {
      lastMonth = m;
      const dow = new Date(day + "T00:00:00").getDay();
      // Figure out which column this day is in for row=dow
      const row = grid[dow]!;
      const col = row.indexOf(day);
      if (col >= 0) {
        const d = new Date(day + "T00:00:00");
        months.push({
          label: d.toLocaleDateString(undefined, { month: "short" }),
          col,
        });
      }
    }
  }

  return (
    <div style={{ overflowX: "auto" }}>
      {/* Month labels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `16px repeat(${grid[0]!.length}, 12px)`,
          gap: "3px",
          marginBottom: 2,
        }}
      >
        <div />
        {Array.from({ length: grid[0]!.length }, (_, c) => {
          const m = months.find((mo) => mo.col === c);
          return (
            <div
              key={c}
              style={{
                fontSize: 9,
                color: "var(--color-muted)",
                lineHeight: "12px",
                whiteSpace: "nowrap",
              }}
            >
              {m ? m.label : ""}
            </div>
          );
        })}
      </div>
      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `16px repeat(${grid[0]!.length}, 12px)`,
          gridTemplateRows: `repeat(7, 12px)`,
          gap: "3px",
        }}
      >
        {grid.map((row, r) => (
          <>
            <div
              key={`label-${r}`}
              style={{
                fontSize: 9,
                color: "var(--color-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: "12px",
              }}
            >
              {r % 2 === 1 ? dayLabels[r] : ""}
            </div>
            {row.map((day, c) => (
              <div
                key={`${r}-${c}`}
                title={day ? `${day}${completionSet.has(day) ? " - done" : ""}` : ""}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: day
                    ? cellColor(completionSet.has(day), day === td)
                    : "transparent",
                  opacity: day ? 1 : 0,
                  transition: "background 0.15s ease",
                }}
              />
            ))}
          </>
        ))}
      </div>
    </div>
  );
}

function HabitCard({
  habit,
  isDone,
  onToggle,
  onDelete,
  days,
  grid,
  expanded,
  onToggleExpand,
}: {
  habit: Habit;
  isDone: boolean;
  onToggle: () => void;
  onDelete: () => void;
  days: string[];
  grid: (string | null)[][];
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { current, best } = calcStreaks(habit.completions);
  const completionSet = useMemo(
    () => new Set(habit.completions),
    [habit.completions],
  );

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--color-line)",
        background: "var(--color-panel)",
        overflow: "hidden",
      }}
    >
      {/* Top row: toggle + name + streaks + delete */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
        }}
      >
        <button
          onClick={onToggle}
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: isDone ? "none" : "2px solid var(--color-muted)",
            background: isDone ? "var(--color-accent)" : "transparent",
            color: isDone ? "#fff" : "transparent",
            fontSize: 15,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
            transition: "all 0.15s ease",
            padding: 0,
          }}
          aria-label={isDone ? "Mark not done" : "Mark done"}
        >
          {isDone ? "\u2713" : ""}
        </button>

        <button
          onClick={onToggleExpand}
          style={{
            flex: 1,
            minWidth: 0,
            background: "none",
            border: "none",
            padding: 0,
            textAlign: "left",
            cursor: "pointer",
            color: "var(--color-ink)",
            fontFamily: "var(--font-body)",
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textDecoration: isDone ? "line-through" : "none",
              opacity: isDone ? 0.6 : 1,
            }}
          >
            {habit.emoji ? `${habit.emoji} ` : ""}
            {habit.name}
          </span>
        </button>

        <div
          style={{
            display: "flex",
            gap: 10,
            fontSize: 12,
            color: "var(--color-muted)",
            flexShrink: 0,
            alignItems: "center",
          }}
        >
          {current > 0 && (
            <span
              style={{
                color: "var(--color-accent)",
                fontWeight: 600,
              }}
              title="Current streak"
            >
              {current}d
            </span>
          )}
          {best > 0 && (
            <span title="Best streak">
              Best {best}d
            </span>
          )}
        </div>

        <button
          onClick={onDelete}
          style={{
            background: "none",
            border: "none",
            padding: 4,
            cursor: "pointer",
            color: "var(--color-muted)",
            fontSize: 13,
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="Delete habit"
        >
          &#10005;
        </button>
      </div>

      {/* Expandable heatmap */}
      {expanded && (
        <div
          style={{
            padding: "0 16px 14px",
            borderTop: "1px solid var(--color-line)",
            paddingTop: 12,
          }}
        >
          <CalendarHeatmap
            completionSet={completionSet}
            days={days}
            grid={grid}
          />
        </div>
      )}
    </div>
  );
}

/* -- Main App --------------------------------------------- */

export function App() {
  const [habits, setHabits] = useState<Habit[]>(loadHabits);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    saveHabits(habits);
  }, [habits]);

  const addHabit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setHabits((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: trimmed,
        emoji: emoji.trim(),
        completions: [],
      },
    ]);
    setName("");
    setEmoji("");
  }, [name, emoji]);

  const toggleToday = useCallback((id: string) => {
    const d = todayStr();
    setHabits((prev) =>
      prev.map((h) =>
        h.id === id
          ? {
              ...h,
              completions: h.completions.includes(d)
                ? h.completions.filter((c) => c !== d)
                : [...h.completions, d],
            }
          : h,
      ),
    );
  }, []);

  const deleteHabit = useCallback((id: string) => {
    if (!confirm("Delete this habit and all its history?")) return;
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const days = useMemo(() => last91Days(), []);
  const grid = useMemo(() => buildCalendarGrid(days), [days]);
  const td = todayStr();

  const doneCount = habits.filter((h) =>
    h.completions.includes(td),
  ).length;

  return (
    <Shell>
      {/* -- Header ---------------------------------------- */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Today
        </h1>
        <p
          style={{
            color: "var(--color-muted)",
            fontSize: 14,
            margin: "4px 0 0",
          }}
        >
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
          {habits.length > 0 && (
            <>
              {" "}
              &middot; {doneCount}/{habits.length} done
            </>
          )}
        </p>
      </div>

      {/* -- Progress bar ---------------------------------- */}
      {habits.length > 0 && (
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: "var(--color-line)",
            marginBottom: 24,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${(doneCount / habits.length) * 100}%`,
              background: "var(--color-accent)",
              borderRadius: 3,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}

      {/* -- Habit list (hero) ----------------------------- */}
      {habits.length === 0 && (
        <p style={{ color: "var(--color-muted)", fontSize: 14 }}>
          No habits yet. Add one below to start tracking.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {habits.map((habit) => {
          const isDone = habit.completions.includes(td);
          return (
            <HabitCard
              key={habit.id}
              habit={habit}
              isDone={isDone}
              onToggle={() => toggleToday(habit.id)}
              onDelete={() => deleteHabit(habit.id)}
              days={days}
              grid={grid}
              expanded={expandedId === habit.id}
              onToggleExpand={() =>
                setExpandedId((prev) =>
                  prev === habit.id ? null : habit.id,
                )
              }
            />
          );
        })}
      </div>

      {/* -- Add form -------------------------------------- */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addHabit();
        }}
        style={{
          display: "flex",
          gap: 8,
          marginTop: 24,
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="New habit..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            flex: 1,
            minWidth: 140,
            padding: "10px 14px",
            fontSize: 14,
            border: "1px solid var(--color-line)",
            borderRadius: "var(--radius-btn)",
            background: "var(--color-panel)",
            color: "var(--color-ink)",
            outline: "none",
            fontFamily: "var(--font-body)",
          }}
        />
        <input
          type="text"
          placeholder="Emoji"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          maxLength={2}
          style={{
            width: 56,
            padding: "10px 0",
            fontSize: 14,
            border: "1px solid var(--color-line)",
            borderRadius: "var(--radius-btn)",
            background: "var(--color-panel)",
            color: "var(--color-ink)",
            outline: "none",
            textAlign: "center",
            fontFamily: "var(--font-body)",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 600,
            border: "none",
            borderRadius: "var(--radius-btn)",
            background: "var(--color-accent)",
            color: "#fff",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
          }}
        >
          Add
        </button>
      </form>

      {/* -- Footer (mobile) ------------------------------- */}
      <div
        style={{
          marginTop: 40,
          textAlign: "center",
          fontSize: 12,
          color: "var(--color-muted)",
        }}
        className="md:hidden"
      >
        <a
          href="https://freeappstore.online"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--color-muted)" }}
        >
          Part of FreeAppStore — free forever
        </a>
      </div>
    </Shell>
  );
}

export default App;
