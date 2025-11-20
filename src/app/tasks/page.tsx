"use client";

import { useEffect, useState } from "react";
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
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { FaCheck, FaTrash } from "react-icons/fa";

interface Task {
  id: string;
  title?: string;
  task?: string;
  createdAt?: string | any;
  deadline?: string | any;
  category?: "daily" | "weekly" | "general" | string;
  userId?: string;
}

// Helper: convert Firestore Timestamp or string to Date or null
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

export default function TasksPage() {
  const [userId, setUserId] = useState<string | null>(null);

  const [dailyTasks, setDailyTasks] = useState<Task[]>([]);
  const [weeklyTasks, setWeeklyTasks] = useState<Task[]>([]);
  const [generalTasks, setGeneralTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);

  const [newTask, setNewTask] = useState("");
  const [deadline, setDeadline] = useState("");
  const [category, setCategory] = useState<"daily" | "weekly" | "general">("daily");

  const router = useRouter();

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUserId(u.uid);
      } else {
        router.push("/signin");
      }
    });
    return () => unsub();
  }, [router]);

  // Real-time listeners: tasks (single collection) + completedTasks
  useEffect(() => {
    if (!userId) return;

    const tasksRef = query(
      collection(db, "tasks"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );

    const completedRef = query(
      collection(db, "completedTasks"),
      where("userId", "==", userId),
      orderBy("completedAt", "desc")
    );

    // Snapshot for tasks: also trigger overdue -> incomplete move
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
          ...data,
        } as Task;
      });

      // Update UI lists
      setDailyTasks(docs.filter((t) => t.category === "daily"));
      setWeeklyTasks(docs.filter((t) => t.category === "weekly"));
      setGeneralTasks(docs.filter((t) => t.category === "general" || !t.category));

      // Process overdue tasks: move to incompleteTasks then delete from tasks
      // Do it sequentially to avoid many simultaneous writes
      for (const d of snap.docs) {
        const data = d.data() as any;
        const id = d.id;
        const deadlineVal = data.deadline;
        if (!deadlineVal) continue;
        if (!isDeadlinePassed(deadlineVal)) continue;

        // Guard: check whether this task was already moved (race conditions)
        // We check a small field 'movedToIncomplete' optional flag; if it's present skip.
        // (Note: old docs might not have that flag; we'll attempt move once.)
        if (data.movedToIncomplete) continue;

        try {
          // Re-fetch doc to ensure it still exists and get latest fields
          const snapDoc = await getDoc(doc(db, "tasks", id));
          if (!snapDoc.exists()) continue;
          const latest = snapDoc.data() as any;
          // If it already has movedToIncomplete or was completed, skip
          if (latest.movedToIncomplete || latest.completedAt) continue;

          // Add to incompleteTasks with metadata
          await addDoc(collection(db, "incompleteTasks"), {
            userId: latest.userId ?? userId,
            title: latest.title ?? latest.task ?? "",
            category: latest.category ?? "general",
            originalCreatedAt: latest.createdAt ?? serverTimestamp(),
            originalDeadline: latest.deadline ?? null,
            missedAt: serverTimestamp(),
            originalTaskId: id,
          });

          // Delete original task
          await deleteDoc(doc(db, "tasks", id));
          // (If you prefer to set movedToIncomplete instead of deleting,
          // replace deleteDoc with updateDoc to set movedToIncomplete: true)
        } catch (err) {
          console.error("Error moving overdue task to incomplete:", err);
          // continue processing other docs
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
        } as Task;
      });
      setCompletedTasks(docs);
    });

    return () => {
      unsubTasks();
      unsubCompleted();
    };
  }, [userId]);

  // Add Task -> writes to `tasks` collection with category field
  const handleAddTask = async () => {
    if (!userId || !newTask.trim()) return;

    const payload: any = {
      userId,
      title: newTask.trim(),
      category,
      createdAt: serverTimestamp(),
    };

    if (deadline) {
      // store ISO string for easy client filtering
      payload.deadline = deadline; // date string from input (YYYY-MM-DD)
    }

    try {
      await addDoc(collection(db, "tasks"), payload);
      setNewTask("");
      setDeadline("");
    } catch (err) {
      console.error("addTask error:", err);
    }
  };

  // Delete task from `tasks` collection
  const handleDeleteTask = async (id: string) => {
    if (!userId) return;
    try {
      await deleteDoc(doc(db, "tasks", id));
    } catch (err) {
      console.error("delete task error:", err);
    }
  };

  // Mark complete: add to completedTasks (with completedAt & category), then delete from tasks
  const moveToCompleted = async (task: Task) => {
    if (!userId || !task.id) return;

    try {
      await addDoc(collection(db, "completedTasks"), {
        userId,
        title: task.title ?? task.task ?? "",
        category: task.category ?? "general",
        deadline: task.deadline ?? null,
        createdAt: task.createdAt ?? serverTimestamp(),
        completedAt: serverTimestamp(),
      });
      // remove from tasks
      await deleteDoc(doc(db, "tasks", task.id));
    } catch (err) {
      console.error("moveToCompleted error:", err);
    }
  };

  // Progress calculations (same as earlier)
  const completedDaily = completedTasks.filter((t) => t.category === "daily").length;
  const completedWeekly = completedTasks.filter((t) => t.category === "weekly").length;

  const totalDaily = dailyTasks.length + completedDaily;
  const totalWeekly = weeklyTasks.length + completedWeekly;

  const dailyPercent = totalDaily ? Math.round((completedDaily / totalDaily) * 100) : 0;
  const weeklyPercent = totalWeekly ? Math.round((completedWeekly / totalWeekly) * 100) : 0;

  // helper to mark overdue in UI
  function isOverdue(task: Task) {
    if (!task.deadline) return false;
    return isDeadlinePassed(task.deadline);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-100 via-sky-50 to-emerald-100 text-gray-900 flex flex-col items-center py-12 px-4 relative">
      {/* Progress Overview */}
      <motion.div
        onClick={() => router.push("/progress")}
        className="absolute top-6 right-6 cursor-pointer bg-white/45 backdrop-blur-md border border-white/50 shadow-lg hover:shadow-xl hover:bg-white/60 transition-all duration-300 rounded-xl px-5 py-4 w-64"
      >
        <h2 className="text-sm font-semibold mb-3 text-gray-800 text-center">📈 Progress Overview</h2>

        <div className="mb-3">
          <div className="flex justify-between text-[11px] text-gray-700 mb-1">
            <span>Daily</span>
            <span>{dailyPercent}%</span>
          </div>
          <div className="h-2 w-full bg-gray-300/60 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${dailyPercent}%` }}
              transition={{ duration: 0.9 }}
              className={`h-2 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full`}
            />
          </div>
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-[11px] text-gray-700 mb-1">
            <span>Weekly</span>
            <span>{weeklyPercent}%</span>
          </div>
          <div className="h-2 w-full bg-gray-300/60 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${weeklyPercent}%` }}
              transition={{ duration: 0.9 }}
              className={`h-2 bg-gradient-to-r from-green-400 to-lime-400 rounded-full`}
            />
          </div>
        </div>

        <p className="mt-3 text-[11px] text-gray-600 text-center">Click for details →</p>
      </motion.div>

      {/* Title */}
      <motion.h1
        className="text-5xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-green-600 via-emerald-400 to-blue-400"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
      >
        📋 My Study Tasks
      </motion.h1>

      {/* Input Section */}
      <div className="bg-white/70 backdrop-blur-md p-6 rounded-2xl shadow-xl max-w-3xl w-full mb-10">
        <div className="flex flex-col md:flex-row gap-3 md:gap-2 items-center">
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Enter a new task..."
            className="flex-grow p-3 rounded-lg bg-white/70 text-gray-800 placeholder-gray-500 outline-none border border-gray-200"
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as any)}
            className="p-3 rounded-lg bg-white/70 text-gray-800 border border-gray-200"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="general">General</option>
          </select>

          {category === "general" && (
            <div className="flex flex-col text-sm text-gray-700">
              <label htmlFor="deadline" className="ml-1">
                Deadline (YYYY-MM-DD)
              </label>
              <input
                id="deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="p-2 rounded-lg bg-white/70 text-gray-800 border border-gray-200 outline-none"
              />
            </div>
          )}

          <button
            onClick={handleAddTask}
            className="bg-gradient-to-r from-green-500 to-emerald-400 hover:from-green-600 hover:to-emerald-500 px-5 py-2 rounded-lg shadow-md transition-all text-white"
          >
            Add
          </button>
        </div>
      </div>

      {/* Task Sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl">
        <TaskSection
          title="🌞 Daily Tasks"
          tasks={dailyTasks}
          color="from-blue-200 to-cyan-200"
          onComplete={(t) => moveToCompleted(t)}
          onDelete={(id) => handleDeleteTask(id)}
        />
        <TaskSection
          title="📅 Weekly Tasks"
          tasks={weeklyTasks}
          color="from-green-200 to-lime-200"
          onComplete={(t) => moveToCompleted(t)}
          onDelete={(id) => handleDeleteTask(id)}
        />
        <TaskSection
          title="🧩 General Tasks"
          tasks={generalTasks}
          color="from-pink-200 to-purple-200"
          onComplete={(t) => moveToCompleted(t)}
          onDelete={(id) => handleDeleteTask(id)}
        />
      </div>
    </div>
  );
}

function TaskSection({
  title,
  tasks,
  color,
  onComplete,
  onDelete,
}: {
  title: string;
  tasks: Task[];
  color: string;
  onComplete: (t: Task) => void;
  onDelete: (id: string) => void;
}) {
  // show overdue badge by checking deadline
  function isOverdue(task: Task) {
    if (!task.deadline) return false;
    const d = toDateSafe(task.deadline);
    if (!d) return false;
    return d.getTime() < Date.now();
  }

  return (
    <motion.div
      className={`p-5 rounded-2xl shadow-lg bg-gradient-to-br ${color} text-gray-900`}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <h2 className="text-2xl font-bold mb-4 text-center">{title}</h2>
      {tasks.length === 0 ? (
        <p className="text-center text-gray-600">No tasks yet ✨</p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="group flex justify-between items-center bg-white/80 rounded-lg p-3 shadow hover:shadow-lg transition relative"
            >
              <div>
                <p className="font-semibold">
                  {task.title ?? task.task}
                  {isOverdue(task) && (
                    <span className="ml-2 inline-block text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                      Overdue
                    </span>
                  )}
                </p>
                {task.deadline && (
                  <p className={`text-sm ${isOverdue(task) ? "text-red-600" : "text-gray-600"}`}>
                    ⏰ {task.deadline}
                  </p>
                )}
              </div>

              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onComplete(task)}
                  className="bg-green-400 hover:bg-green-500 text-white p-2 rounded-full"
                  title="Mark complete"
                >
                  <FaCheck />
                </button>
                <button
                  onClick={() => onDelete(task.id)}
                  className="bg-red-400 hover:bg-red-500 text-white p-2 rounded-full"
                  title="Delete task"
                >
                  <FaTrash />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
