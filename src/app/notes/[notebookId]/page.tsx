"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, auth } from "../../../lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { Button } from "@/components/ui/button";
import TipTapEditor from "@/components/ui/TipTapEditor";
import { motion } from "framer-motion";

interface PageData {
  id: string;
  title: string;
  content: string;
}

interface Section {
  id: string;
  name: string;
}

export default function NotebookPage() {
  const { notebookId } = useParams();
  const router = useRouter();
  const [user, loading] = useAuthState(auth);

  const [notebookTitle, setNotebookTitle] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [selectedPage, setSelectedPage] = useState<PageData | null>(null);

  const [sectionsLoaded, setSectionsLoaded] = useState(false);
  const [pagesLoaded, setPagesLoaded] = useState(false);

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/signin");
    }
  }, [user, loading, router]);

  // add vs edit states are separate to avoid clobbering values
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [addingPage, setAddingPage] = useState(false);
  const [newPageName, setNewPageName] = useState("");

  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState("");

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    sectionId: string | null;
  } | null>(null);

  // Resizable sidebars
  const [sectionsWidth, setSectionsWidth] = useState(202); // 0.7 * 288 = 201.6
  const [pagesWidth, setPagesWidth] = useState(202);
  const [isResizingSections, setIsResizingSections] = useState(false);
  const [isResizingPages, setIsResizingPages] = useState(false);

  const addInputRef = useRef<HTMLInputElement | null>(null);
  const addPageInputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      if (isResizingSections) {
        const newWidth = e.clientX;
        if (newWidth >= 160 && newWidth <= 400) { // min: 160, max: 2.5 * 160 = 400
          setSectionsWidth(newWidth);
        }
      }
      if (isResizingPages) {
        const newWidth = e.clientX - sectionsWidth;
        if (newWidth >= 160 && newWidth <= 400) {
          setPagesWidth(newWidth);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizingSections(false);
      setIsResizingPages(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    if (isResizingSections || isResizingPages) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizingSections, isResizingPages, sectionsWidth]);

  // Click outside: close context menu; DO NOT force-end rename here.
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideAdd = addInputRef.current?.contains(target);
      const insideAddPage = addPageInputRef.current?.contains(target);
      const insideEdit = editInputRef.current?.contains(target);

      // Always close context menu
      setContextMenu(null);

      // If user is typing a new section name, clicking elsewhere cancels "add"
      if (!insideAdd && addingSection) {
        setAddingSection(false);
        setNewSectionName("");
      }

      if (!insideAddPage && addingPage) {
        setAddingPage(false);
        setNewPageName("");
      }

      // IMPORTANT: don't kill edit mode here. Let the input's onBlur handle rename.
      // If we cleared edit here, it would run before onBlur and break rename.
      if (!insideEdit) {
        // do nothing; onBlur of the input will finalize or revert
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [addingSection, addingPage]);

  // Fetch notebook title
  useEffect(() => {
    if (!user || !notebookId) return;

    const ref = doc(db, "users", user.uid, "notebooks", notebookId as string);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setNotebookTitle((snap.data().title as string) || "Untitled Notebook");
    });

    return () => unsub();
  }, [user, notebookId]);

  // Fetch sections
  useEffect(() => {
    if (!user || !notebookId) return;

    const ref = collection(db, "users", user.uid, "notebooks", notebookId as string, "sections");
    const unsub = onSnapshot(ref, (snap) => {
      setSections(
        snap.docs.map((d) => ({
          id: d.id,
          name: (d.data().name as string) || "Untitled Section",
        }))
      );
      setSectionsLoaded(true);
    });

    return () => unsub();
  }, [user, notebookId]);

  // Fetch pages when a section is selected
  useEffect(() => {
    if (!user || !notebookId || !selectedSection) return;

    const ref = collection(
      db,
      "users",
      user.uid,
      "notebooks",
      notebookId as string,
      "sections",
      selectedSection as string,
      "pages"
    );

    const unsub = onSnapshot(ref, (snap) => {
      setPages(
        snap.docs.map((d) => ({
          id: d.id,
          title: (d.data().title as string) || "Untitled Page",
          content: (d.data().content as string) || "",
        }))
      );
      setPagesLoaded(true);
    });

    return () => unsub();
  }, [user, notebookId, selectedSection]);

  const addSection = async () => {
    if (!user || !notebookId) return;
    const name = newSectionName.trim();
    if (!name) return;

    await addDoc(
      collection(db, "users", user.uid, "notebooks", notebookId as string, "sections"),
      { name }
    );

    setNewSectionName("");
    setAddingSection(false);
  };

  const renameSection = async (id: string, name: string) => {
    if (!user || !notebookId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      // empty name: revert UI only
      setEditingSectionId(null);
      setEditSectionName("");
      return;
    }

    await updateDoc(
      doc(db, "users", user.uid, "notebooks", notebookId as string, "sections", id),
      { name: trimmed }
    );

    setEditingSectionId(null);
    setEditSectionName("");
  };

  const addPage = async () => {
    if (!selectedSection || !user || !notebookId) return;
    const title = newPageName.trim() || `Page ${pages.length + 1}`;

    await addDoc(
      collection(
        db,
        "users",
        user.uid,
        "notebooks",
        notebookId as string,
        "sections",
        selectedSection as string,
        "pages"
      ),
      { title, content: "", createdAt: new Date() }
    );

    setNewPageName("");
    setAddingPage(false);
  };

  // Debounced auto-save
  const savePage = async (contentOverride?: string) => {
    if (!selectedPage || !selectedSection || !user || !notebookId) return;

    setSaveStatus("saving");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      await updateDoc(
        doc(
          db,
          "users",
          user.uid,
          "notebooks",
          notebookId as string,
          "sections",
          selectedSection as string,
          "pages",
          selectedPage.id
        ),
        {
          content: contentOverride ?? selectedPage.content,
          title: selectedPage.title,
          updatedAt: new Date(),
        }
      );
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 1500);
  };

  // cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return (
    <div className="flex h-screen bg-gradient-to-br from-white via-sky-50 to-sky-100">
      {/* Sections Sidebar */}
      <div 
        className="bg-sky-50 backdrop-blur-sm p-5 border-r border-sky-200 shadow-sm overflow-y-auto relative flex-shrink-0"
        style={{ width: `${sectionsWidth}px` }}
      >
        <div className="flex justify-between items-center mb-6 gap-3">
          <h2 className="font-bold text-base text-black flex items-center gap-2 min-w-0">
            <button
              onClick={() => router.push('/notes')}
              className="hover:bg-sky-200 p-1 rounded transition-colors flex-shrink-0"
              title="Back to Notebooks"
            >
              <svg className="w-4 h-4 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <span className="truncate">Sections</span>
          </h2>
          <Button 
            size="sm" 
            onClick={() => setAddingSection(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm p-1.5 h-auto flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </Button>
        </div>

        {addingSection && (
          <div className="mb-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <input
              ref={addInputRef}
              className="border-2 border-blue-600 p-2 rounded-lg w-full focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-600/30 transition-all text-sm text-black bg-white"
              placeholder="New section name..."
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addSection();
                }
              }}
              autoFocus
              onBlur={() => {
                setAddingSection(false);
                setNewSectionName("");
              }}
            />
          </div>
        )}

        {!sectionsLoaded ? (
          <div className="text-center py-8 text-gray-500">
            <div className="w-10 h-10 mx-auto mb-2 border-3 border-sky-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-sm">Fetching sections...</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {sections.map((section, index) => (
                <motion.div 
                  key={section.id} 
                  className="relative group"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                >
                  <button
                    className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center gap-3 ${
                      selectedSection === section.id 
                        ? "bg-blue-600 text-white shadow-md" 
                        : "bg-white hover:bg-sky-100 text-black hover:shadow-sm"
                    }`}
                    onClick={() => {
                      setSelectedSection(section.id);
                      setSelectedPage(null);
                      setPagesLoaded(false);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const newName = prompt("Rename section:", section.name);
                      if (newName && newName.trim()) {
                        updateDoc(
                          doc(
                            db,
                            "users",
                            user!.uid,
                            "notebooks",
                            notebookId as string,
                            "sections",
                            section.id
                          ),
                          { name: newName.trim() }
                        );
                      }
                    }}
                  >
                    <svg 
                      className={`w-4 h-4 flex-shrink-0 transition-colors ${selectedSection === section.id ? 'text-white' : 'text-blue-700 group-hover:text-blue-400'}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="font-medium flex-1 truncate text-sm">{section.name}</span>
                  </button>

                  {/* delete button */}
                  <button
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black hover:bg-gray-800 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center shadow-sm"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm("Delete this section and all its pages?")) return;

                      const pagesSnap = await getDocs(
                        collection(
                          db,
                          "users",
                          user!.uid,
                          "notebooks",
                          notebookId as string,
                          "sections",
                          section.id,
                          "pages"
                        )
                      );

                      await Promise.all(
                        pagesSnap.docs.map(d =>
                          deleteDoc(
                            doc(
                              db,
                              "users",
                              user!.uid,
                              "notebooks",
                              notebookId as string,
                              "sections",
                              section.id,
                              "pages",
                              d.id
                            )
                          )
                        )
                      );

                      await deleteDoc(
                        doc(
                          db,
                          "users",
                          user!.uid,
                          "notebooks",
                          notebookId as string,
                          "sections",
                          section.id
                        )
                      );

                      setSections(prev => prev.filter(s => s.id !== section.id));
                      if (selectedSection === section.id) {
                        setSelectedSection(null);
                        setSelectedPage(null);
                      }
                    }}
                  >
                    ✕
                  </button>
                </motion.div>
              ))}
            </div>

            {sections.length === 0 && !addingSection && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="text-center py-8 text-gray-500"
              >
                <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <p className="text-sm">No sections yet</p>
              </motion.div>
            )}
          </>
        )}

        {/* Resize handle */}
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize bg-sky-200 hover:bg-blue-600 transition-colors group select-none"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizingSections(true);
          }}
        >
          <div className="absolute top-1/2 right-0 transform translate-x-1/2 -translate-y-1/2 w-3 h-12 flex items-center justify-center transition-opacity">
            <div className="flex flex-col gap-0.5">
              <div className="w-0.5 h-4 bg-blue-600 rounded-full"></div>
              <div className="w-0.5 h-4 bg-blue-600 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Pages Sidebar */}
      {selectedSection && (
        <div 
          className="bg-sky-50 backdrop-blur-sm p-5 border-r border-sky-200 shadow-sm overflow-y-auto relative flex-shrink-0"
          style={{ width: `${pagesWidth}px` }}
        >
          <div className="flex justify-between items-center mb-6 gap-3">
            <h2 className="font-bold text-base text-black flex items-center gap-2 min-w-0">
              <svg className="w-4 h-4 text-blue-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="truncate">Pages</span>
            </h2>
            <Button 
              size="sm" 
              onClick={() => setAddingPage(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm p-1.5 h-auto flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </Button>
          </div>

          {addingPage && (
            <div className="mb-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <input
                ref={addPageInputRef}
                className="border-2 border-blue-600 p-2 rounded-lg w-full focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-600/30 transition-all text-sm text-black bg-white"
                placeholder="New page name..."
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addPage();
                  }
                }}
                autoFocus
                onBlur={() => {
                  addPage();
                }}
              />
            </div>
          )}

          {!pagesLoaded ? (
            <div className="text-center py-8 text-gray-500">
              <div className="w-10 h-10 mx-auto mb-2 border-3 border-sky-200 border-t-blue-600 rounded-full animate-spin"></div>
              <p className="text-sm">Fetching pages...</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {pages.map((page, index) => (
                  <motion.div 
                    key={page.id} 
                    className="relative group"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                  >
                    <button
                      className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center gap-3 ${
                        selectedPage?.id === page.id 
                          ? "bg-blue-600 text-white shadow-md" 
                          : "bg-white hover:bg-sky-100 text-black hover:shadow-sm"
                      }`}
                      onClick={() => setSelectedPage(page)}
                    >
                      <svg 
                        className={`w-4 h-4 flex-shrink-0 transition-colors ${selectedPage?.id === page.id ? 'text-white' : 'text-blue-700 group-hover:text-blue-400'}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="font-medium flex-1 truncate text-sm">{page.title}</span>
                    </button>

                    {/* delete button */}
                    <button
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black hover:bg-gray-800 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center shadow-sm"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm("Delete this page?")) return;
                        if (!user || !notebookId) return;

                        await deleteDoc(
                          doc(
                            db,
                            "users",
                            user.uid,
                            "notebooks",
                            notebookId as string,
                            "sections",
                            selectedSection as string,
                            "pages",
                            page.id
                          )
                        );

                        if (selectedPage?.id === page.id) {
                          setSelectedPage(null);
                        }
                      }}
                    >
                      ✕
                    </button>
                  </motion.div>
                ))}
              </div>

              {pages.length === 0 && !addingPage && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="text-center py-8 text-gray-500"
                >
                  <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm">No pages yet</p>
                </motion.div>
              )}
            </>
          )}

          {/* Resize handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize bg-sky-200 hover:bg-blue-600 transition-colors group select-none"
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingPages(true);
            }}
          >
            <div className="absolute top-1/2 right-0 transform translate-x-1/2 -translate-y-1/2 w-3 h-12 flex items-center justify-center transition-opacity">
              <div className="flex flex-col gap-0.5">
                <div className="w-0.5 h-4 bg-blue-600 rounded-full"></div>
                <div className="w-0.5 h-4 bg-blue-600 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Panel */}
      <div className="flex-1 p-8 overflow-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-blue-700 mb-2">
            {notebookTitle}
          </h1>
          <div className="h-1 w-20 bg-blue-600 rounded-full"></div>
        </div>

        {!selectedSection && (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <svg className="w-24 h-24 mx-auto mb-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <p className="text-gray-800 text-lg font-medium">Select a section to view pages</p>
              <p className="text-gray-600 text-sm mt-1">or create a new section to get started</p>
            </div>
          </div>
        )}

        {selectedSection && !selectedPage && (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <svg className="w-24 h-24 mx-auto mb-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-800 text-lg font-medium">Select a page to start editing</p>
              <p className="text-gray-600 text-sm mt-1">or create a new page in this section</p>
            </div>
          </div>
        )}

        {selectedPage && (
          <motion.div 
            key={selectedPage.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="max-w-5xl mx-auto"
          >
            <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-sky-200">
              <input
                className="text-3xl font-bold mb-6 w-full border-b-2 border-sky-200 focus:border-blue-600 p-2 focus:outline-none transition-colors text-black placeholder:text-gray-400"
                placeholder="Page title..."
                value={selectedPage.title}
                onChange={(e) => {
                  const t = e.target.value;
                  setSelectedPage({ ...selectedPage, title: t });
                  savePage(t);
                }}
              />

              <div className="flex items-center gap-2 mb-4 text-sm">
                {saveStatus === "saving" && (
                  <span className="flex items-center text-slate-500">
                    <svg className="animate-spin h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </span>
                )}
                {saveStatus === "saved" && (
                  <span className="flex items-center text-blue-600">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </span>
                )}
              </div>

              <TipTapEditor
                content={selectedPage.content}
                onChange={(c) => {
                  setSelectedPage({ ...selectedPage, content: c });
                  savePage(c);
                }}
              />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
