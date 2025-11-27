"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useState } from "react";
import Heading from '@tiptap/extension-heading';

import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";

interface TipTapEditorProps {
  content: string;
  onChange: (newContent: string) => void;
}

export default function TipTapEditor({ content, onChange }: TipTapEditorProps) {
  type SpeechRecognitionLike = {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    start: () => void;
    stop: () => void;
    addEventListener: (type: 'result' | 'end' | 'error', cb: (e: unknown) => void) => void;
    removeEventListener: (type: 'result' | 'end' | 'error', cb: (e: unknown) => void) => void;
  };
  type SpeechResult = { isFinal: boolean; 0?: { transcript?: string } };
  type SpeechEvent = { resultIndex: number; results: SpeechResult[] };
  // Speech state (reused from Tasks page patterns)
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const lastFinalRef = useRef<string | null>(null);
  const previewPosRef = useRef<number | null>(null);
  const previewLengthRef = useRef<number>(0);
  const committedTextRef = useRef<string>("");
  const punctuationTriggeredRef = useRef<boolean>(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false
      }),
      Heading.configure({ levels: [1, 2, 3] }),
      BulletList,
      OrderedList,
      ListItem,
      Underline,
      Placeholder.configure({
        placeholder: "Start typing your notes..."
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Summarize loading state
  const [summarizing, setSummarizing] = useState(false);
  const [punctuating, setPunctuating] = useState(false);

  // Feature detect Web Speech API
  useEffect(() => {
    const win = typeof window !== "undefined" ? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike }) : undefined;
    const SpeechRecognition = win?.webkitSpeechRecognition || win?.SpeechRecognition || null;
    if (!SpeechRecognition) {
      // defer to next tick to avoid sync setState warning
      setTimeout(() => setSpeechSupported(false), 0);
      return;
    }
    try {
      const rec = new SpeechRecognition();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = true;
      recognitionRef.current = rec;
      setTimeout(() => setSpeechSupported(true), 0);
    } catch {
      setTimeout(() => setSpeechSupported(false), 0);
    }
  }, []);

  // Recognition handlers
  useEffect(() => {
    const rec = recognitionRef.current;
    if (!rec) return;

    const collapseRepeatedWords = (s: string) => {
      if (!s) return s;
      const parts = s.trim().split(/\s+/);
      const out: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const prev = out[out.length - 1];
        if (!prev || prev.toLowerCase() !== parts[i].toLowerCase()) {
          out.push(parts[i]);
        }
      }
      return out.join(" ");
    };

    const onResult = (e: unknown) => {
      const event = e as SpeechEvent;
      let localFinal = "";
      let localInterim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        const transcript = (res[0]?.transcript ?? "").trim();
        if (res.isFinal) localFinal += (localFinal ? " " : "") + transcript;
        else localInterim += (localInterim ? " " : "") + transcript;
      }
      if (!editor || previewPosRef.current === null) return;
      // If we have finalized segments, append them to committed text
      if (localFinal) {
        const cleanedFinal = collapseRepeatedWords(localFinal);
        committedTextRef.current = (committedTextRef.current + (committedTextRef.current ? " " : "") + cleanedFinal).trim();
        setInterimText("");
      } else {
        const cleanedInterim = collapseRepeatedWords(localInterim);
        setInterimText(cleanedInterim);
      }
      // Build effective combined preview (committed + interim)
      const effectiveInterim = localFinal ? "" : collapseRepeatedWords(localInterim);
      const combined = (committedTextRef.current + (committedTextRef.current && effectiveInterim ? " " : "") + effectiveInterim).trim();
      const from = previewPosRef.current;
      const to = from + previewLengthRef.current;
      if (previewLengthRef.current > 0) {
        try { editor.commands.deleteRange({ from, to }); } catch {}
      }
      if (combined) {
        editor.commands.insertContentAt(from, combined);
        previewLengthRef.current = combined.length;
      } else {
        previewLengthRef.current = 0;
      }
    };

    const punctuateAndCommit = async () => {
      if (punctuationTriggeredRef.current) return;
      punctuationTriggeredRef.current = true;
      try {
        if (!editor) return;
        const combinedPlain = (committedTextRef.current + (committedTextRef.current && interimText ? " " : "") + interimText).trim();
        if (!combinedPlain) return;
        setPunctuating(true);
        const res = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: combinedPlain, mode: "punctuate" }),
        });
        let finalText = combinedPlain;
        if (res.ok) {
          const data = await res.json();
          const corrected = (data?.text as string) || (data?.summary as string) || "";
          if (corrected && corrected.trim()) finalText = corrected.trim();
        } else {
          const errText = await res.text().catch(() => "");
          console.error("Punctuate API error", res.status, errText);
        }
        // Replace preview with finalText
        if (previewPosRef.current !== null) {
          const from = previewPosRef.current;
          const to = from + previewLengthRef.current;
          try { editor.commands.deleteRange({ from, to }); } catch {}
          editor.commands.insertContentAt(from, finalText + " ");
          const newPos = from + finalText.length + 1;
          try { editor.commands.setTextSelection(newPos); } catch {}
        } else {
          editor.chain().focus().insertContent(finalText + " ").run();
        }
      } catch (e) {
        console.error("punctuateAndCommit error", e);
        // Fallback: commit raw text
        try {
          if (editor) {
            const combinedPlain = (committedTextRef.current + (committedTextRef.current && interimText ? " " : "") + interimText).trim();
            if (previewPosRef.current !== null) {
              const from = previewPosRef.current;
              const to = from + previewLengthRef.current;
              try { editor.commands.deleteRange({ from, to }); } catch {}
              if (combinedPlain) {
                editor.commands.insertContentAt(from, combinedPlain + " ");
              }
            } else if (combinedPlain) {
              editor.chain().focus().insertContent(combinedPlain + " ").run();
            }
          }
        } catch {}
      } finally {
        setPunctuating(false);
        setInterimText("");
        committedTextRef.current = "";
        previewPosRef.current = null;
        previewLengthRef.current = 0;
      }
    };

    const onEnd = () => {
      setListening(false);
      // If recognition ended naturally without manual stop, commit
      if (!punctuationTriggeredRef.current) {
        punctuateAndCommit();
      }
    };

    const onError = (e: unknown) => {
      console.error("Speech recognition error", e);
      setListening(false);
    };

    rec.addEventListener("result", onResult);
    rec.addEventListener("end", onEnd);
    rec.addEventListener("error", onError);

    return () => {
      rec.removeEventListener("result", onResult);
      rec.removeEventListener("end", onEnd);
      rec.removeEventListener("error", onError);
    };
  }, [editor, interimText]);

  const startListening = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      lastFinalRef.current = null;
      rec.lang = "en-US";
      rec.interimResults = true;
      // Allow longer dictation; manual stop or silence triggers end
      rec.continuous = true;
      // Capture current cursor position and prepare inline preview
      if (editor) {
        const { from } = editor.state.selection;
        previewPosRef.current = from;
        previewLengthRef.current = 0;
        committedTextRef.current = "";
        punctuationTriggeredRef.current = false;
      }
      rec.start();
      setListening(true);
    } catch (e) {
      console.error("startListening error", e);
      setListening(false);
    }
  };

  const stopListening = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch (e) {
      console.error("stopListening error", e);
    }
    setListening(false);
    setInterimText("");
  };

  const summarizePage = async () => {
    if (!editor || summarizing) return;
    setSummarizing(true);
    const pageText = editor.getText();
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: pageText }),
      });
      const data = await res.json();
      const summary = (data?.summary as string) || "";
      if (summary) {
        const html = `<h2>Summarised page contents</h2><div>${summary.replace(/\n/g, '<br/>')}</div>`;
        editor.chain().focus().insertContent(html).run();
      }
    } catch (e) {
      console.error("Summarize error", e);
    } finally {
      setSummarizing(false);
    }
  };

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return <p>Loading editor...</p>;

  return (
    <div
      className="border-2 border-sky-200 rounded-xl bg-white shadow-md hover:shadow-lg transition-shadow focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/20"
      onClick={() => editor?.commands.focus()}
    >
      {/* Toolbar */}
  <div className="sticky top-4 z-30 border-b-2 border-sky-200 p-3 flex gap-1 flex-wrap bg-sky-50 rounded-t-xl">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
            editor.isActive("bold") 
              ? "bg-blue-600 text-white shadow-md font-extrabold" 
              : "hover:bg-sky-200 text-blue-700 font-extrabold"
          }`}
          title="Bold"
        >
          <span>B</span>
        </button>

        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-3 py-2 text-sm rounded-lg italic transition-all duration-200 ${
            editor.isActive("italic") 
              ? "bg-blue-600 text-white shadow-md font-bold" 
              : "hover:bg-sky-200 text-blue-700 font-bold"
          }`}
          title="Italic"
        >
          <span>I</span>
        </button>

        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`px-3 py-2 text-sm rounded-lg underline transition-all duration-200 ${
            editor.isActive("underline") 
              ? "bg-blue-600 text-white shadow-md font-bold" 
              : "hover:bg-sky-200 text-blue-700 font-bold"
          }`}
          title="Underline"
        >
          <span>U</span>
        </button>

        <div className="w-px h-8 bg-slate-300 mx-1"></div>

        {/* Heading button */}
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-3 py-2 text-sm rounded-lg font-extrabold transition-all duration-200 ${
            editor.isActive('heading', { level: 2 })
              ? 'bg-blue-600 text-white shadow-md'
              : 'hover:bg-sky-200 text-blue-700'
          }`}
          title="Heading"
        >
          <span>H1</span>
        </button>

  <div className="w-px h-8 bg-slate-300 mx-1"></div>

        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 flex items-center gap-2 font-bold ${
            editor.isActive("bulletList") 
              ? "bg-blue-600 text-white shadow-md" 
              : "hover:bg-sky-200 text-blue-700"
          }`}
          title="Bulleted list"
        >
          {/* Bulleted list icon: three dots with lines */}
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="6" cy="6" r="1.2" />
            <path d="M10 6h8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="12" r="1.2" />
            <path d="M10 12h8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="18" r="1.2" />
            <path d="M10 18h8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 flex items-center gap-2 font-bold ${
            editor.isActive("orderedList") 
              ? "bg-blue-600 text-white shadow-md" 
              : "hover:bg-sky-200 text-blue-700"
          }`}
          title="Numbered list"
        >
          {/* Numbered list icon: numbers with lines */}
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <text x="3" y="6.8" fontSize="5" fill="currentColor">1</text>
            <path d="M10 6h8" strokeLinecap="round" strokeLinejoin="round" />
            <text x="3" y="12.8" fontSize="5" fill="currentColor">2</text>
            <path d="M10 12h8" strokeLinecap="round" strokeLinejoin="round" />
            <text x="3" y="18.8" fontSize="5" fill="currentColor">3</text>
            <path d="M10 18h8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex-1"></div>

        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="px-3 py-2 text-sm rounded-lg hover:bg-sky-200 text-blue-700 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Undo"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>

        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="px-3 py-2 text-sm rounded-lg hover:bg-sky-200 text-blue-700 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Redo"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </button>

        {/* Mic button (aligned to right end, reusing Tasks icons) */}
        <div className="ml-1 flex items-center gap-1">
          {speechSupported ? (
            <button
              onClick={() => (listening ? stopListening() : startListening())}
              aria-pressed={listening}
              title={punctuating ? "Adding punctuation" : (listening ? "Stop voice input" : "Start voice input")}
              className="relative flex items-center justify-center w-11 h-11 rounded-xl transition-shadow focus:outline-none"
            >
              <span className={`${listening ? "absolute inset-0 animate-ping rounded-xl bg-blue-200/40" : ""}`} />
              <span className={`relative z-10 inline-flex items-center justify-center rounded-lg ${listening ? "bg-red-500 text-white shadow-lg" : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"} w-11 h-11`}>
                {punctuating ? (
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
                    <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
                  </svg>
                ) : !listening ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 1v6a3 3 0 01-6 0V1M12 1v6a3 3 0 006 0V1" opacity="0" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14v4M8 18h8M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
                  </svg>
                )}
              </span>
            </button>
          ) : (
            <div className="text-xs text-blue-400 px-2">Voice not supported</div>
          )}

          {/* Summarize button */}
          <button
            onClick={summarizePage}
            title={summarizing ? "Summarizing..." : "Summarize page"}
            disabled={summarizing}
            className={`relative inline-flex items-center justify-center w-11 h-11 rounded-lg shadow-sm transition-colors ${summarizing ? 'bg-indigo-300 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'} text-white disabled:opacity-70 disabled:cursor-wait`}
          >
            {summarizing ? (
              // Spinner
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
              </svg>
            ) : (
              // Sparkle icon
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="p-6 min-h-[400px] prose prose-slate max-w-none">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
