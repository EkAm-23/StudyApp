"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

/* -------------------------
   Types & Helpers
--------------------------*/
interface Task {
  id: string;
  title?: string;
  category?: "daily" | "weekly" | "general" | string;
  completedAt?: any;
  createdAt?: any;
  deadline?: any;
  userId?: string;
  durationMinutes?: number | null;
  // other optional fields ...
}

function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function dateKey(d: Date) {
  return d.toDateString();
}

function startOfWeek(d: Date) {
  // week starts Monday
  const copy = new Date(d);
  const day = copy.getDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1 - day); // shift so Monday is start
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeekFromStart(start: Date) {
  const e = new Date(start);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

/* -------------------------
   Component
--------------------------*/
export default function ProgressPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  // data subscriptions
  const [activeTasks, setActiveTasks] = useState<Task[]>([]); // live tasks collection
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [incompleteTasks, setIncompleteTasks] = useState<Task[]>([]);

  // UI state
  const [dailyPercent, setDailyPercent] = useState(0);
  const [weeklyPercent, setWeeklyPercent] = useState(0);
  const [streak, setStreak] = useState(0);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setUserId(user.uid);
      else router.push("/signin");
    });
    return () => unsub();
  }, [router]);

  // Firestore subscriptions: tasks, completedTasks, incompleteTasks
  useEffect(() => {
    if (!userId) return;

    const tasksRef = query(collection(db, "tasks"), where("userId", "==", userId));
    const completedRef = query(collection(db, "completedTasks"), where("userId", "==", userId));
    const incompleteRef = query(collection(db, "incompleteTasks"), where("userId", "==", userId));

    const unsubTasks = onSnapshot(tasksRef, (snap) => {
      const docs = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title ?? data.task ?? "",
          category: data.category,
          createdAt: data.createdAt,
          deadline: data.deadline,
          userId: data.userId,
        } as Task;
      });
      setActiveTasks(docs);
    });

    const unsubCompleted = onSnapshot(completedRef, (snap) => {
      const docs = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title ?? data.task ?? "",
          category: data.category,
          completedAt: data.completedAt,
          createdAt: data.createdAt,
          userId: data.userId,
          durationMinutes: data.durationMinutes ?? null,
        } as Task;
      });
      setCompletedTasks(docs);

      // compute streak = number of distinct days with at least one completed task
      const dayStrings = docs
        .map((t) => (t.completedAt ? toDateSafe(t.completedAt)?.toDateString() : null))
        .filter(Boolean) as string[];
      setStreak(new Set(dayStrings).size);
    });

    const unsubIncomplete = onSnapshot(incompleteRef, (snap) => {
      const docs = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title ?? data.task ?? "",
          category: data.category,
          originalDeadline: data.originalDeadline,
          missedAt: data.missedAt,
          userId: data.userId,
        } as Task;
      });
      setIncompleteTasks(docs);
    });

    return () => {
      unsubTasks();
      unsubCompleted();
      unsubIncomplete();
    };
  }, [userId]);

  // ---- Progress Calculation using activeTasks + completedTasks ----
  useEffect(() => {
    const completedDaily = completedTasks.filter((t) => t.category === "daily").length;
    const completedWeekly = completedTasks.filter((t) => t.category === "weekly").length;

    const activeDaily = activeTasks.filter((t) => t.category === "daily").length;
    const activeWeekly = activeTasks.filter((t) => t.category === "weekly").length;

    const totalDaily = completedDaily + activeDaily;
    const totalWeekly = completedWeekly + activeWeekly;

    const dp = totalDaily > 0 ? Math.round((completedDaily / totalDaily) * 100) : 0;
    const wp = totalWeekly > 0 ? Math.round((completedWeekly / totalWeekly) * 100) : 0;

    setDailyPercent(dp);
    setWeeklyPercent(wp);
  }, [completedTasks, activeTasks]);

  // Missing counts (keep using incompleteTasks for overdue/moved items)
  const missingDaily = incompleteTasks.filter((t) => t.category === "daily").length;
  const missingWeekly = incompleteTasks.filter((t) => t.category === "weekly").length;

  // Deterministic base dates captured once to avoid SSR/CSR mismatches
  const [todayBase] = useState(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });
  const daysWindow = [todayBase];
  const [weekWindow] = useState(() => {
    const start = startOfWeek(todayBase);
    const end = endOfWeekFromStart(start);
    return { start, end };
  });
  const weeksWindow = [weekWindow];

  // helper: tasks completed on a day
  const tasksOnDay = (day: Date) => {
    const key = dateKey(day);
    return completedTasks.filter((t) => {
      if (!t.completedAt) return false;
      const d = toDateSafe(t.completedAt);
      if (!d) return false;
      return d.toDateString() === key;
    });
  };

  // helper: tasks completed in a week
  const tasksInWeek = (start: Date, end: Date) =>
    completedTasks.filter((t) => {
      if (!t.completedAt) return false;
      const d = toDateSafe(t.completedAt);
      if (!d) return false;
      return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
    });

  // Deterministic, locale-independent formatting
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const formatDayShort = (d: Date) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  const formatWeekLabel = (start: Date, end: Date) => `${formatDayShort(start)} — ${formatDayShort(end)}`;

  /* -------------------------
     UI
  --------------------------*/
  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-sky-100 to-emerald-50 text-gray-900 flex flex-col items-center py-12 px-4">
      <motion.h1
        className="text-5xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-purple-600 via-indigo-500 to-blue-400"
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
      >
        🏆 Progress Dashboard
      </motion.h1>

      {/* Top row: Dials + streak/missing */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl w-full mb-10">
        <ProgressCard label="Daily Progress" percent={dailyPercent} colors={["#38bdf8", "#0ea5e9"]} />
        <ProgressCard label="Weekly Progress" percent={weeklyPercent} colors={["#22c55e", "#84cc16"]} />
        <motion.div
            className="bg-indigo-50/70 rounded-2xl shadow-sm p-6 text-center border border-indigo-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-sm text-gray-500 mb-2">🔥 Current Streak</p>
          <h2 className="text-4xl font-bold text-emerald-600">{streak}</h2>
          <p className="text-gray-700 mt-2">Days with completed tasks</p>
        </motion.div>

        <motion.div
            className="bg-sky-50/70 rounded-2xl shadow-sm p-6 text-center border border-sky-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-sm text-gray-500 mb-2">⚠️ Missing Tasks</p>
          <h2 className="text-3xl font-bold text-red-600">{missingDaily}</h2>
          <p className="text-gray-700 mt-1 text-sm">Missing Daily</p>
          <h2 className="text-3xl font-bold text-red-500 mt-4">{missingWeekly}</h2>
          <p className="text-gray-700 mt-1 text-sm">Missing Weekly</p>
        </motion.div>
      </div>

      {/* Completed groups (Today and This Week) */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Daily Completed: only today */}
        <motion.div
          className="bg-white/70 rounded-2xl p-5 shadow-sm border border-indigo-100"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">🌞 Daily Completed (Today)</h2>
            <div className="text-sm text-blue-600 font-medium">
              {completedTasks.filter((t) => t.category === "daily").length} total
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {daysWindow.map((d) => {
              const items = tasksOnDay(d).filter((t) => t.category === "daily");
              return (
                <div key={d.toDateString()} className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold">{d.toDateString()}</div>
                      <div className="text-xs text-blue-500">{items.length} completed</div>
                    </div>
                    <div className="text-sm text-blue-600 font-medium">{items.length > 0 ? "✅" : "—"}</div>
                  </div>

                  {items.length === 0 ? (
                    <p className="text-xs text-gray-600">No daily tasks completed today.</p>
                  ) : (
                    <ul className="space-y-2">
                      {items.map((t) => (
                        <li key={t.id} className="flex justify-between items-start bg-white/80 rounded-md p-2 border border-indigo-100">
                          <div>
                            <div className="font-medium text-blue-800">{t.title}</div>
                            {t.durationMinutes ? <div className="text-xs text-gray-600 mt-1">{t.durationMinutes} min</div> : null}
                          </div>
                          <div className="text-xs text-gray-500">{toDateSafe(t.completedAt)?.toLocaleTimeString()}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Weekly Completed: only this week */}
        <motion.div
          className="bg-white/70 rounded-2xl p-5 shadow-sm border border-sky-100"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">📅 Weekly Completed (This Week)</h2>
            <div className="text-sm text-blue-600 font-medium">
              {completedTasks.filter((t) => t.category === "weekly").length} total
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {weeksWindow.map((w, idx) => {
              const items = tasksInWeek(w.start, w.end).filter((t) => t.category === "weekly");
              return (
                <div key={`${w.start.toDateString()}-${idx}`} className="p-3 rounded-xl bg-sky-50/60 border border-sky-100 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold">{formatWeekLabel(w.start, w.end)}</div>
                      <div className="text-xs text-blue-500">{items.length} completed</div>
                    </div>
                    <div className="text-sm text-blue-600 font-medium">{items.length > 0 ? "✅" : "—"}</div>
                  </div>

                  {items.length === 0 ? (
                    <p className="text-xs text-gray-600">No weekly tasks completed this week.</p>
                  ) : (
                    <ul className="space-y-2">
                      {items.map((t) => (
                        <li key={t.id} className="flex justify-between items-start bg-white/80 rounded-md p-2 border border-sky-100">
                          <div>
                            <div className="font-medium text-blue-800">{t.title}</div>
                            {t.durationMinutes ? <div className="text-xs text-gray-600 mt-1">{t.durationMinutes} min</div> : null}
                          </div>
                          <div className="text-xs text-gray-500">{toDateSafe(t.completedAt)?.toLocaleDateString()}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </main>
  );
}

/* -------------------------
   Small UI components
--------------------------*/
function ProgressCard({ label, percent, colors }: { label: string; percent: number; colors: [string, string] }) {
  return (
    <motion.div className="bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-md text-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="w-28 h-28 mx-auto mb-3">
        <CircularProgressbar
          value={percent}
          text={`${percent}%`}
          styles={buildStyles({
            textColor: "#1f2937",
            textSize: "14px",
            pathColor: colors[0],
            trailColor: "#eef2ff",
          })}
        />
      </div>
      <h3 className="text-lg font-semibold">{label}</h3>
    </motion.div>
  );
}