"use client";

import { useRouter } from "next/navigation";
import { FaArrowLeft } from "react-icons/fa";

export default function CalendarPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col items-center py-10">
      <div className="w-full max-w-2xl p-4">
        <button
          onClick={() => router.push("/")}
          className="flex items-center text-blue-600 hover:text-blue-800 mb-6"
        >
          <FaArrowLeft className="mr-2" />
          Back to Home
        </button>
        <h1 className="text-2xl font-semibold mb-4">📅 Calendar</h1>
        <p className="text-gray-600">Your schedule will appear here soon.</p>
      </div>
    </main>
  );
}
