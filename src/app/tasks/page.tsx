"use client";

import jsPDF from "jspdf";

import { useEffect, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  where,
  serverTimestamp,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

interface Task {
  id?: string;
  title?: string;
  task?: string;
  createdAt?: string | any;
  deadline?: string | any;
  category?: "daily" | "weekly" | "general" | string;
  userId?: string;
  plannedFor?: string | any;
  durationMinutes?: number | null;
}

/* -------------------------
   Helpers
--------------------------*/
function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function isDeadlinePassed(deadline: any) {
  const d = toDateSafe(deadline);
  if (!d) return false;
  return d.getTime() < Date.now();
}
function collapseRepeatedWords(s: string) {
  if (!s) return s;
  const parts = s.trim().split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const prev = out[out.length - 1];
    if (!prev || prev.toLowerCase() !== parts[i].toLowerCase()) {
      out.push(parts[i]);
    }
  }
  return out.join(" ");
}
// YYYY-MM-DD local key
function dateKeyLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/* -------------------------
   Component
--------------------------*/
export default function TasksPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  const [dailyTasks, setDailyTasks] = useState<Task[]>([]);
  const [weeklyTasks, setWeeklyTasks] = useState<Task[]>([]);
  const [generalTasks, setGeneralTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);

  const [newTask, setNewTask] = useState("");
  const [deadline, setDeadline] = useState("");
  const [category, setCategory] = useState<"daily" | "weekly" | "general">("daily");

  const [activeFilter, setActiveFilter] = useState<"daily" | "weekly" | "general">("daily");

  // Speech state
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<any>(null);
  const lastFinalRef = useRef<string | null>(null);

  // Scheduler UI state
  const [plan, setPlan] = useState<any | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [planOptions, setPlanOptions] = useState({ windowDays: 7, maxMinutesPerDay: 240 });

  // detect speech API
  useEffect(() => {
    const win = typeof window !== "undefined" ? (window as any) : undefined;
    const SpeechRecognition = win?.webkitSpeechRecognition || win?.SpeechRecognition || null;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }
    try {
      const rec = new SpeechRecognition();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = true;
      recognitionRef.current = rec;
      setSpeechSupported(true);
    } catch (e) {
      setSpeechSupported(false);
    }
  }, []);

  // recognition handlers
  useEffect(() => {
    const rec = recognitionRef.current;
    if (!rec) return;

    const onResult = (event: any) => {
      let localFinal = "";
      let localInterim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        const transcript = (res[0]?.transcript || "").trim();
        if (res.isFinal) localFinal += (localFinal ? " " : "") + transcript;
        else localInterim += (localInterim ? " " : "") + transcript;
      }

      setInterimText(localInterim);

      if (localFinal) {
        const cleaned = collapseRepeatedWords(localFinal);
        if (!lastFinalRef.current || lastFinalRef.current.toLowerCase() !== cleaned.toLowerCase()) {
          setNewTask((prev) => {
            const base = prev ? prev.trim() : "";
            if (base && base.toLowerCase().endsWith(cleaned.toLowerCase())) return base;
            return (base ? base + " " : "") + cleaned;
          });
          lastFinalRef.current = cleaned;
        }
        setInterimText("");
      }
    };

    const onEnd = () => {
      setListening(false);
      setInterimText("");
    };

    const onError = (e: any) => {
      console.error("Speech recognition error", e);
      setListening(false);
    };

    rec.addEventListener("result", onResult);
    rec.addEventListener("end", onEnd);
    rec.addEventListener("error", onError);

    return () => {
      rec.removeEventListener("result", onResult);
      rec.removeEventListener("end", onEnd);
      rec.removeEventListener("error", onError);
    };
  }, [recognitionRef.current]);

  const startListening = () => {
    if (category !== "daily") setCategory("daily");
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      lastFinalRef.current = null;
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = true;
      rec.start();
      setListening(true);
    } catch (e) {
      console.error("startListening error", e);
      setListening(false);
    }
  };
  const stopListening = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch (e) {
      console.error("stopListening error", e);
    }
    setListening(false);
    setInterimText("");
  };

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) setUserId(u.uid);
      else router.push("/signin");
    });
    return () => unsub();
  }, [router]);

  // Firestore listeners
  useEffect(() => {
    if (!userId) return;

    const tasksRef = query(collection(db, "tasks"), where("userId", "==", userId), orderBy("createdAt", "desc"));
    const completedRef = query(collection(db, "completedTasks"), where("userId", "==", userId), orderBy("completedAt", "desc"));

    const unsubTasks = onSnapshot(tasksRef, async (snap) => {
      const docs = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title ?? data.task ?? "",
          category: data.category,
          deadline: data.deadline,
          createdAt: data.createdAt,
          userId: data.userId,
          plannedFor: data.plannedFor ?? null,
          ...data,
        } as Task;
      });

      setDailyTasks(docs.filter((t) => t.category === "daily"));
      setWeeklyTasks(docs.filter((t) => t.category === "weekly"));
      setGeneralTasks(docs.filter((t) => t.category === "general" || !t.category));

      // move overdue tasks to incompleteTasks (existing behavior)
      for (const d of snap.docs) {
        const data = d.data() as any;
        const id = d.id;
        const deadlineVal = data.deadline;
        if (!deadlineVal) continue;
        if (!isDeadlinePassed(deadlineVal)) continue;
        if (data.movedToIncomplete) continue;
        try {
          const snapDoc = await getDoc(doc(db, "tasks", id));
          if (!snapDoc.exists()) continue;
          const latest = snapDoc.data() as any;
          if (latest.movedToIncomplete || latest.completedAt) continue;

          await addDoc(collection(db, "incompleteTasks"), {
            userId: latest.userId ?? userId,
            title: latest.title ?? latest.task ?? "",
            category: latest.category ?? "general",
            originalCreatedAt: latest.createdAt ?? serverTimestamp(),
            originalDeadline: latest.deadline ?? null,
            missedAt: serverTimestamp(),
            originalTaskId: id,
          });

          await deleteDoc(doc(db, "tasks", id));
        } catch (err) {
          console.error("Error moving overdue task to incomplete:", err);
        }
      }
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
    });

    return () => {
      unsubTasks();
      unsubCompleted();
    };
  }, [userId]);

  // actions: add / delete
  const handleAddTask = async () => {
    if (listening) {
      stopListening();
      await new Promise((r) => setTimeout(r, 120));
    }
    if (!userId || !newTask.trim()) return;
    const payload: any = { userId, title: newTask.trim(), category, createdAt: serverTimestamp() };
    if (deadline) payload.deadline = deadline;
    try {
      await addDoc(collection(db, "tasks"), payload);
      setNewTask("");
      setDeadline("");
      lastFinalRef.current = null;
    } catch (err) {
      console.error("addTask error:", err);
    }
  };
  const handleDeleteTask = async (id: string) => {
    if (!userId) return;
    try {
      await deleteDoc(doc(db, "tasks", id));
    } catch (err) {
      console.error("delete task error:", err);
    }
  };

  // move to completed with optional duration prompt
  const moveToCompleted = async (task: Task) => {
    if (!userId || !task.id) return;
    try {
      // Ask user for duration (minutes). Optional — Cancel skips.
      const raw = prompt(
        `How many minutes did you spend on "${task.title}"? (optional — press Cancel to skip)`
      );

      let durationMinutes: number | null = null;
      if (raw !== null) {
        const cleaned = raw.trim();
        if (cleaned.length > 0) {
          const n = parseInt(cleaned, 10);
          if (!Number.isNaN(n) && n > 0) durationMinutes = n;
        }
      }

      const payload: any = {
        userId,
        title: task.title ?? task.task ?? "",
        category: task.category ?? "general",
        deadline: task.deadline ?? null,
        createdAt: task.createdAt ?? serverTimestamp(),
        completedAt: serverTimestamp(),
      };
      if (durationMinutes) payload.durationMinutes = durationMinutes;

      await addDoc(collection(db, "completedTasks"), payload);
      await deleteDoc(doc(db, "tasks", task.id));
    } catch (err) {
      console.error("moveToCompleted error:", err);
    }
  };

  // stats & displayed
  // completed breakdown not used here
  // percents not displayed on this page
  // totals not displayed on this page
  const displayedList = activeFilter === "daily" ? dailyTasks : activeFilter === "weekly" ? weeklyTasks : generalTasks;

  /* -------------------------
     Non-AI Scheduler (mathematical rules)
     - runs locally (no API)
     - DAILY tasks placed only on TODAY (index 0)
  --------------------------*/
  const generatePlan = async (opts = { windowDays: 7, maxMinutesPerDay: 240 }) => {
    setPlanLoading(true);
    setPlan(null);
    try {
      const windowDays = Number(opts.windowDays || 7);
      const maxMinutesPerDay = Number(opts.maxMinutesPerDay || 240);

      // build days array starting from user's local today
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const days: { date: string; minutesUsed: number; tasks: any[] }[] = [];
      for (let i = 0; i < windowDays; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        days.push({ date: dateKeyLocal(d), minutesUsed: 0, tasks: [] });
      }

      // helper for predicted duration (simple deterministic rules)
      function predictDurationDefault(task: Task) {
        if (task.durationMinutes && typeof task.durationMinutes === "number") return Math.max(1, Math.round(task.durationMinutes));
        if (task.category === "daily") return 15;
        if (task.category === "weekly") return 60;
        return 45; // general
      }

      // 1) Place DAILY tasks: only on TODAY (index 0)
      const todayBucket = days[0];
      for (const t of dailyTasks) {
        const dur = predictDurationDefault(t);
        todayBucket.tasks.push({ ...t, predictedDuration: dur, recurring: false });
        todayBucket.minutesUsed += dur;
      }

      // 2) Place WEEKLY tasks: distribute evenly across windowDays
      if (weeklyTasks.length > 0) {
        const n = weeklyTasks.length;
        const indices = weeklyTasks.map((_, i) => {
          let idx = Math.round(((i + 1) * windowDays) / (n + 1)) - 1;
          if (idx < 0) idx = 0;
          if (idx >= windowDays) idx = windowDays - 1;
          return idx;
        });

        for (let i = 0; i < weeklyTasks.length; i++) {
          const t = weeklyTasks[i];
          const dur = predictDurationDefault(t);
          let targetIdx = indices[i];

          if (t.deadline) {
            const dl = toDateSafe(t.deadline);
            if (dl) {
              let found = -1;
              for (let j = 0; j < days.length; j++) {
                const parts = days[j].date.split("-").map((x) => parseInt(x, 10));
                const dayDate = new Date(parts[0], parts[1] - 1, parts[2]);
                if (dayDate.getTime() <= dl.getTime()) found = j;
              }
              if (found !== -1) targetIdx = found;
            }
          }

          let placed = false;
          for (let offset = 0; offset < windowDays; offset++) {
            const idx = (targetIdx + offset) % windowDays;
            if (days[idx].minutesUsed + dur <= maxMinutesPerDay) {
              days[idx].tasks.push({ ...t, predictedDuration: dur });
              days[idx].minutesUsed += dur;
              placed = true;
              break;
            }
          }
          if (!placed) {
            let best = days[0];
            for (const d of days) if (d.minutesUsed < best.minutesUsed) best = d;
            best.tasks.push({ ...t, predictedDuration: dur });
            best.minutesUsed += dur;
          }
        }
      }

      // 3) Place GENERAL tasks: earliest available day before deadline else least-loaded
      const generalSorted = [...generalTasks].sort((a, b) => {
        const ad = toDateSafe(a.deadline);
        const bd = toDateSafe(b.deadline);
        if (ad && bd) return ad.getTime() - bd.getTime();
        if (ad && !bd) return -1;
        if (!ad && bd) return 1;
        const at = toDateSafe(a.createdAt) ?? new Date(0);
        const bt = toDateSafe(b.createdAt) ?? new Date(0);
        return at.getTime() - bt.getTime();
      });

      for (const t of generalSorted) {
        const dur = predictDurationDefault(t);

        let candidates = days;
        if (t.deadline) {
          const dl = toDateSafe(t.deadline);
          if (dl) {
            candidates = days.filter((d) => {
              const parts = d.date.split("-").map((x) => parseInt(x, 10));
              const dayDate = new Date(parts[0], parts[1] - 1, parts[2]);
              return dayDate.getTime() <= dl.getTime();
            });
            if (candidates.length === 0) candidates = days;
          }
        }

        let placed = false;
        for (const day of candidates) {
          if (day.minutesUsed + dur <= maxMinutesPerDay) {
            day.tasks.push({ ...t, predictedDuration: dur });
            day.minutesUsed += dur;
            placed = true;
            break;
          }
        }

        if (!placed) {
          let best = candidates[0];
          for (const d of candidates) if (d.minutesUsed < best.minutesUsed) best = d;
          best.tasks.push({ ...t, predictedDuration: dur });
          best.minutesUsed += dur;
        }
      }

      // final pass: compute buckets + summary
      const buckets: Record<string, any[]> = {};
      const summary = days.map((d) => {
        const overflow = d.minutesUsed > maxMinutesPerDay;
        buckets[d.date] = d.tasks;
        return { date: d.date, count: d.tasks.length, minutes: d.minutesUsed, overflow, tasks: d.tasks };
      });

      setPlan({ buckets, summary });
      setPlanOptions(opts);
      setIsPlanOpen(true);
    } catch (err) {
      console.error("generatePlan error", err);
      alert("Could not create plan — check console.");
    } finally {
      setPlanLoading(false);
    }
  };
  

const downloadPlanPDF = () => {
  if (!plan) return alert("No plan to download");

  const doc = new jsPDF();
  let y = 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Study Plan", 10, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);

  plan.summary.forEach((day: any) => {
    const dateStr = new Date(day.date).toDateString();

    // Day header
    doc.setFont("helvetica", "bold");
    doc.text(`${dateStr}`, 10, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.text(`Tasks: ${day.count}`, 10, y);
    y += 6;

    day.tasks.forEach((t: any) => {
      const line = `• ${t.title} (${t.category})`;
      doc.text(line, 14, y);
      y += 6;

      // If almost full, create new page
      if (y > 270) {
        doc.addPage();
        y = 10;
      }
    });

    y += 4; // spacing between days
  });

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`study-plan-${stamp}.pdf`);
};

  const downloadPlan = () => {
  if (!plan) return alert("No plan to download");
  try {
    const json = JSON.stringify(plan, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `plan-${planOptions.windowDays}d-${dateStamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("downloadPlan error", e);
    alert("Could not download plan.");
  }
};

  /* -------------------------
     Render
  --------------------------*/
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-sky-100 to-emerald-100 text-blue-700 flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="hidden lg:block lg:col-span-2">
          <motion.div className="h-screen bg-white/85 rounded-2xl p-4 shadow-sm border border-blue-100 sticky top-0 overflow-auto flex flex-col">
            <div>
              <h3 className="text-sm font-semibold text-blue-700 mb-3">Filters</h3>
              <nav className="space-y-2">
                <button
                  onClick={() => setActiveFilter("daily")}
                  className={`w-full text-left px-3 py-2 rounded-lg transition flex items-center justify-between ${activeFilter === "daily" ? "bg-blue-50 border border-blue-100" : "hover:bg-white"}`}
                >
                  <span className="font-medium text-blue-700">Daily</span>
                  <span className="text-sm text-blue-500">{dailyTasks.length}</span>
                </button>

                <button
                  onClick={() => setActiveFilter("weekly")}
                  className={`w-full text-left px-3 py-2 rounded-lg transition flex items-center justify-between ${activeFilter === "weekly" ? "bg-blue-50 border border-blue-100" : "hover:bg-white"}`}
                >
                  <span className="font-medium text-blue-700">Weekly</span>
                  <span className="text-sm text-blue-500">{weeklyTasks.length}</span>
                </button>

                <button
                  onClick={() => setActiveFilter("general")}
                  className={`w-full text-left px-3 py-2 rounded-lg transition flex items-center justify-between ${activeFilter === "general" ? "bg-blue-50 border border-blue-100" : "hover:bg-white"}`}
                >
                  <span className="font-medium text-blue-700">General</span>
                  <span className="text-sm text-blue-500">{generalTasks.length}</span>
                </button>
              </nav>
            </div>

            <div className="mt-auto pt-6">
              <div className="border-t border-blue-50 pt-4">
                <h4 className="text-sm font-semibold text-blue-700 mb-2">Legend</h4>
                <div className="mt-3 text-xs text-blue-500 space-y-2">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" /> Daily</div>
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Weekly</div>
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-500" /> General</div>
                </div>
              </div>
            </div>
          </motion.div>
        </aside>

        <main className="col-span-1 lg:col-span-10">
          <motion.h1 className="text-3xl lg:text-4xl font-bold mb-4" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400">My Study Tasks</span>
          </motion.h1>

          {/* Removed banner message about scheduler determinism */}

          <div className="mb-6 lg:hidden">
            <div className="flex gap-2">
  <button onClick={() => { setIsPlanOpen(false); setPlan(null); }} className="text-sm px-3 py-1 rounded">Close</button>

  {/* NEW: download button */}
  <button
    onClick={() => downloadPlan()}
    className="bg-blue-600 text-white px-3 py-1 rounded"
    title="Download plan as JSON"
  >
    Download Plan
  </button>
</div>
          </div>

          {/* Input Section */}
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-md mb-6 border border-blue-100">
            <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-center">
              <div className="flex-1 relative w-full">
                <input
                  type="text"
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="Enter a new task..."
                  className="w-full p-3 rounded-xl bg-white text-blue-700 placeholder:text-blue-300 outline-none border border-blue-50 focus:ring-2 focus:ring-blue-100"
                />
                {listening && interimText && <div className="absolute right-3 bottom-3 text-xs text-blue-400 italic pointer-events-none">{interimText}</div>}
              </div>

              <select value={category} onChange={(e) => setCategory(e.target.value as any)} className="p-3 rounded-xl bg-white text-blue-700 border border-blue-50 focus:ring-2 focus:ring-blue-100">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="general">General</option>
              </select>

              {category === "general" && (
                <div className="flex flex-col text-sm text-blue-700">
                  <label htmlFor="deadline" className="ml-1 text-xs text-blue-600">Deadline</label>
                  <input id="deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="p-2 rounded-xl bg-white text-blue-700 border border-blue-50 outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
              )}

              {/* Mic button */}
              <div className="flex items-center gap-2">
                {speechSupported ? (
                  <button
                    onClick={() => (listening ? stopListening() : startListening())}
                    aria-pressed={listening}
                    title={listening ? "Stop voice input" : "Start voice input (daily tasks only)"}
                    className="relative flex items-center justify-center w-11 h-11 rounded-xl transition-shadow focus:outline-none"
                  >
                    <span className={`${listening ? "absolute inset-0 animate-ping rounded-xl bg-blue-200/40" : ""}`} />
                    <span className={`relative z-10 inline-flex items-center justify-center rounded-lg ${listening ? "bg-red-500 text-white shadow-lg" : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"} w-11 h-11`}>
                      {!listening ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 1v6a3 3 0 01-6 0V1M12 1v6a3 3 0 006 0V1" opacity="0" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14v4M8 18h8M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
                        </svg>
                      )}
                    </span>
                  </button>
                ) : (
                  <div className="text-xs text-blue-400">Voice not supported</div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button onClick={handleAddTask} className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-xl shadow-md transition-all text-white">Add</button>

                {/* Generate Plan button */}
              </div>
            </div>
          </div>

          {/* Task list */}
          <div className="grid grid-cols-1 gap-6">
            <TaskSection
              title={activeFilter === "daily" ? "Daily Tasks" : activeFilter === "weekly" ? "Weekly Tasks" : "General Tasks"}
              tasks={displayedList}
              colorStart={activeFilter === "daily" ? "from-blue-100" : activeFilter === "weekly" ? "from-emerald-100" : "from-indigo-100"}
              colorEnd={activeFilter === "daily" ? "to-cyan-100" : activeFilter === "weekly" ? "to-lime-100" : "to-sky-100"}
              onComplete={(t) => moveToCompleted(t)}
              onDelete={(id) => handleDeleteTask(id)}
            />
          </div>
        </main>
      </div>

      {/* Plan slide-over (drop-in with stopPropagation & z-index) */}
      {isPlanOpen && plan && (
        <div
          className="fixed inset-0 z-50 flex"
          aria-modal="true"
          role="dialog"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 z-40"
            onClick={() => setIsPlanOpen(false)}
          />

          {/* Panel */}
          <div
            className="ml-auto w-full sm:w-[620px] bg-white rounded-l-2xl p-6 overflow-y-auto text-blue-800 shadow-2xl z-50"
            onClick={(e) => e.stopPropagation()}
            role="document"
          >
            <div className="flex gap-2">
            <button
              onClick={() => { setIsPlanOpen(false); setPlan(null); }}
              className="text-sm px-3 py-1 rounded"
            >
              Close
            </button>

            <button
              onClick={downloadPlanPDF}
              className="bg-blue-600 text-white px-3 py-1 rounded"
            >
              Download PDF
            </button>
          </div>

            <div className="space-y-4">
              {plan.summary.map((day: any) => (
                <div key={day.date} className="p-3 rounded-xl bg-white/90 border border-blue-50 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <div className="text-sm font-semibold">{new Date(day.date).toDateString()}</div>
                      <div className="text-xs text-blue-500">{day.count} tasks {day.overflow ? " • OVERLOADED" : ""}</div>
                    </div>
                    <div className="text-right text-xs">
                      {day.overflow ? <span className="text-red-600 font-bold">Overflow</span> : <span className="text-green-600">OK</span>}
                    </div>
                  </div>

                  <ul className="space-y-2">
                    {day.tasks.map((t: any, idx: number) => (
                      <li key={idx} className="p-2 rounded-lg bg-blue-50/40 flex justify-between items-center">
                        <div>
                          <div className="font-medium text-blue-800">{t.title}</div>
                          <div className="text-xs text-blue-500">{t.category}{t.recurring ? " • recurring" : ""}</div>
                        </div>
                        <div className="text-xs text-blue-600">
                          {t.forceDate ? <span className="px-2 py-0.5 bg-yellow-100 rounded">Fixed</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Floating Generate Plan Button */}
<button
  onClick={() => generatePlan(planOptions)}
  disabled={planLoading}
  className="
    fixed bottom-8 right-8
    bg-blue-600 hover:bg-blue-700
    text-white shadow-xl
    px-5 py-3 rounded-2xl
    text-sm font-medium
    transition-all
    z-[60]
  "
>
  {planLoading ? "Generating…" : "Generate Plan"}
</button>
    </div>
  );
}

/* -------------------------
   TaskSection child
--------------------------*/
function TaskSection({
  title,
  tasks,
  colorStart,
  colorEnd,
  onComplete,
  onDelete,
}: {
  title: string;
  tasks: Task[];
  colorStart: string;
  colorEnd: string;
  onComplete: (t: Task) => void;
  onDelete: (id: string) => void;
}) {
  function isOverdue(task: Task) {
    if (!task.deadline) return false;
    const d = toDateSafe(task.deadline);
    if (!d) return false;
    return d.getTime() < Date.now();
  }

  return (
    <motion.div
      className={`p-5 rounded-2xl shadow-lg bg-gradient-to-br ${colorStart} ${colorEnd} text-blue-800 border border-blue-100`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <div className="text-sm text-blue-600 font-medium">{tasks.length} items</div>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-blue-600/80">No tasks yet ✨</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li key={task.id} className="group flex justify-between items-center bg-white/85 rounded-xl p-3 shadow-sm hover:shadow-md transition relative border border-blue-50">
              <div className="max-w-[70%]">
                <p className="font-semibold text-blue-800 flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${task.category === "daily" ? "bg-blue-500" : task.category === "weekly" ? "bg-emerald-500" : "bg-indigo-500"}`} />
                  {task.title ?? task.task}
                  {isOverdue(task) && <span className="ml-2 inline-block text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Overdue</span>}
                </p>
                {task.deadline && <p className={`text-sm ${isOverdue(task) ? "text-red-600" : "text-blue-600/80"}`}>{toDateSafe(task.deadline)?.toLocaleDateString() ?? task.deadline}</p>}
              </div>

              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onComplete(task)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg shadow-sm">Done</button>
                <button onClick={() => onDelete(task.id!)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg shadow-sm">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}