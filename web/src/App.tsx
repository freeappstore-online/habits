import { useState, useEffect, useCallback } from "react";
import { Shell } from "./components/Shell";

/* ── Types ────────────────────────────────────────── */

interface Habit {
  id: string;
  name: string;
  emoji: string;
  completions: string[]; // ISO date strings "YYYY-MM-DD"
}

/* ── Helpers ──────────────────────────────────────── */

const STORAGE_KEY = "habits-data";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function last30Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(dateStr(d));
  }
  return days;
}

function calcStreaks(completions: string[]): {
  current: number;
  best: number;
} {
  if (completions.length === 0) return { current: 0, best: 0 };

  const sorted = [...new Set(completions)].sort().reverse();
  const todayStr = today();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = dateStr(yesterday);

  // Current streak: count consecutive days ending at today or yesterday
  let current = 0;
  const startDate = sorted[0] === todayStr || sorted[0] === yesterdayStr ? sorted[0] : null;
  if (startDate) {
    const ref = new Date(startDate + "T00:00:00");
    for (let i = 0; i < sorted.length; i++) {
      const expected = new Date(ref);
      expected.setDate(expected.getDate() - i);
      if (sorted[i] === dateStr(expected)) {
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
    if (asc[i] === dateStr(prev)) {
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

/* ── Day label ────────────────────────────────────── */

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "narrow" });
}

/* ── Component ────────────────────────────────────── */

export default function App() {
  const [habits, setHabits] = useState<Habit[]>(loadHabits);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");

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
    const d = today();
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
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const days = last30Days();
  const todayStr = today();

  return (
    <Shell>
      <h1
        className="text-2xl font-bold mb-6"
        style={{ fontFamily: "Fraunces, serif" }}
      >
        Habit Tracker
      </h1>

      {/* ── Add form ──────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addHabit();
        }}
        className="flex gap-2 mb-8 flex-wrap"
      >
        <input
          type="text"
          placeholder="Habit name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[160px] px-3 py-2 text-sm border outline-none"
          style={{
            borderColor: "var(--line)",
            borderRadius: "0.75rem",
            background: "var(--panel)",
            color: "var(--ink)",
          }}
        />
        <input
          type="text"
          placeholder="Emoji"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          maxLength={2}
          className="w-16 px-3 py-2 text-sm border outline-none text-center"
          style={{
            borderColor: "var(--line)",
            borderRadius: "0.75rem",
            background: "var(--panel)",
            color: "var(--ink)",
          }}
        />
        <button
          type="submit"
          className="px-4 py-2 text-sm font-semibold text-white cursor-pointer"
          style={{
            background: "var(--accent)",
            borderRadius: "0.75rem",
            border: "none",
          }}
        >
          Add
        </button>
      </form>

      {/* ── Habits list ───────────────────────────── */}
      {habits.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No habits yet. Add one above to get started.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {habits.map((habit) => {
          const done = habit.completions.includes(todayStr);
          const { current, best } = calcStreaks(habit.completions);
          const completionSet = new Set(habit.completions);

          return (
            <div
              key={habit.id}
              className="p-4 border"
              style={{
                borderColor: "var(--line)",
                borderRadius: "1.25rem",
                background: "var(--panel)",
              }}
            >
              {/* Header row */}
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => toggleToday(habit.id)}
                  className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    textAlign: "left",
                    color: "var(--ink)",
                  }}
                >
                  {/* Check circle */}
                  <span
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      border: done ? "none" : "2px solid var(--line-strong)",
                      background: done ? "var(--success)" : "transparent",
                      color: done ? "#fff" : "transparent",
                      fontSize: 14,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {done ? "✓" : ""}
                  </span>

                  {/* Name */}
                  <span className="text-sm font-semibold truncate">
                    {habit.emoji ? `${habit.emoji} ` : ""}
                    {habit.name}
                  </span>
                </button>

                {/* Streaks */}
                <div
                  className="flex gap-3 text-xs shrink-0"
                  style={{ color: "var(--muted)" }}
                >
                  <span title="Current streak">
                    {current}d streak
                  </span>
                  <span title="Best streak">
                    Best: {best}d
                  </span>
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteHabit(habit.id)}
                  className="text-xs shrink-0 cursor-pointer"
                  style={{
                    color: "var(--muted)",
                    background: "none",
                    border: "none",
                    padding: "4px",
                  }}
                  title="Delete habit"
                >
                  ✕
                </button>
              </div>

              {/* Calendar heatmap — last 30 days */}
              <div
                className="flex gap-[3px] flex-wrap"
                title="Last 30 days"
              >
                {days.map((day) => {
                  const filled = completionSet.has(day);
                  return (
                    <div
                      key={day}
                      title={`${day} (${dayLabel(day)})${filled ? " — done" : ""}`}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        background: filled
                          ? "var(--success)"
                          : "var(--line)",
                        transition: "background 0.15s ease",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
