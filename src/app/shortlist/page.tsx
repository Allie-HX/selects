"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { loadState } from "@/lib/storage";
import { isFileSystemAccessSupported, pickDirectory } from "@/lib/fs";
import type { AppState, ShortlistEntry } from "@/lib/types";
import { VIDEO_EXTENSIONS } from "@/lib/types";
import BrowserWarning from "@/components/BrowserWarning";
import AmbientGlow from "@/components/AmbientGlow";

interface TranscribeProgress {
  current: number;
  total: number;
  currentClip: string;
  status: "idle" | "running" | "done" | "error";
  errorMessage?: string;
  completed: Set<string>;
  failed: Set<string>;
}

async function findVideoFile(
  categoryDir: FileSystemDirectoryHandle,
  clipName: string
): Promise<File | null> {
  const extensions = [...VIDEO_EXTENSIONS, ...VIDEO_EXTENSIONS.map((e) => e.toUpperCase())];
  for (const ext of extensions) {
    try {
      const handle = await categoryDir.getFileHandle(`${clipName}.${ext}`);
      return handle.getFile();
    } catch {
      // try next
    }
  }
  return null;
}

async function transcribeFile(file: File): Promise<{ text: string; srt: string; wordSrt: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Transcription failed");
  }

  return res.json();
}

async function readTextFile(
  dir: FileSystemDirectoryHandle,
  name: string
): Promise<string | null> {
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    return file.text();
  } catch {
    return null;
  }
}

async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  content: string
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeBinaryFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: ArrayBuffer
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function renderSocialClip(
  videoFile: File,
  srtContent: string | null
): Promise<ArrayBuffer> {
  const formData = new FormData();
  formData.append("video", videoFile);
  if (srtContent) formData.append("srt", srtContent);

  const res = await fetch("/api/render", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Render failed");
  }

  return res.arrayBuffer();
}

export default function ShortlistPage() {
  const [supported, setSupported] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [previewEntry, setPreviewEntry] = useState<ShortlistEntry | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [shortlistDir, setShortlistDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [transcribeProgress, setTranscribeProgress] = useState<TranscribeProgress>({
    current: 0,
    total: 0,
    currentClip: "",
    status: "idle",
    completed: new Set(),
    failed: new Set(),
  });
  const [renderProgress, setRenderProgress] = useState<TranscribeProgress>({
    current: 0,
    total: 0,
    currentClip: "",
    status: "idle",
    completed: new Set(),
    failed: new Set(),
  });
  const abortRef = useRef(false);
  const abortRenderRef = useRef(false);

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

  const handleTranscribeAll = async () => {
    if (!shortlistDir || !appState) return;

    abortRef.current = false;
    const entries = appState.shortlist;
    const completed = new Set<string>();
    const failed = new Set<string>();

    setTranscribeProgress({
      current: 0,
      total: entries.length,
      currentClip: "",
      status: "running",
      completed,
      failed,
    });

    for (let i = 0; i < entries.length; i++) {
      if (abortRef.current) break;

      const entry = entries[i];
      setTranscribeProgress((prev) => ({
        ...prev,
        current: i + 1,
        currentClip: entry.clipName,
      }));

      try {
        const categoryDir = await shortlistDir.getDirectoryHandle(entry.category);
        const videoFile = await findVideoFile(categoryDir, entry.clipName);

        if (!videoFile) {
          failed.add(entry.id);
          setTranscribeProgress((prev) => ({ ...prev, failed: new Set(failed) }));
          continue;
        }

        const { text, srt, wordSrt } = await transcribeFile(videoFile);

        await writeTextFile(categoryDir, `${entry.clipName}.txt`, text);
        await writeTextFile(categoryDir, `${entry.clipName}.srt`, srt);
        await writeTextFile(categoryDir, `${entry.clipName}.words.srt`, wordSrt);

        completed.add(entry.id);
        setTranscribeProgress((prev) => ({ ...prev, completed: new Set(completed) }));
      } catch (err) {
        failed.add(entry.id);
        setTranscribeProgress((prev) => ({
          ...prev,
          failed: new Set(failed),
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    }

    setTranscribeProgress((prev) => ({
      ...prev,
      status: abortRef.current ? "idle" : "done",
      currentClip: "",
    }));
  };

  const handleCancelTranscribe = () => {
    abortRef.current = true;
  };

  const handleGenerateSocial = async () => {
    if (!shortlistDir || !appState) return;

    abortRenderRef.current = false;
    const entries = appState.shortlist;
    const completed = new Set<string>();
    const failed = new Set<string>();

    setRenderProgress({
      current: 0,
      total: entries.length,
      currentClip: "",
      status: "running",
      completed,
      failed,
    });

    for (let i = 0; i < entries.length; i++) {
      if (abortRenderRef.current) break;

      const entry = entries[i];
      setRenderProgress((prev) => ({
        ...prev,
        current: i + 1,
        currentClip: entry.clipName,
      }));

      try {
        const categoryDir = await shortlistDir.getDirectoryHandle(entry.category);
        const videoFile = await findVideoFile(categoryDir, entry.clipName);

        if (!videoFile) {
          failed.add(entry.id);
          setRenderProgress((prev) => ({ ...prev, failed: new Set(failed) }));
          continue;
        }

        const wordSrt = await readTextFile(categoryDir, `${entry.clipName}.words.srt`);
        const srtContent = wordSrt ?? await readTextFile(categoryDir, `${entry.clipName}.srt`);
        const rendered = await renderSocialClip(videoFile, srtContent);

        await writeBinaryFile(categoryDir, `${entry.clipName}-social.mp4`, rendered);

        completed.add(entry.id);
        setRenderProgress((prev) => ({ ...prev, completed: new Set(completed) }));
      } catch (err) {
        failed.add(entry.id);
        setRenderProgress((prev) => ({
          ...prev,
          failed: new Set(failed),
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    }

    setRenderProgress((prev) => ({
      ...prev,
      status: abortRenderRef.current ? "idle" : "done",
      currentClip: "",
    }));
  };

  const handleCancelRender = () => {
    abortRenderRef.current = true;
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
              <>
                <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "var(--surface)", color: "var(--green)" }}>
                  Folder connected: {shortlistDir.name}
                </span>
                {transcribeProgress.status === "running" ? (
                  <button
                    onClick={handleCancelTranscribe}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    style={{ background: "var(--red)", color: "#fff" }}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={handleTranscribeAll}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                    style={{ background: "var(--surface)", color: "var(--text-primary)", border: "0.5px solid var(--border)" }}
                    disabled={appState?.shortlist.length === 0}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                    </svg>
                    Transcribe All
                  </button>
                )}
                {renderProgress.status === "running" ? (
                  <button
                    onClick={handleCancelRender}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    style={{ background: "var(--red)", color: "#fff" }}
                  >
                    Cancel Render
                  </button>
                ) : (
                  <button
                    onClick={handleGenerateSocial}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                    style={{ background: "var(--accent)", color: "#fff" }}
                    disabled={appState?.shortlist.length === 0 || transcribeProgress.status === "running"}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                    Generate Social
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Transcription progress */}
      {transcribeProgress.status !== "idle" && (
        <div className="relative z-20 px-4 py-3" style={{ background: "var(--surface)", borderBottom: "0.5px solid var(--border)" }}>
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                {transcribeProgress.status === "running" && (
                  <>Transcribing {transcribeProgress.current} of {transcribeProgress.total}: {transcribeProgress.currentClip}</>
                )}
                {transcribeProgress.status === "done" && (
                  <>Transcription complete &mdash; {transcribeProgress.completed.size} succeeded{transcribeProgress.failed.size > 0 && `, ${transcribeProgress.failed.size} failed`}</>
                )}
              </p>
              {transcribeProgress.status === "done" && (
                <button
                  onClick={() => setTranscribeProgress((prev) => ({ ...prev, status: "idle" }))}
                  className="text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Dismiss
                </button>
              )}
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${transcribeProgress.total > 0 ? (transcribeProgress.current / transcribeProgress.total) * 100 : 0}%`,
                  background: transcribeProgress.status === "done" ? "var(--green)" : "var(--accent)",
                }}
              />
            </div>
            {transcribeProgress.errorMessage && (
              <p className="text-xs mt-1" style={{ color: "var(--red)" }}>
                Last error: {transcribeProgress.errorMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Render progress */}
      {renderProgress.status !== "idle" && (
        <div className="relative z-20 px-4 py-3" style={{ background: "var(--surface)", borderBottom: "0.5px solid var(--border)" }}>
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                {renderProgress.status === "running" && (
                  <>Rendering {renderProgress.current} of {renderProgress.total}: {renderProgress.currentClip} (this may take a few minutes per clip)</>
                )}
                {renderProgress.status === "done" && (
                  <>Render complete &mdash; {renderProgress.completed.size} succeeded{renderProgress.failed.size > 0 && `, ${renderProgress.failed.size} failed`}</>
                )}
              </p>
              {renderProgress.status === "done" && (
                <button
                  onClick={() => setRenderProgress((prev) => ({ ...prev, status: "idle" }))}
                  className="text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Dismiss
                </button>
              )}
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${renderProgress.total > 0 ? (renderProgress.current / renderProgress.total) * 100 : 0}%`,
                  background: renderProgress.status === "done" ? "var(--green)" : "var(--amber)",
                }}
              />
            </div>
            {renderProgress.errorMessage && (
              <p className="text-xs mt-1" style={{ color: "var(--red)" }}>
                Last error: {renderProgress.errorMessage}
              </p>
            )}
          </div>
        </div>
      )}

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
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {transcribeProgress.completed.has(entry.id) && (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--green)" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                            )}
                            {transcribeProgress.failed.has(entry.id) && (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--red)" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                            )}
                            {transcribeProgress.status === "running" && transcribeProgress.currentClip === entry.clipName && !transcribeProgress.completed.has(entry.id) && !transcribeProgress.failed.has(entry.id) && (
                              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                            )}
                            {renderProgress.completed.has(entry.id) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--green)", color: "#fff" }}>9:16</span>
                            )}
                            {renderProgress.failed.has(entry.id) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--red)", color: "#fff" }}>9:16</span>
                            )}
                            {renderProgress.status === "running" && renderProgress.currentClip === entry.clipName && !renderProgress.completed.has(entry.id) && !renderProgress.failed.has(entry.id) && (
                              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "var(--amber)", borderTopColor: "transparent" }} />
                            )}
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                            </svg>
                          </div>
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
