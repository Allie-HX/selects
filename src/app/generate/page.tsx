"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { loadState } from "@/lib/storage";
import { isFileSystemAccessSupported, pickDirectory } from "@/lib/fs";
import { VIDEO_EXTENSIONS } from "@/lib/types";
import type { AppState, ShortlistEntry } from "@/lib/types";
import {
  uploadFileToR2,
  getDownloadUrl,
  submitTranscribeJob,
  submitRenderJob,
  getSocket,
} from "@/lib/backend";
import BrowserWarning from "@/components/BrowserWarning";
import AmbientGlow from "@/components/AmbientGlow";

type ClipStatus = "pending" | "uploading" | "transcribing" | "rendering" | "done" | "failed";

interface ClipJob {
  entry: ShortlistEntry;
  status: ClipStatus;
  sourceKey: string | null;
  jobId: string | null;
  error: string | null;
  downloadUrl: string | null;
}

function getUserId(): string {
  let id = localStorage.getItem("selects-user-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("selects-user-id", id);
  }
  return id;
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

export default function GeneratePage() {
  const [supported, setSupported] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [shortlistDir, setShortlistDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [clips, setClips] = useState<ClipJob[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    setSupported(isFileSystemAccessSupported());
    const state = loadState();
    setAppState(state);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const userId = getUserId();
    const socket = getSocket(userId);

    socket.on("job:progress", (data: { jobId: string; status: string; clipName: string; error?: string }) => {
      setClips((prev) =>
        prev.map((c) => {
          if (c.jobId !== data.jobId) return c;
          if (data.status === "completed") {
            if (c.status === "transcribing") return { ...c, status: "transcribing", jobId: null };
            if (c.status === "rendering") return { ...c, status: "done" as ClipStatus };
          }
          if (data.status === "failed") {
            return { ...c, status: "failed" as ClipStatus, error: data.error ?? "Unknown error" };
          }
          return c;
        })
      );
    });

    return () => {
      socket.off("job:progress");
    };
  }, [mounted]);

  const handlePickDir = async () => {
    const dir = await pickDirectory();
    if (dir) setShortlistDir(dir);
  };

  const handleGenerate = useCallback(async () => {
    if (!shortlistDir || !appState) return;

    abortRef.current = false;
    setRunning(true);

    const userId = getUserId();
    const initialClips: ClipJob[] = appState.shortlist.map((entry) => ({
      entry,
      status: "pending",
      sourceKey: null,
      jobId: null,
      error: null,
      downloadUrl: null,
    }));
    setClips(initialClips);

    for (let i = 0; i < initialClips.length; i++) {
      if (abortRef.current) break;

      const clip = initialClips[i];
      const entry = clip.entry;

      setClips((prev) => prev.map((c, idx) => idx === i ? { ...c, status: "uploading" } : c));

      try {
        const categoryDir = await shortlistDir.getDirectoryHandle(entry.category);
        const videoFile = await findVideoFile(categoryDir, entry.clipName);

        if (!videoFile) {
          setClips((prev) => prev.map((c, idx) => idx === i ? { ...c, status: "failed", error: "Video file not found" } : c));
          continue;
        }

        const sourceKey = await uploadFileToR2(videoFile);
        setClips((prev) => prev.map((c, idx) => idx === i ? { ...c, sourceKey, status: "transcribing" } : c));

        const transcribeJobId = await submitTranscribeJob(sourceKey, entry.clipName, userId);
        setClips((prev) => prev.map((c, idx) => idx === i ? { ...c, jobId: transcribeJobId } : c));

        await waitForJob(transcribeJobId, i);

        if (abortRef.current) break;

        setClips((prev) => prev.map((c, idx) => idx === i ? { ...c, status: "rendering" } : c));

        const srtKey = sourceKey.replace(/\.[^.]+$/, ".srt");
        let srtContent = "";
        try {
          const srtUrl = await getDownloadUrl(srtKey);
          const srtRes = await fetch(srtUrl);
          if (srtRes.ok) srtContent = await srtRes.text();
        } catch {
          // render without captions
        }

        const renderJobId = await submitRenderJob(sourceKey, srtContent, entry.clipName, userId);
        setClips((prev) => prev.map((c, idx) => idx === i ? { ...c, jobId: renderJobId } : c));

        await waitForJob(renderJobId, i);

        const outputKey = sourceKey.replace(/\.[^.]+$/, "-social.mp4");
        const downloadUrl = await getDownloadUrl(outputKey);
        setClips((prev) => prev.map((c, idx) => idx === i ? { ...c, status: "done", downloadUrl } : c));

      } catch (err) {
        setClips((prev) => prev.map((c, idx) => idx === i ? {
          ...c,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        } : c));
      }
    }

    setRunning(false);
  }, [shortlistDir, appState]);

  function waitForJob(jobId: string, clipIndex: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const userId = getUserId();
      const socket = getSocket(userId);

      const handler = (data: { jobId: string; status: string; error?: string }) => {
        if (data.jobId !== jobId) return;
        if (data.status === "completed") {
          socket.off("job:progress", handler);
          resolve();
        }
        if (data.status === "failed") {
          socket.off("job:progress", handler);
          reject(new Error(data.error ?? "Job failed"));
        }
      };

      socket.on("job:progress", handler);

      setTimeout(() => {
        socket.off("job:progress", handler);
        reject(new Error("Job timed out"));
      }, 600000);
    });
  }

  const handleCancel = () => {
    abortRef.current = true;
  };

  const doneCount = clips.filter((c) => c.status === "done").length;
  const failedCount = clips.filter((c) => c.status === "failed").length;

  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!supported) return <BrowserWarning />;

  return (
    <div className="min-h-screen flex flex-col relative">
      <AmbientGlow />

      <header className="glass sticky top-0 z-30" style={{ borderRadius: 0, borderBottom: "0.5px solid var(--border)" }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="transition-colors" style={{ color: "var(--text-secondary)" }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
            </Link>
            <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Generate Social
            </h1>
            {appState && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--surface)", color: "var(--text-secondary)" }}>
                {appState.shortlist.length} clips
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!shortlistDir ? (
              <button
                onClick={handlePickDir}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Open Shortlist Folder
              </button>
            ) : (
              <>
                <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "var(--surface)", color: "var(--green)" }}>
                  {shortlistDir.name}
                </span>
                {running ? (
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 rounded-xl text-sm font-medium"
                    style={{ background: "var(--red)", color: "#fff" }}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={handleGenerate}
                    className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
                    style={{ background: "var(--accent)", color: "#fff" }}
                    disabled={!appState || appState.shortlist.length === 0}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                    Generate All
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Progress summary */}
      {clips.length > 0 && (
        <div className="relative z-20 px-4 py-3" style={{ background: "var(--surface)", borderBottom: "0.5px solid var(--border)" }}>
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                {running ? (
                  <>{doneCount + failedCount} of {clips.length} complete</>
                ) : (
                  <>{doneCount} succeeded{failedCount > 0 && `, ${failedCount} failed`}</>
                )}
              </p>
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${clips.length > 0 ? ((doneCount + failedCount) / clips.length) * 100 : 0}%`,
                  background: !running ? "var(--green)" : "var(--accent)",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Clip list */}
      <div className="flex-1 relative z-10 p-4 max-w-4xl mx-auto w-full">
        {(!appState || appState.shortlist.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="glass p-8 text-center max-w-md">
              <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                No clips to generate
              </h2>
              <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                Shortlist some clips first, then come here to generate social videos.
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
        ) : clips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="glass p-8 text-center max-w-md">
              <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                Ready to generate
              </h2>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Connect your shortlist folder and hit Generate All. Each clip will be uploaded, transcribed, and rendered as a 9:16 social video with word-by-word captions.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {clips.map((clip, i) => (
              <div
                key={clip.entry.id}
                className="glass flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {clip.entry.clipName}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {clip.entry.category} &middot; {clip.entry.originalFilename}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {clip.status === "pending" && (
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Waiting</span>
                  )}
                  {clip.status === "uploading" && (
                    <span className="text-xs flex items-center gap-2" style={{ color: "var(--accent)" }}>
                      <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      Uploading
                    </span>
                  )}
                  {clip.status === "transcribing" && (
                    <span className="text-xs flex items-center gap-2" style={{ color: "var(--accent)" }}>
                      <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      Transcribing
                    </span>
                  )}
                  {clip.status === "rendering" && (
                    <span className="text-xs flex items-center gap-2" style={{ color: "var(--amber)" }}>
                      <div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: "var(--amber)", borderTopColor: "transparent" }} />
                      Rendering
                    </span>
                  )}
                  {clip.status === "done" && (
                    <div className="flex items-center gap-2">
                      {clip.downloadUrl && (
                        <a
                          href={clip.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-2 py-1 rounded-lg"
                          style={{ background: "var(--accent)", color: "#fff" }}
                        >
                          Download
                        </a>
                      )}
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--green)" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    </div>
                  )}
                  {clip.status === "failed" && (
                    <span className="text-xs" style={{ color: "var(--red)" }} title={clip.error ?? ""}>
                      Failed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
