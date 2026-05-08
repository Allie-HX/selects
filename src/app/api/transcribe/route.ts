import { writeFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import OpenAI from "openai";
import { createReadStream } from "fs";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function buildSrt(segments: WhisperSegment[]): string {
  return segments
    .map(
      (seg, i) =>
        `${i + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text.trim()}\n`
    )
    .join("\n");
}

function buildWordSrt(words: WhisperWord[]): string {
  return words
    .map(
      (w, i) =>
        `${i + 1}\n${formatSrtTime(w.start)} --> ${formatSrtTime(w.end)}\n${w.word.trim()}\n`
    )
    .join("\n");
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const tempDir = await mkdtemp(join(tmpdir(), "transcribe-"));
  const inputPath = join(tempDir, file.name);
  const mp3Path = join(tempDir, "audio.mp3");

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(inputPath, buffer);

    if (!ffmpegPath) {
      return Response.json({ error: "ffmpeg binary not found" }, { status: 500 });
    }

    await execFileAsync(ffmpegPath, [
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-q:a",
      "4",
      "-y",
      mp3Path,
    ]);

    const openai = new OpenAI({ apiKey });

    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(mp3Path),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment", "word"],
    });

    const text = transcription.text;
    const segments = (transcription.segments ?? []) as WhisperSegment[];
    const words = (transcription.words ?? []) as WhisperWord[];
    const srt = buildSrt(segments);
    const wordSrt = buildWordSrt(words);

    return Response.json({ text, srt, wordSrt });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(mp3Path).catch(() => {});
    const { rmdir } = await import("fs/promises");
    await rmdir(tempDir).catch(() => {});
  }
}
