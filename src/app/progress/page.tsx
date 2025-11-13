"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FaArrowLeft, FaCheckCircle } from "react-icons/fa";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  CircularProgressbar,
  buildStyles,
} from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

// Task type (loose to handle multiple collections)
interface Task {
  id: string;
  title?: string;
  task?: string;
  category?: "daily" | "weekly" | "general" | string;
  completedAt?: any;
  createdAt?: any;
  deadline?: any;
  userId?: string;
}

function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export default function ProgressPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [incompleteTasks, setIncompleteTasks] = useState<Task[]>([]);
  const [dailyPercent, setDailyPercent] = useState(0);
  const [weeklyPercent, setWeeklyPercent] = useState(0);
  const [streak, setStreak] = useState(0);

  // Listen to auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setUserId(user.uid);
      else router.push("/signin");
    });
    return () => unsub();
  }, [router]);

  // Fetch Firestore data
  useEffect(() => {
    if (!userId) return;

    const tasksRef = query(
      collection(db, "tasks"),
      where("userId", "==", userId)
    );
    const completedRef = query(
      collection(db, "completedTasks"),
      where("userId", "==", userId)
    );
    const incompleteRef = query(
      collection(db, "incompleteTasks"),
      where("userId", "==", userId)
    );

    const unsubTasks = onSnapshot(tasksRef, (snap) => {
      const docs = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title ?? data.task ?? "",
          category: data.category,
          deadline: data.deadline,
          createdAt: data.createdAt,
          userId: data.userId,
        } as Task;
      });
      setTasks(docs);
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
        } as Task;
      });
      setCompletedTasks(docs);

      // calculate streak
      const dayStrings = docs
        .map((t) =>
          t.completedAt ? toDateSafe(t.completedAt)?.toDateString() : null
        )
        .filter(Boolean);
      setStreak(new Set(dayStrings).size);
    });

    const unsubIncomplete = onSnapshot(incompleteRef, (snap) => {
      const docs = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title,
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

  // ---- Progress Calculation ----
  useEffect(() => {
    // Calculate progress same way as Tasks page:
    const completedDaily = completedTasks.filter(
      (t) => t.category === "daily"
    ).length;
    const completedWeekly = completedTasks.filter(
      (t) => t.category === "weekly"
    ).length;

    const totalDaily =
      completedDaily +
      tasks.filter((t) => t.category === "daily").length;
    const totalWeekly =
      completedWeekly +
      tasks.filter((t) => t.category === "weekly").length;

    const dailyPercent =
      totalDaily > 0 ? Math.round((completedDaily / totalDaily) * 100) : 0;
    const weeklyPercent =
      totalWeekly > 0 ? Math.round((completedWeekly / totalWeekly) * 100) : 0;

    setDailyPercent(dailyPercent);
    setWeeklyPercent(weeklyPercent);
  }, [tasks, completedTasks]);

  // ---- Missing (incomplete) counts ----
  const missingDaily = incompleteTasks.filter(
    (t) => t.category === "daily"
  ).length;
  const missingWeekly = incompleteTasks.filter(
    (t) => t.category === "weekly"
  ).length;

  // Helper
  const groupByCategory = (category: string) =>
    completedTasks.filter((t) => t.category === category);

  // ---- UI ----
  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-sky-100 to-emerald-50 text-gray-900 flex flex-col items-center py-12 px-4">
      {/* Back Button */}
      <div className="absolute top-6 left-6">
        <button
          onClick={() => router.push("/tasks")}
          className="flex items-center bg-white/70 hover:bg-white/90 backdrop-blur-md px-4 py-2 rounded-lg text-gray-800 transition-all shadow-sm"
        >
          <FaArrowLeft className="mr-2" />
          Back to Tasks
        </button>
      </div>

      {/* Title */}
      <motion.h1
        className="text-5xl font-bold mb-10 bg-clip-text text-transparent bg-gradient-to-r from-purple-600 via-indigo-500 to-blue-400"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
      >
        🏆 Progress Dashboard
      </motion.h1>

      {/* Progress Dials Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl w-full mb-16">
        <ProgressDial
          label="Daily Progress"
          percent={dailyPercent}
          colors={["#38bdf8", "#0ea5e9"]}
        />
        <ProgressDial
          label="Weekly Progress"
          percent={weeklyPercent}
          colors={["#22c55e", "#84cc16"]}
        />
        <motion.div
          className="bg-white/70 rounded-2xl shadow-md p-6 text-center backdrop-blur-md"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-sm text-gray-500 mb-2">🔥 Current Streak</p>
          <h2 className="text-4xl font-bold text-emerald-600">{streak}</h2>
          <p className="text-gray-700 mt-2">Days with completed tasks</p>
        </motion.div>

        {/* Missing / Incomplete */}
        <motion.div
          className="bg-white/70 rounded-2xl shadow-md p-6 text-center backdrop-blur-md"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-sm text-gray-500 mb-2">⚠️ Missing Tasks</p>
          <h2 className="text-3xl font-bold text-red-600">{missingDaily}</h2>
          <p className="text-gray-700 mt-1 text-sm">Missing Daily</p>
          <h2 className="text-3xl font-bold text-red-500 mt-4">
            {missingWeekly}
          </h2>
          <p className="text-gray-700 mt-1 text-sm">Missing Weekly</p>
        </motion.div>
      </div>

      {/* Completed Tasks List */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl">
        <CompletedTasksSection
          title="🌞 Daily Completed"
          tasks={groupByCategory("daily")}
          color="from-blue-200 to-cyan-200"
        />
        <CompletedTasksSection
          title="📅 Weekly Completed"
          tasks={groupByCategory("weekly")}
          color="from-green-200 to-lime-200"
        />
        <CompletedTasksSection
          title="🧩 General Completed"
          tasks={groupByCategory("general")}
          color="from-pink-200 to-purple-200"
        />
      </div>
    </main>
  );
}

// ---- Components ----

function ProgressDial({
  label,
  percent,
  colors,
}: {
  label: string;
  percent: number;
  colors: [string, string];
}) {
  return (
    <motion.div
      className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-md text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="w-28 h-28 mx-auto mb-3">
        <CircularProgressbar
          value={percent}
          text={`${percent}%`}
          styles={buildStyles({
            textColor: "#333",
            textSize: "14px",
            pathColor: colors[0],
            trailColor: "#eee",
          })}
        />
      </div>
      <h3 className="text-lg font-semibold">{label}</h3>
    </motion.div>
  );
}

function CompletedTasksSection({
  title,
  tasks,
  color,
}: {
  title: string;
  tasks: Task[];
  color: string;
}) {
  return (
    <motion.div
      className={`p-5 rounded-2xl shadow-lg bg-gradient-to-br ${color} text-gray-900`}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <h2 className="text-2xl font-bold mb-4 text-center">{title}</h2>
      {tasks.length === 0 ? (
        <p className="text-center text-gray-600">No completed tasks yet ✨</p>
      ) : (
        <ul className="space-y-3 max-h-64 overflow-y-auto">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex justify-between items-center bg-white/80 rounded-lg p-3 shadow-sm hover:shadow-md transition"
            >
              <div>
                <p className="font-medium">{task.title}</p>
                {task.completedAt && (
                  <p className="text-xs text-gray-600">
                    Completed:{" "}
                    {new Date(task.completedAt?.seconds
                      ? task.completedAt.toDate()
                      : task.completedAt
                    ).toLocaleString()}
                  </p>
                )}
              </div>
              <FaCheckCircle className="text-green-500" />
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
