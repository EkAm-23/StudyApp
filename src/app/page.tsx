"use client";

import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useRouter } from "next/navigation";
import { FaCalendarAlt, FaTasks, FaStickyNote } from "react-icons/fa";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) router.push("/signin");
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, [router]);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push("/signin");
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-100 via-sky-100 to-emerald-100 flex flex-col items-center py-10">
      <div className="w-full max-w-2xl p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-blue-700">
            👋 Welcome, {user?.displayName || "Learner"}
          </h1>
          <button
            onClick={handleSignOut}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Sign Out
          </button>
        </div>

        <section className="bg-white rounded-xl shadow-md p-5 mb-6">
          <h2 className="text-xl font-semibold mb-3">Today&apos;s Agenda</h2>
          <p className="text-gray-500">
            No tasks yet — stay tuned for productivity magic!
          </p>
        </section>

        <section className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => router.push("/calendar")}
            className="bg-white/80 hover:bg-white rounded-xl p-4 flex flex-col items-center"
          >
            <FaCalendarAlt className="text-3xl text-blue-600 mb-2" />
            <span>Calendar</span>
          </button>

          <button
            onClick={() => router.push("/tasks")}
            className="bg-white/80 hover:bg-white rounded-xl p-4 flex flex-col items-center"
          >
            <FaTasks className="text-3xl text-blue-600 mb-2" />
            <span>Tasks</span>
          </button>

          <button
            onClick={() => router.push("/notes")}
            className="bg-white/80 hover:bg-white rounded-xl p-4 flex flex-col items-center"
          >
            <FaStickyNote className="text-3xl text-blue-600 mb-2" />
            <span>Notes</span>
          </button>
        </section>

        <section className="bg-white rounded-xl shadow-md p-5">
          <h2 className="text-xl font-semibold mb-3">Progress Tracker</h2>
          <div className="w-full bg-white/50 rounded-full h-3">
            <div
              className="bg-blue-500 h-3 rounded-full"
              style={{ width: "40%" }}
            ></div>
          </div>
          <p className="text-sm text-blue-700 mt-2">40% complete today 🎯</p>
        </section>
      </div>
    </main>
  );
}
