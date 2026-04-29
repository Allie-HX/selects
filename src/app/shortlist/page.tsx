"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { loadState } from "@/lib/storage";
import { isFileSystemAccessSupported, pickDirectory } from "@/lib/fs";
import type { AppState, ShortlistEntry } from "@/lib/types";
import BrowserWarning from "@/components/BrowserWarning";
import AmbientGlow from "@/components/AmbientGlow";

export default function ShortlistPage() {
  const [supported, setSupported] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [previewEntry, setPreviewEntry] = useState<ShortlistEntry | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [shortlistDir, setShortlistDir] = useState<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    setMounted(true);
    setSupported(isFileSystemAccessSupported());
    const state = loadState();
    setAppState(state);
    // Expand all categories by default
    const cats = new Set(state.shortlist.map((e) => e.category));
    setExpandedCategories(cats);
  }, []);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const handlePickShortlistDir = async () => {
    const dir = await pickDirectory();
    if (dir) setShortlistDir(dir);
  };

  const handlePreview = async (entry: ShortlistEntry) => {
    if (!shortlistDir) {
      await handlePickShortlistDir();
      return;
    }

    setPreviewEntry(entry);
    try {
      const categoryDir = await shortlistDir.getDirectoryHandle(entry.category);
      // Find the video file — we stored it with clipName + original extension
      // Try common extensions
      const extensions = ["mov", "mp4", "m4v", "MOV", "MP4", "M4V"];
      let fileHandle: FileSystemFileHandle | null = null;

      for (const ext of extensions) {
        try {
          fileHandle = await categoryDir.getFileHandle(`${entry.clipName}.${ext}`);
          break;
        } catch {
          // Try next extension
        }
      }

      if (fileHandle) {
        const file = await fileHandle.getFile();
        const url = URL.createObjectURL(file);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }
    } catch {
      setPreviewUrl(null);
    }
  };

  const closePreview = () => {
    setPreviewEntry(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!supported) return <BrowserWarning />;

  if (!appState) return null;

  // Group by category
  const groupedByCategory = appState.shortlist.reduce<Record<string, ShortlistEntry[]>>(
    (acc, entry) => {
      if (!acc[entry.category]) acc[entry.category] = [];
      acc[entry.category].push(entry);
      return acc;
    },
    {}
  );

  const categoryNames = Object.keys(groupedByCategory).sort();

  return (
    <div className="min-h-screen flex flex-col relative">
      <AmbientGlow />

      {/* Header */}
      <header className="glass sticky top-0 z-30" style={{ borderRadius: 0, borderBottom: "0.5px solid var(--border)" }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
            </Link>
            <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Shortlist
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--surface)", color: "var(--text-secondary)" }}>
              {appState.shortlist.length} clips
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!shortlistDir && (
              <button
                onClick={handlePickShortlistDir}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Open Shortlist Folder
              </button>
            )}
            {shortlistDir && (
              <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "var(--surface)", color: "var(--green)" }}>
                Folder connected: {shortlistDir.name}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 relative z-10 p-4 max-w-4xl mx-auto w-full">
        {appState.shortlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="glass p-8 text-center max-w-md">
              <svg
                className="w-12 h-12 mx-auto mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
                style={{ color: "var(--text-tertiary)" }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
              </svg>
              <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                No clips shortlisted yet
              </h2>
              <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                Start reviewing videos to build your shortlist.
              </p>
              <Link
                href="/review"
                className="inline-block px-5 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Start Reviewing
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {categoryNames.map((cat) => {
              const entries = groupedByCategory[cat];
              const isExpanded = expandedCategories.has(cat);

              return (
                <div key={cat} className="glass overflow-hidden">
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-hover"
                  >
                    <div className="flex items-center gap-3">
                      <svg
                        className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                      <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {cat}
                      </h2>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: "var(--accent)", color: "#fff" }}
                      >
                        {entries.length}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={{ borderTop: "0.5px solid var(--border)" }}>
                      {entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between px-4 py-3 transition-colors cursor-pointer"
                          style={{ borderBottom: "0.5px solid var(--border)" }}
                          onClick={() => handlePreview(entry)}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background = "transparent";
                          }}
                        >
                          <div>
                            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                              {entry.clipName}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                              {entry.sourceFolderName} &middot; {entry.originalFilename}
                              {entry.hasAudio && (
                                <span style={{ color: "var(--accent)" }}> &middot; + audio</span>
                              )}
                            </p>
                          </div>
                          <svg
                            className="w-5 h-5 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                          </svg>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)" }}
          onClick={closePreview}
        >
          <div
            className="glass max-w-3xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "0.5px solid var(--border)" }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {previewEntry.clipName}
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {previewEntry.category} &middot; {previewEntry.originalFilename}
                </p>
              </div>
              <button
                onClick={closePreview}
                className="p-1 rounded-lg transition-colors"
                style={{ color: "var(--text-secondary)" }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {previewUrl ? (
              <video src={previewUrl} controls autoPlay className="w-full aspect-video bg-black" />
            ) : (
              <div className="w-full aspect-video bg-black flex items-center justify-center">
                <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  {shortlistDir
                    ? "Could not load video file"
                    : "Open your shortlist folder to preview clips"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
