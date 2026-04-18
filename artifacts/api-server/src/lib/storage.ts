import { Storage } from "@google-cloud/storage";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const gcs = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
} as any);

function getBucket() {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
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
