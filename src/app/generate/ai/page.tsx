"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { isFileSystemAccessSupported, pickDirectory } from "@/lib/fs";
import { VIDEO_EXTENSIONS, AUDIO_EXTENSIONS } from "@/lib/types";
import {
  uploadFileToR2,
  submitTranscribeJob,
  getDownloadUrl,
  getSocket,
  generateForAudiences,
  type ClipInfo,
  type GenerateResult,
} from "@/lib/backend";
import BrowserWarning from "@/components/BrowserWarning";
import AmbientGlow from "@/components/AmbientGlow";

type Step = "select-folder" | "uploading" | "transcribing" | "configure" | "generating" | "done";

interface UploadedClip {
  name: string;
  key: string;
  category: string;
  durationSeconds: number;
  transcript: string;
  status: "pending" | "uploading" | "transcribing" | "ready" | "failed";
  error?: string;
}

function getUserId(): string {
  let id = localStorage.getItem("selects-user-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("selects-user-id", id);
  }
  return id;
}

function isVideoFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.includes(ext);
}

export default function AIGeneratePage() {
  const [supported, setSupported] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("select-folder");
  const [clips, setClips] = useState<UploadedClip[]>([]);
  const [audiences, setAudiences] = useState<string[]>([
    "Families with young kids",
    "Adventure-seeking couples",
    "Budget-conscious travellers",
  ]);
  const [newAudience, setNewAudience] = useState("");
  const [targetDuration, setTargetDuration] = useState(30);
  const [results, setResults] = useState<GenerateResult[]>([]);
  const [currentAudience, setCurrentAudience] = useState("");

  useEffect(() => {
    setMounted(true);
    setSupported(isFileSystemAccessSupported());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const userId = getUserId();
    const socket = getSocket(userId);

    socket.on("compose:status", (data: { status: string; audience?: string; title?: string; downloadUrl?: string; error?: string }) => {
      if (data.audience) setCurrentAudience(data.audience);
      if (data.status === "done" && data.downloadUrl) {
        setResults((prev) => {
          const existing = prev.find((r) => r.audience === data.audience);
          if (existing) {
            return prev.map((r) =>
              r.audience === data.audience ? { ...r, downloadUrl: data.downloadUrl } : r
            );
          }
          return [...prev, { audience: data.audience!, downloadUrl: data.downloadUrl }];
        });
      }
    });

    return () => {
      socket.off("compose:status");
    };
  }, [mounted]);

  const handlePickFolder = async () => {
    const dir = await pickDirectory();
    if (!dir) return;

    const videoFiles: { name: string; file: File }[] = [];
    for await (const entry of dir.values()) {
      if (entry.kind === "file" && isVideoFile(entry.name) && !entry.name.startsWith(".") && !entry.name.startsWith("._")) {
        const file = await entry.getFile();
        videoFiles.push({ name: entry.name, file });
      }
    }

    if (videoFiles.length === 0) return;

    const userId = getUserId();
    const socket = getSocket(userId);

    const initialClips: UploadedClip[] = videoFiles.map((v) => ({
      name: v.name,
      key: "",
      category: "Footage",
      durationSeconds: 0,
      transcript: "",
      status: "pending",
    }));
    setClips(initialClips);
    setStep("uploading");

    for (let i = 0; i < videoFiles.length; i++) {
      const { name, file } = videoFiles[i];

      setClips((prev) => prev.map((c, idx) => idx === i ? { ...c, status: "uploading" } : c));

      try {
        const key = await uploadFileToR2(file);

        const duration = await getVideoDuration(file);

        setClips((prev) => prev.map((c, idx) => idx === i ? {
          ...c,
          key,
          durationSeconds: duration,
          status: "transcribing",
        } : c));

        const jobId = await submitTranscribeJob(key, name, userId);

        const transcript = await waitForTranscript(socket, jobId, key);

        setClips((prev) => prev.map((c, idx) => idx === i ? {
          ...c,
          transcript,
          status: "ready",
        } : c));
      } catch (err) {
        setClips((prev) => prev.map((c, idx) => idx === i ? {
          ...c,
          status: "failed",
          error: err instanceof Error ? err.message : "Failed",
        } : c));
      }
    }

    setStep("configure");
  };

  const handleGenerate = async () => {
    const readyClips = clips.filter((c) => c.status === "ready");
    if (readyClips.length === 0 || audiences.length === 0) return;

    setStep("generating");
    setResults([]);

    const userId = getUserId();
    const clipInfos: ClipInfo[] = readyClips.map((c) => ({
      key: c.key,
      clipName: c.name,
      category: c.category,
      durationSeconds: c.durationSeconds,
      transcript: c.transcript,
    }));

    try {
      const res = await generateForAudiences(clipInfos, audiences, userId, targetDuration);
      setResults(res);
    } catch {
      // errors come via socket events
    }

    setStep("done");
  };

  const addAudience = () => {
    const trimmed = newAudience.trim();
    if (trimmed && !audiences.includes(trimmed)) {
      setAudiences((prev) => [...prev, trimmed]);
      setNewAudience("");
    }
  };

  const removeAudience = (a: string) => {
    setAudiences((prev) => prev.filter((x) => x !== a));
  };

  const readyCount = clips.filter((c) => c.status === "ready").length;
  const processingCount = clips.filter((c) => c.status === "uploading" || c.status === "transcribing").length;

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
              AI Video Generator
            </h1>
          </div>
        </div>
      </header>

      <div className="flex-1 relative z-10 p-4 max-w-4xl mx-auto w-full">

        {/* Step 1: Select folder */}
        {step === "select-folder" && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="glass p-8 text-center max-w-lg">
              <svg className="w-12 h-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} style={{ color: "var(--amber)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
              </svg>
              <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                Select your footage folder
              </h2>
              <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
                Pick a folder with your raw clips. They&apos;ll be uploaded, transcribed, then AI will compose social videos for each audience you define.
              </p>
              <button
                onClick={handlePickFolder}
                className="px-6 py-3 rounded-xl text-sm font-medium"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Choose Folder
              </button>
            </div>
          </div>
        )}

        {/* Step 2-3: Upload & Transcribe */}
        {(step === "uploading" || step === "transcribing") && (
          <div className="flex flex-col gap-3">
            <div className="glass p-4 mb-2">
              <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Uploading & transcribing {clips.length} clips... {readyCount} ready, {processingCount} processing
              </p>
              <div className="w-full h-1 rounded-full overflow-hidden mt-2" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${clips.length > 0 ? (readyCount / clips.length) * 100 : 0}%`,
                    background: "var(--accent)",
                  }}
                />
              </div>
            </div>
            {clips.map((clip, i) => (
              <div key={i} className="glass flex items-center justify-between px-4 py-3">
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>{clip.name}</span>
                <span className="text-xs" style={{ color: clip.status === "ready" ? "var(--green)" : clip.status === "failed" ? "var(--red)" : "var(--accent)" }}>
                  {clip.status === "pending" && "Waiting"}
                  {clip.status === "uploading" && "Uploading..."}
                  {clip.status === "transcribing" && "Transcribing..."}
                  {clip.status === "ready" && "Ready"}
                  {clip.status === "failed" && (clip.error ?? "Failed")}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Step 4: Configure audiences */}
        {step === "configure" && (
          <div className="flex flex-col gap-6">
            <div className="glass p-4">
              <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                {readyCount} clips ready
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {clips.filter((c) => c.status === "failed").length > 0 &&
                  `${clips.filter((c) => c.status === "failed").length} failed — they'll be skipped`}
              </p>
            </div>

            <div className="glass p-6">
              <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                Target Audiences
              </h3>
              <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                AI will create a unique video for each audience — different clip selections, hooks, and CTAs.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {audiences.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{ background: "var(--surface)", color: "var(--text-primary)", border: "0.5px solid var(--border)" }}
                  >
                    {a}
                    <button
                      onClick={() => removeAudience(a)}
                      className="ml-0.5 opacity-50 hover:opacity-100"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newAudience}
                  onChange={(e) => setNewAudience(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addAudience()}
                  placeholder="Add audience (e.g. Solo travellers)"
                  className="flex-1 px-3 py-2 rounded-xl text-sm"
                  style={{
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    border: "0.5px solid var(--border)",
                    outline: "none",
                  }}
                />
                <button
                  onClick={addAudience}
                  className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: "var(--surface)", color: "var(--text-primary)", border: "0.5px solid var(--border)" }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="glass p-6">
              <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                Video Duration
              </h3>
              <div className="flex gap-2">
                {[15, 30, 45, 60].map((d) => (
                  <button
                    key={d}
                    onClick={() => setTargetDuration(d)}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    style={{
                      background: targetDuration === d ? "var(--accent)" : "var(--surface)",
                      color: targetDuration === d ? "#fff" : "var(--text-primary)",
                      border: "0.5px solid var(--border)",
                    }}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              className="px-6 py-3 rounded-xl text-sm font-medium self-end flex items-center gap-2"
              style={{ background: "var(--accent)", color: "#fff" }}
              disabled={readyCount === 0 || audiences.length === 0}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
              </svg>
              Generate {audiences.length} Video{audiences.length !== 1 && "s"}
            </button>
          </div>
        )}

        {/* Step 5: Generating */}
        {step === "generating" && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="glass p-8 text-center max-w-md">
              <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: "var(--amber)", borderTopColor: "transparent" }} />
              <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                Generating videos
              </h2>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {currentAudience ? `Working on: ${currentAudience}` : "AI is composing your videos..."}
              </p>
              <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
                This takes a few minutes per video
              </p>
            </div>
          </div>
        )}

        {/* Step 6: Results */}
        {step === "done" && (
          <div className="flex flex-col gap-4">
            <div className="glass p-4">
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Generation complete
              </h3>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {results.filter((r) => r.downloadUrl).length} of {results.length} videos generated
              </p>
            </div>

            {results.map((result, i) => (
              <div key={i} className="glass flex items-center justify-between px-4 py-4">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {result.audience}
                  </p>
                  {result.plan && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                      {result.plan.title} &middot; {result.plan.segments.length} clips &middot; {result.plan.totalDurationSeconds}s
                    </p>
                  )}
                  {result.error && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--red)" }}>{result.error}</p>
                  )}
                </div>
                {result.downloadUrl ? (
                  <a
                    href={result.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl text-sm font-medium"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    Download
                  </a>
                ) : result.error ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--red)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                ) : (
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            ))}

            <div className="flex gap-3 justify-end mt-2">
              <button
                onClick={() => { setStep("configure"); setResults([]); }}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: "var(--surface)", color: "var(--text-primary)", border: "0.5px solid var(--border)" }}
              >
                Generate More
              </button>
              <button
                onClick={() => { setStep("select-folder"); setClips([]); setResults([]); }}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: "var(--surface)", color: "var(--text-primary)", border: "0.5px solid var(--border)" }}
              >
                New Folder
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(Math.round(video.duration));
    };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}

function waitForTranscript(
  socket: ReturnType<typeof getSocket>,
  jobId: string,
  sourceKey: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const handler = async (data: { jobId: string; status: string; error?: string }) => {
      if (data.jobId !== jobId) return;

      if (data.status === "completed") {
        socket.off("job:progress", handler);
        try {
          const txtKey = sourceKey.replace(/\.[^.]+$/, ".txt");
          const url = await getDownloadUrl(txtKey);
          const res = await fetch(url);
          resolve(res.ok ? await res.text() : "");
        } catch {
          resolve("");
        }
      }

      if (data.status === "failed") {
        socket.off("job:progress", handler);
        reject(new Error(data.error ?? "Transcription failed"));
      }
    };

    socket.on("job:progress", handler);

    setTimeout(() => {
      socket.off("job:progress", handler);
      reject(new Error("Transcription timed out"));
    }, 300000);
  });
}
