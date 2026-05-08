import { readFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const RENDER_TEMP_BASE = join(tmpdir(), "selects-render");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const filePath = join(RENDER_TEMP_BASE, ...path);

  if (!filePath.startsWith(RENDER_TEMP_BASE)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return new Response("Not found", { status: 404 });
    }

    const buffer = await readFile(filePath);
    const ext = filePath.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "mp4"
        ? "video/mp4"
        : ext === "mov"
          ? "video/quicktime"
          : ext === "m4v"
            ? "video/x-m4v"
            : "application/octet-stream";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(info.size),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
