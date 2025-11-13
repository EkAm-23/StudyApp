"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../lib/firebase";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../../lib/firebase";

export default function NotesPage() {
  const [user, loading] = useAuthState(auth);
  const [notebooks, setNotebooks] = useState<{ id: string; title: string }[]>([]);
  const [newNotebookTitle, setNewNotebookTitle] = useState("");
  const router = useRouter();
  
  

  useEffect(() => {
    const fetchNotebooks = async () => {
    if (!user) return;
    const snapshot = await getDocs(collection(db, "users", user.uid, "notebooks"));
    const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as {
      id: string;
      title: string;
    }[];
    setNotebooks(list);
  };
    if (user) {
      fetchNotebooks();
    }
  }, [user]);


  const createNotebook = async () => {
    if (!user || !newNotebookTitle.trim()) return;
    const docRef = await addDoc(collection(db, "users", user.uid, "notebooks"), {
      title: newNotebookTitle.trim(),
      createdAt: new Date(),
    });
    setNewNotebookTitle("");
    setNotebooks([...notebooks, { id: docRef.id, title: newNotebookTitle.trim() }]);
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F5E6D3] to-[#E8D4BE] flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-[#4E692D] border-r-transparent mb-4"></div>
        <p className="text-black font-medium">Loading your notebooks...</p>
      </div>
    </div>
  );
  
  if (!user) return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F5E6D3] to-[#E8D4BE] flex items-center justify-center">
      <div className="text-center bg-white p-8 rounded-2xl shadow-lg border border-[#D4C4B0]">
        <svg className="w-16 h-16 mx-auto mb-4 text-[#4E692D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-black font-semibold text-lg">Please sign in to view your notebooks.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F5E6D3] to-[#E8D4BE] p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-[#4E692D] mb-3">
            Your Notebooks
          </h1>
          <p className="text-gray-700">Organize your thoughts and ideas beautifully</p>
        </div>

        {/* Create Notebook Section */}
        <div className="flex justify-center mb-10">
          <div className="flex items-center bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow border border-[#D4C4B0] overflow-hidden max-w-md w-full">
            <div className="pl-4 text-[#4E692D]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Enter notebook name..."
              value={newNotebookTitle}
              onChange={(e) => setNewNotebookTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createNotebook()}
              className="flex-1 px-4 py-3 focus:outline-none text-black placeholder:text-gray-400"
            />
            <button
              onClick={createNotebook}
              className="bg-[#4E692D] text-white px-6 py-3 hover:bg-[#3E5623] transition-all font-medium flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create
            </button>
          </div>
        </div>

        {/* Notebooks Grid */}
        {notebooks.length === 0 ? (
          <div className="text-center py-20">
            <svg className="w-20 h-20 mx-auto mb-4 text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-800 text-lg font-medium mb-2">No notebooks yet</p>
            <p className="text-gray-600">Create your first notebook to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {notebooks.map((notebook) => (
              <div
                key={notebook.id}
                onClick={() => router.push(`/notes/${notebook.id}`)}
                className="group relative p-6 bg-white rounded-xl shadow-md hover:shadow-xl cursor-pointer transition-all duration-300 border border-[#D4C4B0] hover:border-[#4E692D] hover:-translate-y-1"
              >
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-8 h-8 rounded-full bg-[#4E692D] flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
                
                <div className="mb-3">
                  <div className="w-12 h-12 rounded-lg bg-[#4E692D] flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-black group-hover:text-[#4E692D] transition-colors line-clamp-2">
                    {notebook.title}
                  </h2>
                </div>
                
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Open notebook</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
