"use client";

import { useRouter } from "next/navigation";
import { FaArrowLeft, FaPlus } from "react-icons/fa";
import { useState } from "react";

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<string[]>([]);
  const [newTask, setNewTask] = useState("");

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks([...tasks, newTask]);
    setNewTask("");
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 to-white flex flex-col items-center py-10">
      <div className="w-full max-w-2xl p-4">
        <button
          onClick={() => router.push("/")}
          className="flex items-center text-green-600 hover:text-green-800 mb-6"
        >
          <FaArrowLeft className="mr-2" />
          Back to Home
        </button>
        <h1 className="text-2xl font-semibold mb-4">📝 Tasks</h1>

        <div className="flex mb-4">
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Add a new task"
            className="flex-grow border border-gray-300 rounded-l-lg p-2"
          />
          <button
            onClick={addTask}
            className="bg-green-500 text-white px-4 rounded-r-lg hover:bg-green-600"
          >
            <FaPlus />
          </button>
        </div>

        <ul className="space-y-2">
          {tasks.length === 0 ? (
            <p className="text-gray-500">No tasks yet. Add one!</p>
          ) : (
            tasks.map((task, index) => (
              <li
                key={index}
                className="bg-white shadow rounded-lg p-3 text-gray-800"
              >
                {task}
              </li>
            ))
          )}
        </ul>
      </div>
    </main>
  );
}
