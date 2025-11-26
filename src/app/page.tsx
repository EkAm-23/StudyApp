"use client";

import { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Dancing_Script } from "next/font/google";
// Removed shortcut icons per request

const dancing = Dancing_Script({ subsets: ["latin"], weight: ["700"] });

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const [dailyPercent, setDailyPercent] = useState(0);
  const [weeklyPercent, setWeeklyPercent] = useState(0);
  const [todayTasks, setTodayTasks] = useState<Array<{ id: string; title: string }>>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) router.push("/signin");
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, [router]);

  // Sign out removed per request

  // Subscribe to progress-related collections and compute percents
  useEffect(() => {
    if (!user?.uid) return;

    const tasksRef = query(collection(db, "tasks"), where("userId", "==", user.uid));
    const completedRef = query(collection(db, "completedTasks"), where("userId", "==", user.uid));

    let activeTasks = [] as Array<{ category?: string | null }>;
    let completedTasks = [] as Array<{ category?: string | null }>;

    const unsubTasks = onSnapshot(tasksRef, (snap) => {
      activeTasks = snap.docs.map((d) => {
        const raw = d.data() as { category?: string };
        return { category: typeof raw.category === "string" ? raw.category : null };
      });
      
      // Populate today's daily tasks
      const dailyTasksList = snap.docs
        .filter((d) => {
          const data = d.data() as { category?: string; title?: string; task?: string };
          return data.category === "daily";
        })
        .map((d) => {
          const data = d.data() as { title?: string; task?: string };
          return {
            id: d.id,
            title: data.title || data.task || "Untitled Task",
          };
        });
      setTodayTasks(dailyTasksList);
      
      computePercents();
    });

    const unsubCompleted = onSnapshot(completedRef, (snap) => {
      completedTasks = snap.docs.map((d) => {
        const raw = d.data() as { category?: string };
        return { category: typeof raw.category === "string" ? raw.category : null };
      });
      computePercents();
    });

    function computePercents() {
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
    }

    return () => {
      unsubTasks();
      unsubCompleted();
    };
  }, [user?.uid]);

  const firstName = (() => {
    const name = user?.displayName?.trim();
    if (name) {
      const parts = name.split(/\s+/);
      if (parts.length > 0 && parts[0].length > 0) return parts[0];
    }
    const email = (user as User | null)?.email || "";
    if (email) {
      const local = email.split("@")[0];
      if (local) return local;
    }
    return "Learner";
  })();

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-100 via-sky-100 to-emerald-100 flex flex-col items-center py-10">
      <div className="w-full max-w-2xl px-4">
        <div className="flex flex-col items-center text-center mb-8">
          <h1
            className={`${dancing.className} text-5xl sm:text-6xl md:text-7xl font-bold italic tracking-wide whitespace-normal break-words leading-tight overflow-visible max-w-full bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-600`}
          >
            Welcome {firstName}
          </h1>
          
          <p className="mt-3 text-lg md:text-xl text-blue-700/80 max-w-xl">
            Make today count — small steps, big progress.
          </p>
          <p className="mt-6 text-sm md:text-base text-gray-500 font-medium">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <section className="bg-sky-50/70 rounded-xl shadow-sm border border-sky-100 p-5 mb-6">
          <h2 className="text-2xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-blue-600">Today&apos;s Agenda</h2>
          {todayTasks.length === 0 ? (
            <p className="text-gray-600">
              All free for the day!
            </p>
          ) : (
            <ul className="space-y-2">
              {todayTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-3 p-3 bg-white/60 rounded-lg border border-sky-200"
                >
                  <span className="text-blue-500 text-sm">📌</span>
                  <span className="text-gray-800 font-medium text-sm">{task.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Shortcut icons removed */}

        <section className="bg-indigo-50/70 rounded-xl shadow-sm border border-indigo-100 p-5">
          <h2 className="text-2xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-blue-600">Progress Tracker</h2>
          <div className="w-full bg-white/50 rounded-full h-3">
            <div
              className="bg-blue-500 h-3 rounded-full transition-all"
              style={{ width: `${dailyPercent}%` }}
            ></div>
          </div>
          <p className="text-sm text-blue-700 mt-2">{dailyPercent}% complete today 🎯</p>
          <p className="text-xs text-gray-500">Weekly progress: {weeklyPercent}%</p>
        </section>
      </div>
    </main>
  );
}
