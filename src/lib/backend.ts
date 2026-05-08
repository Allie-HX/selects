import { io, Socket } from "socket.io-client";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://selects-production.up.railway.app";

let socket: Socket | null = null;

export function getSocket(userId: string): Socket {
  if (!socket) {
    socket = io(BACKEND_URL, {
      query: { userId },
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export async function getPresignedUploadUrl(
  filename: string,
  contentType: string
): Promise<{ key: string; uploadUrl: string }> {
  const res = await fetch(`${BACKEND_URL}/api/upload/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  return res.json();
}

export async function uploadFileToR2(
  file: File
): Promise<string> {
  const { key, uploadUrl } = await getPresignedUploadUrl(file.name, file.type);

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!res.ok) throw new Error("Failed to upload file");
  return key;
}

export async function getDownloadUrl(key: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/upload/download-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) throw new Error("Failed to get download URL");
  const data = await res.json();
  return data.downloadUrl;
}

export async function submitTranscribeJob(
  sourceKey: string,
  clipName: string,
  userId: string
): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/jobs/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceKey, clipName, userId }),
  });
  if (!res.ok) throw new Error("Failed to submit transcribe job");
  const data = await res.json();
  return data.jobId;
}

export async function submitRenderJob(
  sourceKey: string,
  srtContent: string,
  clipName: string,
  userId: string
): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/jobs/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceKey, srtContent, clipName, userId }),
  });
  if (!res.ok) throw new Error("Failed to submit render job");
  const data = await res.json();
  return data.jobId;
}

export async function submitTranscribeBatch(
  clips: { sourceKey: string; clipName: string }[],
  userId: string
): Promise<{ jobId: string; clipName: string }[]> {
  const res = await fetch(`${BACKEND_URL}/api/jobs/transcribe-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clips, userId }),
  });
  if (!res.ok) throw new Error("Failed to submit batch transcribe");
  const data = await res.json();
  return data.jobs;
}

export async function submitRenderBatch(
  clips: { sourceKey: string; srtContent: string; clipName: string }[],
  userId: string
): Promise<{ jobId: string; clipName: string }[]> {
  const res = await fetch(`${BACKEND_URL}/api/jobs/render-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clips, userId }),
  });
  if (!res.ok) throw new Error("Failed to submit batch render");
  const data = await res.json();
  return data.jobs;
}

export interface ClipInfo {
  key: string;
  clipName: string;
  category: string;
  durationSeconds: number;
  transcript: string;
}

export interface CompositionPlan {
  title: string;
  segments: {
    clipKey: string;
    clipName: string;
    startSeconds: number;
    endSeconds: number;
    purpose: string;
  }[];
  hookText: string;
  ctaText: string;
  transitionStyle: string;
  captionStyle: string;
  totalDurationSeconds: number;
}

export interface GenerateResult {
  audience: string;
  plan?: CompositionPlan;
  downloadUrl?: string;
  error?: string;
}

export async function generateForAudiences(
  clips: ClipInfo[],
  audiences: string[],
  userId: string,
  targetDuration: number = 30
): Promise<GenerateResult[]> {
  const res = await fetch(`${BACKEND_URL}/api/compose/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clips, audiences, targetDuration, userId }),
  });
  if (!res.ok) throw new Error("Failed to start generation");
  const data = await res.json();
  return data.results;
}
