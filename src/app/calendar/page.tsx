"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  doc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

interface Task {
  id: string;
  title: string;
  deadline?: string;
  createdAt?: any;
  category: "daily" | "weekly" | "general";
  completed?: boolean;
  userId?: string;
}

export default function CalendarPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // --- Auth listener ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setUserId(user.uid);
      else router.push("/signin");
    });
    return () => unsub();
  }, [router]);

  // --- Real-time Firestore listener ---
  useEffect(() => {
    if (!userId) return;

    const tasksQuery = query(
      collection(db, "tasks"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(tasksQuery, (snap) => {
      const data = snap.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((t: any) => t.userId === userId) as Task[];

      console.log("📡 Loaded tasks:", data);
      setTasks(data);
    });

    return () => unsub();
  }, [userId]);

  // --- Calendar logic ---
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daysArray = Array.from({ length: firstDay + daysInMonth }, (_, i) =>
    i < firstDay ? null : new Date(year, month, i - firstDay + 1)
  );

  // --- Utility to compare dates ---
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  // --- Filter logic for tasks per day ---
  // Modified: weekly tasks now show ONLY on the nearest upcoming Sunday (including same day if createdAt is a Sunday)
  const getTasksForDay = (day: Date) => {
    return tasks.filter((t) => {
      const createdAt =
        t.createdAt?.toDate?.() ?? new Date(t.createdAt ?? Date.now());

      if (t.category === "daily") {
        // Show on day created
        return sameDay(createdAt, day);
      }

      if (t.category === "weekly") {
        // Show only on the nearest upcoming Sunday (delta = 0 if createdAt is already Sunday)
        const delta = (7 - createdAt.getDay()) % 7; // 0..6
        const nearestSunday = new Date(createdAt);
        nearestSunday.setDate(createdAt.getDate() + delta);
        return sameDay(nearestSunday, day);
      }

      if (t.category === "general" && t.deadline) {
        // Show on its deadline
        const deadlineDate = new Date(t.deadline);
        return sameDay(deadlineDate, day);
      }

      return false;
    });
  };

  // --- Firestore task actions ---
  const markTaskCompleted = async (task: Task) => {
    const collectionName = "tasks";
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed: true } : t))
    );
    setSelectedTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed: true } : t))
    );

    await updateDoc(doc(db, collectionName, task.id), { completed: true });
  };

  const deleteTask = async (task: Task) => {
    const collectionName = "tasks";
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    setSelectedTasks((prev) => prev.filter((t) => t.id !== task.id));

    await deleteDoc(doc(db, collectionName, task.id));
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-100 via-sky-100 to-emerald-100 text-blue-700 flex flex-col items-center py-10 px-4 relative overflow-hidden">
      {/* Header */}
      <div className="w-full max-w-5xl mb-8">
        <motion.h1
          className="text-4xl font-bold text-center bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          My Task Calendar
        </motion.h1>
      </div>

      {/* Calendar */}
      <motion.div
        className="bg-white/85 backdrop-blur-sm rounded-2xl shadow-lg p-6 w-full max-w-5xl border border-blue-200"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* inner ring / padding for better frame */}
        <div className="rounded-2xl border border-blue-50 p-4 bg-white/60">
          {/* Month Header */}
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="px-3 py-1 bg-white/90 rounded hover:shadow-sm border border-blue-100 transition"
            >
              ◀
            </button>
            <h2 className="text-2xl font-semibold text-blue-700">
              {currentDate.toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <button
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="px-3 py-1 bg-white/90 rounded hover:shadow-sm border border-blue-100 transition"
            >
              ▶
            </button>
          </div>

          {/* Calendar Grid (framed) */}
          <div className="grid grid-cols-7 gap-3 text-center text-sm md:text-base border border-blue-100 rounded-xl p-3 bg-white/60">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className="font-semibold text-blue-700 border-b border-blue-100 pb-2"
              >
                {d}
              </div>
            ))}

            {daysArray.map((day, i) =>
              day ? (
                <motion.div
                  key={i}
                  onClick={() => {
                    setSelectedDay(day);
                    const tasksForDay = getTasksForDay(day);
                    setSelectedTasks(tasksForDay);
                    setIsPanelOpen(true);
                  }}
                  // note: 'group' added so inner hover controls (like show action buttons) work with group-hover
                  className={`group min-h-[90px] rounded-xl p-2 flex flex-col items-start justify-start transition-all cursor-pointer
                    border border-blue-100 group-hover:border-blue-600 hover:shadow-md hover:translate-y-0.5
                    ${
                      Math.floor(i / 7) % 2 === 0
                        ? "bg-white/90 hover:bg-white"
                        : "bg-emerald-50/80 hover:bg-emerald-100"
                    }
                  `}
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="text-sm font-bold text-blue-700">
                    {day.getDate()}
                  </div>
                  <div className="text-xs mt-1 space-y-1 w-full">
                    {getTasksForDay(day).map((task) => (
                      <div
                        key={task.id}
                        className={`rounded-lg px-2 py-1 text-left font-medium truncate ${
                          task.completed
                            ? "bg-gray-300/60 text-gray-600 line-through"
                            : task.category === "daily"
                            ? "bg-blue-600/90 text-white"
                            : task.category === "weekly"
                            ? "bg-emerald-500/90 text-white"
                            : "bg-purple-500/90 text-white"
                        }`}
                      >
                        {task.title}
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div key={i} />
              )
            )}
          </div>
        </div>
      </motion.div>

      {/* Slide-in Panel */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: isPanelOpen ? 0 : "100%" }}
        transition={{ type: "spring", stiffness: 80 }}
        className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white/90 backdrop-blur-xl shadow-2xl p-6 text-blue-700 overflow-y-auto z-50 border-l border-blue-100"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">
            {selectedDay ? `Tasks on ${selectedDay.toDateString()}` : "Tasks"}
          </h2>
          <button
            onClick={() => setIsPanelOpen(false)}
            className="text-red-500 hover:text-red-600 font-bold text-lg transition-transform hover:rotate-90"
          >
            ✕
          </button>
        </div>

        {/* Add Task Button */}
        <button
          onClick={() => router.push("/tasks")}
          className="mb-5 w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg shadow-sm transition-all font-semibold text-white flex items-center justify-center gap-2"
        >
          ➕ Add Task
        </button>

        {/* Tasks list */}
        {selectedTasks.length === 0 ? (
          <p className="text-blue-600/80">No tasks for this day ✨</p>
        ) : (
          <ul className="space-y-3">
            {selectedTasks.map((task) => (
              <li
                key={task.id}
                className={`group bg-white/80 rounded-lg p-3 flex justify-between items-center relative transition border border-blue-50 ${
                  task.completed ? "opacity-60 line-through" : ""
                }`}
              >
                <div>
                  <p className="font-semibold text-blue-700">{task.title}</p>
                  <p className="text-sm text-blue-500">{task.category}</p>
                </div>

                <div className="flex gap-2 absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!task.completed && (
                    <button
                      onClick={() => markTaskCompleted(task)}
                      className="bg-emerald-500 hover:bg-emerald-600 px-2 py-1 rounded text-sm text-white transition"
                    >
                      ✓
                    </button>
                  )}
                  <button
                    onClick={() => deleteTask(task)}
                    className="bg-red-500 hover:bg-red-600 px-2 py-1 rounded text-sm text-white transition"
                  >
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </main>
  );
}