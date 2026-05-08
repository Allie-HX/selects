import { Router } from "express";
import { randomUUID } from "crypto";
import { getUploadUrl, getDownloadUrl } from "../storage/r2.js";

const router = Router();

router.post("/presign", async (req, res) => {
  const { filename, contentType } = req.body;

  if (!filename || !contentType) {
    res.status(400).json({ error: "filename and contentType required" });
    return;
  }

  const key = `uploads/${randomUUID()}/${filename}`;
  const uploadUrl = await getUploadUrl(key, contentType);

  res.json({ key, uploadUrl });
});

router.post("/download-url", async (req, res) => {
  const { key } = req.body;

  if (!key) {
    res.status(400).json({ error: "key required" });
    return;
  }

  const downloadUrl = await getDownloadUrl(key);
  res.json({ downloadUrl });
});

export default router;
