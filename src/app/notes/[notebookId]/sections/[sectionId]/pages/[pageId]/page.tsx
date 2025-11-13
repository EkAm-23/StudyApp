"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import TipTapEditor from "@/components/ui/TipTapEditor";
import { Button } from "@/components/ui/button";

export default function PageEditor() {
  const { notebookId, sectionId, pageId } = useParams();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    const fetchPage = async () => {
      if (!notebookId || !sectionId || !pageId) return;
      const pageRef = doc(db, `notebooks/${notebookId}/sections/${sectionId}/pages/${pageId}`);
      const snapshot = await getDoc(pageRef);
      if (snapshot.exists()) {
        const data = snapshot.data();
        setTitle((data.title as string) || "Untitled Page");
        setContent((data.content as string) || "");
      }
    };
    fetchPage();
  }, [notebookId, sectionId, pageId]);

  const handleSave = async () => {
    if (!notebookId || !sectionId || !pageId) return;
    setSaveStatus("saving");
    const pageRef = doc(db, `notebooks/${notebookId}/sections/${sectionId}/pages/${pageId}`);
    await updateDoc(pageRef, { title, content, updatedAt: new Date() });
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F5E6D3] to-[#E8D4BE] p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header Bar */}
        <div className="mb-6 flex items-center justify-between">
          <Button 
            variant="outline" 
            onClick={() => router.back()}
            className="border-[#4E692D] hover:bg-[#4E692D] hover:text-white text-black"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Button>

          <div className="flex items-center gap-3">
            {saveStatus === "saving" && (
              <span className="flex items-center text-sm text-[#8B7355]">
                <svg className="animate-spin h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center text-sm text-[#4E692D]">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </span>
            )}
            
            <Button 
              onClick={handleSave}
              className="bg-[#4E692D] hover:bg-[#3E5623] text-white shadow-sm"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save Page
            </Button>
          </div>
        </div>

        {/* Editor Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-[#D4C4B0]">
          <input
            className="text-3xl font-bold mb-6 w-full border-b-2 border-[#D4C4B0] focus:border-[#4E692D] p-3 focus:outline-none transition-colors text-black placeholder:text-gray-400"
            placeholder="Enter page title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          
          <TipTapEditor content={content} onChange={setContent} />
        </div>
      </div>
    </div>
  );
}
