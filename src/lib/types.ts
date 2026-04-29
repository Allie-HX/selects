export interface VideoFile {
  name: string;
  stem: string;
  extension: string;
  fileHandle: FileSystemFileHandle;
  associatedAudio: FileSystemFileHandle | null;
  audioExtension: string | null;
  sourceFolderName: string;
  sourceFolderIndex: number;
}

export interface ShortlistEntry {
  id: string;
  clipName: string;
  category: string;
  originalFilename: string;
  sourceFolderName: string;
  timestamp: number;
  hasAudio: boolean;
  audioFilename: string | null;
}

export interface SourceFolder {
  name: string;
  handle: FileSystemDirectoryHandle;
  videoCount: number;
}

export interface AppState {
  categories: string[];
  shortlist: ShortlistEntry[];
  reviewedFiles: string[];
  skippedFiles: string[];
}

export const VIDEO_EXTENSIONS = ["mov", "mp4", "m4v"];
export const AUDIO_EXTENSIONS = ["wav", "mp3", "aac"];
export const IMAGE_EXTENSIONS = ["heic", "jpg", "png", "jpeg"];

export function isVideoFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.includes(ext);
}

export function isAudioFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.includes(ext);
}

export function getFileStem(name: string): string {
  const parts = name.split(".");
  parts.pop();
  return parts.join(".");
}

export function getFileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}
