import { Storage } from "@google-cloud/storage";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

const gcs = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
});

function getBucket() {
  const bucketId = process.env.STORAGE_BUCKET;
  if (!bucketId) throw new Error("STORAGE_BUCKET is not set");
  return gcs.bucket(bucketId);
}

export async function uploadFileToStorage(
  localPath: string,
  originalName: string,
  mimeType?: string
): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();
  const objectName = `submissions/${randomUUID()}${ext}`;
  const MIME_MAP: Record<string, string> = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  const contentType = mimeType || MIME_MAP[ext] || "application/octet-stream";
  const bucket = getBucket();
  await bucket.upload(localPath, {
    destination: objectName,
    metadata: { cacheControl: "private, max-age=3600", contentType },
  });
  return objectName;
}

export async function streamFileFromStorage(
  objectName: string
): Promise<{ stream: NodeJS.ReadableStream; contentType: string; contentLength?: number }> {
  const bucket = getBucket();
  const file = bucket.file(objectName);
  const [exists] = await file.exists();
  if (!exists) throw new Error("File not found in storage");
  const [metadata] = await file.getMetadata();
  return {
    stream: file.createReadStream(),
    contentType: (metadata.contentType as string) || "application/octet-stream",
    contentLength: metadata.size ? Number(metadata.size) : undefined,
  };
}
