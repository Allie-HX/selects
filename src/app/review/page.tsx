"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { isFileSystemAccessSupported, pickDirectory, buildSourceFolder, copyFileToShortlist } from "@/lib/fs";
import { loadState, saveState, addToShortlist, markReviewed, markSkipped, addCategory, getShortlistNameConflict, getActiveProject, setActiveProject, listProjects, createProject } from "@/lib/storage";
import type { VideoFile, SourceFolder, ShortlistEntry, AppState } from "@/lib/types";
import BrowserWarning from "@/components/BrowserWarning";
import ProjectSelector from "@/components/ProjectSelector";

export default function ReviewPage() {
  const [supported, setSupported] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Source folders
  const [sourceFolders, setSourceFolders] = useState<SourceFolder[]>([]);
  const [allVideos, setAllVideos] = useState<VideoFile[][]>([]);
  const [activeTab, setActiveTab] = useState<number>(-1); // -1 = All

  // Current video
  const [currentIndex, setCurrentIndex] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [useExternalAudio, setUseExternalAudio] = useState(false);

  // Shortlist folder
  const [shortlistDir, setShortlistDir] = useState<FileSystemDirectoryHandle | null>(null);

  // Form
  const [clipName, setClipName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);

  // State
  const [appState, setAppState] = useState<AppState>(loadState);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clipNameRef = useRef<HTMLInputElement>(null);

  // Computed: flattened video list based on active tab
  const currentVideoList = activeTab === -1
    ? allVideos.flat()
    : (allVideos[activeTab] ?? []);

  // Get only unreviewed videos
  const unreviewedVideos = currentVideoList.filter(
    (v) => !appState.reviewedFiles.includes(`${v.sourceFolderName}/${v.name}`) &&
           !appState.skippedFiles.includes(`${v.sourceFolderName}/${v.name}`)
  );

  const currentVideo = unreviewedVideos[currentIndex] ?? null;

  // Count unreviewed per folder
  const getUnreviewedCount = useCallback(
    (folderIdx: number) => {
      const vids = folderIdx === -1 ? allVideos.flat() : (allVideos[folderIdx] ?? []);
      return vids.filter(
        (v) =>
          !appState.reviewedFiles.includes(`${v.sourceFolderName}/${v.name}`) &&
          !appState.skippedFiles.includes(`${v.sourceFolderName}/${v.name}`)
      ).length;
    },
    [allVideos, appState.reviewedFiles, appState.skippedFiles]
  );

  // Category counts
  const categoryCounts = appState.shortlist.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1;
    return acc;
  }, {});

  // Load video URL when current video changes
  useEffect(() => {
    let cancelled = false;
    if (!currentVideo) {
      setVideoUrl(null);
      setAudioUrl(null);
      return;
    }

    (async () => {
      try {
        const file = await currentVideo.fileHandle.getFile();
        const url = URL.createObjectURL(file);
        if (!cancelled) setVideoUrl(url);

        if (currentVideo.associatedAudio) {
          const audioFile = await currentVideo.associatedAudio.getFile();
          const aUrl = URL.createObjectURL(audioFile);
          if (!cancelled) setAudioUrl(aUrl);
        } else {
          if (!cancelled) setAudioUrl(null);
        }
      } catch {
        if (!cancelled) {
          setVideoUrl(null);
          setAudioUrl(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentVideo]);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [videoUrl, audioUrl]);

  // Sync external audio playback with video
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || !useExternalAudio || !audioUrl) return;

    video.muted = true;

    const syncPlay = () => {
      audio.currentTime = video.currentTime;
      audio.play().catch(() => {});
    };
    const syncPause = () => audio.pause();
    const syncSeek = () => {
      audio.currentTime = video.currentTime;
    };

    video.addEventListener("play", syncPlay);
    video.addEventListener("pause", syncPause);
    video.addEventListener("seeked", syncSeek);

    return () => {
      video.removeEventListener("play", syncPlay);
      video.removeEventListener("pause", syncPause);
      video.removeEventListener("seeked", syncSeek);
      video.muted = false;
    };
  }, [useExternalAudio, audioUrl]);

  // When switching audio mode, unmute video if not using external
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = useExternalAudio && !!audioUrl;
    }
    if (!useExternalAudio && audioRef.current) {
      audioRef.current.pause();
    }
  }, [useExternalAudio, audioUrl]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" && e.key !== "Enter") return;

      if (e.key === "Enter") {
        e.preventDefault();
        handleAddToShortlist();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleSkip();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevious();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  useEffect(() => {
    setMounted(true);
    setSupported(isFileSystemAccessSupported());
  }, []);

  // Check for duplicate names
  useEffect(() => {
    if (!clipName || !selectedCategory) {
      setDuplicateWarning(null);
      return;
    }
    const resolved = getShortlistNameConflict(clipName, selectedCategory, appState.shortlist);
    if (resolved !== clipName) {
      setDuplicateWarning(`"${clipName}" already exists. Will save as "${resolved}"`);
    } else {
      setDuplicateWarning(null);
    }
  }, [clipName, selectedCategory, appState.shortlist]);

  const handleAddFolder = async () => {
    const handle = await pickDirectory();
    if (!handle) return;

    const folderIndex = sourceFolders.length;
    const { folder, videos } = await buildSourceFolder(handle, folderIndex);

    setSourceFolders((prev) => [...prev, folder]);
    setAllVideos((prev) => [...prev, videos]);

    if (sourceFolders.length === 0) {
      setActiveTab(-1);
    }

    // Ask for shortlist folder if not set
    if (!shortlistDir) {
      setStatusMessage("Now select where to save your shortlist...");
      const slDir = await pickDirectory();
      if (slDir) {
        setShortlistDir(slDir);
        setStatusMessage(null);
      } else {
        setStatusMessage("No shortlist folder selected. You can still review but cannot save.");
      }
    }
  };

  const handleAddToShortlist = async () => {
    if (!currentVideo || !clipName.trim() || !selectedCategory || !shortlistDir || copying) return;

    setCopying(true);
    setStatusMessage("Copying files...");

    try {
      const resolvedName = getShortlistNameConflict(clipName.trim(), selectedCategory, appState.shortlist);

      await copyFileToShortlist(shortlistDir, selectedCategory, resolvedName, currentVideo);

      const entry: ShortlistEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        clipName: resolvedName,
        category: selectedCategory,
        originalFilename: currentVideo.name,
        sourceFolderName: currentVideo.sourceFolderName,
        timestamp: Date.now(),
        hasAudio: !!currentVideo.associatedAudio,
        audioFilename: currentVideo.associatedAudio ? `${resolvedName}.${currentVideo.audioExtension}` : null,
      };

      const newState = addToShortlist(entry);
      const fileKey = `${currentVideo.sourceFolderName}/${currentVideo.name}`;
      const finalState = markReviewed(fileKey);
      setAppState(finalState);

      setClipName("");
      setDuplicateWarning(null);
      setUseExternalAudio(false);
      setStatusMessage(`Added "${resolvedName}" to ${selectedCategory}`);
      setTimeout(() => setStatusMessage(null), 2000);

      // Move to next (index stays same since current was removed from unreviewed)
      if (currentIndex >= unreviewedVideos.length - 1) {
        setCurrentIndex(Math.max(0, unreviewedVideos.length - 2));
      }

      clipNameRef.current?.focus();
    } catch (err) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : "Failed to copy"}`);
    } finally {
      setCopying(false);
    }
  };

  const handleSkip = () => {
    if (!currentVideo) return;
    const fileKey = `${currentVideo.sourceFolderName}/${currentVideo.name}`;
    const newState = markSkipped(fileKey);
    setAppState(newState);
    setClipName("");
    setDuplicateWarning(null);
    setUseExternalAudio(false);

    if (currentIndex >= unreviewedVideos.length - 1) {
      setCurrentIndex(Math.max(0, unreviewedVideos.length - 2));
    }
  };

  const handlePrevious = () => {
    // Go back to previous in unreviewed list
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setClipName("");
      setDuplicateWarning(null);
      setUseExternalAudio(false);
    }
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    const newState = addCategory(newCategoryName.trim());
    setAppState(newState);
    setSelectedCategory(newCategoryName.trim());
    setNewCategoryName("");
    setShowAddCategory(false);
  };

  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!supported) return <BrowserWarning />;

  const totalClips = allVideos.flat().length;
  const reviewedCount = appState.reviewedFiles.length;
  const shortlistedCount = appState.shortlist.length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="glass border-b border-b-glass-border sticky top-0 z-30" style={{ borderRadius: 0 }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
            </Link>
            <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Selects
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <ProjectSelector onProjectChange={() => setAppState(loadState())} />
            <button
              onClick={handleAddFolder}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Folder
            </button>
          </div>
        </div>

        {/* Folder tabs */}
        {sourceFolders.length > 0 && (
          <div className="flex items-center gap-1 px-4 pb-2 overflow-x-auto">
            <button
              onClick={() => { setActiveTab(-1); setCurrentIndex(0); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === -1 ? "text-white" : ""
              }`}
              style={{
                background: activeTab === -1 ? "var(--accent)" : "var(--surface)",
                color: activeTab === -1 ? "#fff" : "var(--text-secondary)",
              }}
            >
              All
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{
                  background: activeTab === -1 ? "rgba(255,255,255,0.2)" : "var(--surface-hover)",
                }}
              >
                {getUnreviewedCount(-1)}
              </span>
            </button>
            {sourceFolders.map((f, i) => (
              <button
                key={i}
                onClick={() => { setActiveTab(i); setCurrentIndex(0); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: activeTab === i ? "var(--accent)" : "var(--surface)",
                  color: activeTab === i ? "#fff" : "var(--text-secondary)",
                }}
              >
                {f.name}
                <span
                  className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{
                    background: activeTab === i ? "rgba(255,255,255,0.2)" : "var(--surface-hover)",
                  }}
                >
                  {getUnreviewedCount(i)}
                </span>
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Video area */}
        <div className="flex-1 lg:w-2/3 p-4">
          {sourceFolders.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center h-full min-h-[400px]">
              <div className="glass p-8 text-center max-w-md">
                <svg
                  className="w-12 h-12 mx-auto mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1}
                  style={{ color: "var(--text-tertiary)" }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125"
                  />
                </svg>
                <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                  No folders added
                </h2>
                <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                  Click &quot;Add Folder&quot; to select a directory containing video files.
                </p>
                <button
                  onClick={handleAddFolder}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  Add Folder
                </button>
              </div>
            </div>
          ) : unreviewedVideos.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center h-full min-h-[400px]">
              <div className="glass p-8 text-center max-w-md">
                <svg
                  className="w-12 h-12 mx-auto mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  style={{ color: "var(--green)" }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                  All done!
                </h2>
                <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                  You&apos;ve reviewed all clips in this view. Add another folder or check your shortlist.
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={handleAddFolder}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    style={{ background: "var(--surface)", color: "var(--text-primary)", border: "0.5px solid var(--border)" }}
                  >
                    Add Folder
                  </button>
                  <Link
                    href="/shortlist"
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    View Shortlist
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Video player */}
              <div className="glass overflow-hidden" style={{ borderRadius: "16px" }}>
                {videoUrl ? (
                  <video
                    ref={videoRef}
                    key={videoUrl}
                    src={videoUrl}
                    controls
                    className="w-full aspect-video bg-black"
                    autoPlay
                  />
                ) : (
                  <div className="w-full aspect-video bg-black flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* Filename + audio toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {currentVideo?.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {currentVideo?.sourceFolderName} &middot; {currentIndex + 1} of {unreviewedVideos.length} remaining
                  </p>
                </div>

                {currentVideo?.associatedAudio && audioUrl && (
                  <button
                    onClick={() => setUseExternalAudio(!useExternalAudio)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: useExternalAudio ? "var(--accent)" : "var(--surface)",
                      color: useExternalAudio ? "#fff" : "var(--text-secondary)",
                      border: "0.5px solid var(--border)",
                    }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                    </svg>
                    {useExternalAudio ? "External Audio" : "Camera Audio"}
                  </button>
                )}
              </div>

              {/* Hidden audio element for external audio */}
              {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}
            </div>
          )}
        </div>

        {/* Sidebar */}
        {sourceFolders.length > 0 && (
          <div className="lg:w-1/3 border-t lg:border-t-0 lg:border-l p-4 flex flex-col gap-4" style={{ borderColor: "var(--border)" }}>
            {/* Clip name */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Clip Name
              </label>
              <input
                ref={clipNameRef}
                type="text"
                value={clipName}
                onChange={(e) => setClipName(e.target.value)}
                placeholder="Enter a descriptive name..."
                className="glass-input w-full px-4 py-2.5 text-sm"
                disabled={!currentVideo}
              />
            </div>

            {/* Categories */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {appState.categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat === selectedCategory ? "" : cat)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={{
                      background: cat === selectedCategory ? "var(--accent)" : "var(--surface)",
                      color: cat === selectedCategory ? "#fff" : "var(--text-secondary)",
                      border: cat === selectedCategory ? "0.5px solid var(--accent)" : "0.5px solid var(--border)",
                    }}
                  >
                    {cat}
                    {categoryCounts[cat] ? (
                      <span className="ml-1 opacity-60">({categoryCounts[cat]})</span>
                    ) : null}
                  </button>
                ))}
                <button
                  onClick={() => setShowAddCategory(!showAddCategory)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: "var(--surface)",
                    color: "var(--text-tertiary)",
                    border: "0.5px dashed var(--border)",
                  }}
                >
                  + Add
                </button>
              </div>

              {showAddCategory && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        handleAddCategory();
                      }
                    }}
                    placeholder="Category name"
                    className="glass-input flex-1 px-3 py-1.5 text-xs"
                    autoFocus
                  />
                  <button
                    onClick={handleAddCategory}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

            {/* Duplicate warning */}
            {duplicateWarning && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                style={{
                  background: "rgba(255, 214, 10, 0.1)",
                  border: "0.5px solid rgba(255, 214, 10, 0.3)",
                  color: "var(--amber)",
                }}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                {duplicateWarning}
              </div>
            )}

            {/* Add button */}
            <button
              onClick={handleAddToShortlist}
              disabled={!currentVideo || !clipName.trim() || !selectedCategory || copying}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {copying ? "Copying..." : "Add to Shortlist"}
            </button>

            {/* Skip button */}
            <button
              onClick={handleSkip}
              disabled={!currentVideo}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-30"
              style={{
                background: "var(--surface)",
                color: "var(--text-secondary)",
                border: "0.5px solid var(--border)",
              }}
            >
              Skip
            </button>

            {/* Status message */}
            {statusMessage && (
              <div
                className="px-3 py-2 rounded-xl text-xs text-center"
                style={{
                  background: statusMessage.startsWith("Error") ? "rgba(255,69,58,0.1)" : "rgba(48,209,88,0.1)",
                  color: statusMessage.startsWith("Error") ? "var(--red)" : "var(--green)",
                  border: `0.5px solid ${statusMessage.startsWith("Error") ? "rgba(255,69,58,0.3)" : "rgba(48,209,88,0.3)"}`,
                }}
              >
                {statusMessage}
              </div>
            )}

            {/* Keyboard shortcuts */}
            <div className="mt-auto pt-4" style={{ borderTop: "0.5px solid var(--border)" }}>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>
                Keyboard Shortcuts
              </p>
              <div className="grid grid-cols-2 gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                <div className="flex items-center gap-2">
                  <kbd
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                    style={{ background: "var(--surface)", border: "0.5px solid var(--border)" }}
                  >
                    Enter
                  </kbd>
                  Add to shortlist
                </div>
                <div className="flex items-center gap-2">
                  <kbd
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                    style={{ background: "var(--surface)", border: "0.5px solid var(--border)" }}
                  >
                    &rarr;
                  </kbd>
                  Skip
                </div>
                <div className="flex items-center gap-2">
                  <kbd
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                    style={{ background: "var(--surface)", border: "0.5px solid var(--border)" }}
                  >
                    &larr;
                  </kbd>
                  Previous
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      {sourceFolders.length > 0 && (
        <footer
          className="glass sticky bottom-0 z-30 px-4 py-3 flex items-center justify-between text-xs"
          style={{ borderRadius: 0, borderTop: "0.5px solid var(--border)" }}
        >
          <div className="flex items-center gap-4">
            <span style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{totalClips}</strong> total clips
            </span>
            <span style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{reviewedCount}</strong> reviewed
            </span>
            <span style={{ color: "var(--green)" }}>
              <strong>{shortlistedCount}</strong> shortlisted
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(categoryCounts).map(([cat, count]) => (
              <span
                key={cat}
                className="px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--surface)",
                  border: "0.5px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                {cat}: <strong style={{ color: "var(--text-primary)" }}>{count}</strong>
              </span>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
