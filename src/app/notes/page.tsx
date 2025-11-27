"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../lib/firebase";
import { collection, addDoc, getDocs, doc, deleteDoc } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../../lib/firebase";
import { motion } from "framer-motion";

export default function NotesPage() {
  const [user, loading] = useAuthState(auth);
  const [notebooks, setNotebooks] = useState<{ id: string; title: string }[]>([]);
  const [newNotebookTitle, setNewNotebookTitle] = useState("");
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(true);
  const router = useRouter();
  
  // Redirect to signin if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/signin");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchNotebooks = async () => {
      if (!user) return;
      setIsLoadingNotebooks(true);
      const snapshot = await getDocs(collection(db, "users", user.uid, "notebooks"));
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as {
        id: string;
        title: string;
      }[];
      setNotebooks(list);
      setIsLoadingNotebooks(false);
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

  const deleteNotebook = async (notebookId: string) => {
    if (!user) return;

    // delete all pages under each section, then sections, then the notebook
    const sectionsSnap = await getDocs(collection(db, "users", user.uid, "notebooks", notebookId, "sections"));

    for (const sectionDoc of sectionsSnap.docs) {
      const pagesSnap = await getDocs(
        collection(
          db,
          "users",
          user.uid,
          "notebooks",
          notebookId,
          "sections",
          sectionDoc.id,
          "pages"
        )
      );

      // delete pages
      await Promise.all(
        pagesSnap.docs.map((p) =>
          deleteDoc(
            doc(
              db,
              "users",
              user.uid,
              "notebooks",
              notebookId,
              "sections",
              sectionDoc.id,
              "pages",
              p.id
            )
          )
        )
      );

      // delete section itself
      await deleteDoc(
        doc(db, "users", user.uid, "notebooks", notebookId, "sections", sectionDoc.id)
      );
    }

    // delete the notebook document
    await deleteDoc(doc(db, "users", user.uid, "notebooks", notebookId));

    // update local state
    setNotebooks((prev) => prev.filter((n) => n.id !== notebookId));
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-sky-100 to-emerald-100 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent mb-4"></div>
        <p className="text-blue-700 font-medium">Loading your notebooks...</p>
      </div>
    </div>
  );
  
  if (!user) return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-sky-100 to-emerald-100 flex items-center justify-center">
      <div className="text-center bg-white/80 p-8 rounded-2xl shadow-lg border border-blue-100">
        <svg className="w-16 h-16 mx-auto mb-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-blue-700 font-semibold text-lg">Please sign in to view your notebooks.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-sky-100 to-emerald-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-blue-700 mb-3">
            Your Notebooks
          </h1>
          <p className="text-blue-700">Organize your thoughts and ideas</p>
        </div>

        {/* Create Notebook Section */}
        <div className="flex justify-center mb-10">
          <div className="flex items-center bg-white/80 rounded-xl shadow-md hover:shadow-lg transition-shadow border border-blue-100 overflow-hidden max-w-md w-full">
            <div className="pl-4 text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Enter new Notebook title.."
              value={newNotebookTitle}
              onChange={(e) => setNewNotebookTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createNotebook()}
              className="flex-1 px-4 py-3 focus:outline-none text-black placeholder:text-gray-400"
            />
            <button
              onClick={createNotebook}
              className="bg-blue-600 text-white px-6 py-3 hover:bg-blue-700 transition-all font-medium flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create
            </button>
          </div>
        </div>

        {/* Notebooks Grid */}
        {isLoadingNotebooks ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 mx-auto mb-4 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-blue-700 text-base">Fetching notebooks...</p>
          </div>
        ) : notebooks.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="text-center py-20"
          >
            <svg className="w-20 h-20 mx-auto mb-4 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-blue-700 text-lg font-medium mb-2">No notebooks yet</p>
            <p className="text-blue-500">Create your first notebook to get started!</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {notebooks.map((notebook) => (
              <motion.div
                key={notebook.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                onClick={() => router.push(`/notes/${notebook.id}`)}
                  className="group relative p-6 bg-white/90 rounded-xl shadow-md hover:shadow-xl cursor-pointer border border-blue-100 hover:border-blue-600 hover:-translate-y-1 transform transition-all duration-250 ease-out"
              >
                {/* Delete cross like sections/pages */}
                <button
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black hover:bg-gray-800 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center shadow-sm"
                  title="Delete notebook"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm("Delete this notebook and all its sections/pages?")) return;
                    await deleteNotebook(notebook.id);
                  }}
                >
                  ✕
                </button>
                
                <div className="mb-3">
                  <motion.div initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.18 }}>
                    <div className="w-12 h-12 rounded-lg bg-blue-600 flex items-center justify-center mb-4 transition-colors duration-250 ease-out group-hover:bg-blue-700">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    </div>
                  </motion.div>
                  <h2 className="text-xl font-semibold text-blue-700 group-hover:text-blue-600 transition-colors duration-300 ease-in-out line-clamp-2">
                    {notebook.title}
                  </h2>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
