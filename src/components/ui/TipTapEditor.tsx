"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";

import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";

interface TipTapEditorProps {
  content: string;
  onChange: (newContent: string) => void;
}

export default function TipTapEditor({ content, onChange }: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false
      }),
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

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return <p>Loading editor...</p>;

  return (
    <div
      className="border-2 border-[#D4C4B0] rounded-xl bg-white shadow-md hover:shadow-lg transition-shadow focus-within:border-[#4E692D] focus-within:ring-4 focus-within:ring-[#4E692D]/20"
      onClick={() => editor?.commands.focus()}
    >
      {/* Toolbar */}
      <div className="border-b-2 border-[#D4C4B0] p-3 flex gap-1 flex-wrap bg-[#E8D4BE] rounded-t-xl">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
            editor.isActive("bold") 
              ? "bg-[#4E692D] text-white shadow-md font-extrabold" 
              : "hover:bg-[#D4C4B0] text-[#4E692D] font-extrabold"
          }`}
          title="Bold"
        >
          <span>B</span>
        </button>

        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-3 py-2 text-sm rounded-lg italic transition-all duration-200 ${
            editor.isActive("italic") 
              ? "bg-[#4E692D] text-white shadow-md font-bold" 
              : "hover:bg-[#D4C4B0] text-[#4E692D] font-bold"
          }`}
          title="Italic"
        >
          <span>I</span>
        </button>

        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`px-3 py-2 text-sm rounded-lg underline transition-all duration-200 ${
            editor.isActive("underline") 
              ? "bg-[#4E692D] text-white shadow-md font-bold" 
              : "hover:bg-[#D4C4B0] text-[#4E692D] font-bold"
          }`}
          title="Underline"
        >
          <span>U</span>
        </button>

        <div className="w-px h-8 bg-[#8B7355] mx-1"></div>

        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-3 py-2 text-sm rounded-lg font-extrabold transition-all duration-200 flex items-center gap-1 ${
            editor.isActive("heading", { level: 2 }) 
              ? "bg-[#4E692D] text-white shadow-md" 
              : "hover:bg-[#D4C4B0] text-[#4E692D]"
          }`}
          title="Heading"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          H2
        </button>

        <div className="w-px h-8 bg-[#8B7355] mx-1"></div>

        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 flex items-center gap-1 font-bold ${
            editor.isActive("bulletList") 
              ? "bg-[#4E692D] text-white shadow-md" 
              : "hover:bg-[#D4C4B0] text-[#4E692D]"
          }`}
          title="Bullet List"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          List
        </button>

        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 flex items-center gap-1 font-bold ${
            editor.isActive("orderedList") 
              ? "bg-[#4E692D] text-white shadow-md" 
              : "hover:bg-[#D4C4B0] text-[#4E692D]"
          }`}
          title="Numbered List"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
          1-2-3
        </button>

        <div className="flex-1"></div>

        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="px-3 py-2 text-sm rounded-lg hover:bg-[#D4C4B0] text-[#4E692D] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Undo"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>

        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="px-3 py-2 text-sm rounded-lg hover:bg-[#D4C4B0] text-[#4E692D] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Redo"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </button>
      </div>

      {/* Editor */}
      <div className="p-6 min-h-[400px] prose prose-slate max-w-none">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
