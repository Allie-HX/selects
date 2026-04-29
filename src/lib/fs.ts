import {
  type VideoFile,
  type SourceFolder,
  isVideoFile,
  isAudioFile,
  getFileStem,
  getFileExtension,
} from "./types";

export function isFileSystemAccessSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "showDirectoryPicker" in window;
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    return handle;
  } catch {
    // User cancelled
    return null;
  }
}

export async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  folderIndex: number
): Promise<VideoFile[]> {
  const files: Map<string, FileSystemFileHandle> = new Map();

  // Collect all files
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file") {
      files.set(entry.name, entry);
    }
  }

  // Build video file list with associated audio
  const videos: VideoFile[] = [];

  for (const [name, handle] of files) {
    if (!isVideoFile(name)) continue;

    const stem = getFileStem(name);
    const ext = getFileExtension(name);

    // Look for matching audio file
    let associatedAudio: FileSystemFileHandle | null = null;
    let audioExtension: string | null = null;

    for (const [audioName, audioHandle] of files) {
      if (isAudioFile(audioName) && getFileStem(audioName) === stem) {
        associatedAudio = audioHandle;
        audioExtension = getFileExtension(audioName);
        break;
      }
    }

    videos.push({
      name,
      stem,
      extension: ext,
      fileHandle: handle,
      associatedAudio,
      audioExtension,
      sourceFolderName: dirHandle.name,
      sourceFolderIndex: folderIndex,
    });
  }

  // Sort by name
  videos.sort((a, b) => a.name.localeCompare(b.name));

  return videos;
}

export async function getOrCreateSubDir(
  parent: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

export async function copyFileToShortlist(
  shortlistDir: FileSystemDirectoryHandle,
  category: string,
  clipName: string,
  videoFile: VideoFile
): Promise<void> {
  // Get or create category subfolder
  const categoryDir = await getOrCreateSubDir(shortlistDir, category);

  // Copy video file
  const videoExt = videoFile.extension;
  const destVideoName = `${clipName}.${videoExt}`;
  const destVideoHandle = await categoryDir.getFileHandle(destVideoName, {
    create: true,
  });

  const sourceFile = await videoFile.fileHandle.getFile();
  const writable = await destVideoHandle.createWritable();
  await writable.write(sourceFile);
  await writable.close();

  // Copy associated audio if present
  if (videoFile.associatedAudio && videoFile.audioExtension) {
    const destAudioName = `${clipName}.${videoFile.audioExtension}`;
    const destAudioHandle = await categoryDir.getFileHandle(destAudioName, {
      create: true,
    });

    const audioFile = await videoFile.associatedAudio.getFile();
    const audioWritable = await destAudioHandle.createWritable();
    await audioWritable.write(audioFile);
    await audioWritable.close();
  }
}

export async function buildSourceFolder(
  handle: FileSystemDirectoryHandle,
  index: number
): Promise<{ folder: SourceFolder; videos: VideoFile[] }> {
  const videos = await scanDirectory(handle, index);
  return {
    folder: {
      name: handle.name,
      handle,
      videoCount: videos.length,
    },
    videos,
  };
}
