"use client";

import { useRouter } from "next/navigation";
import { FaArrowLeft } from "react-icons/fa";
import { useState } from "react";

export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState("");

  const addNote = () => {
    if (!newNote.trim()) return;
    setNotes([...notes, newNote]);
    setNewNote("");
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-yellow-50 to-white flex flex-col items-center py-10">
      <div className="w-full max-w-2xl p-4">
        <button
          onClick={() => router.push("/")}
          className="flex items-center text-yellow-600 hover:text-yellow-800 mb-6"
        >
          <FaArrowLeft className="mr-2" />
          Back to Home
        </button>
        <h1 className="text-2xl font-semibold mb-4">🗒️ Notes</h1>

        <div className="flex mb-4">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Write something..."
            className="flex-grow border border-gray-300 rounded-lg p-2"
          />
        </div>

        <button
          onClick={addNote}
          className="bg-yellow-500 text-white px-6 py-2 rounded-lg hover:bg-yellow-600 mb-6"
        >
          Save Note
        </button>

        <ul className="space-y-2">
          {notes.length === 0 ? (
            <p className="text-gray-500">No notes yet.</p>
          ) : (
            notes.map((note, index) => (
              <li
                key={index}
                className="bg-white shadow rounded-lg p-3 text-gray-800"
              >
                {note}
              </li>
            ))
          )}
        </ul>
      </div>
    </main>
  );
}
