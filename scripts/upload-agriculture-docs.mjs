import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";
import pdfParse from "pdf-parse/index.js";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

loadEnv({ path: path.join(projectRoot, ".env") });

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: npm run upload:docs -- <path-to-json>");
  process.exit(1);
}

if (!process.env.VITE_SUPABASE_URL) {
  console.error("Missing VITE_SUPABASE_URL in .env");
  process.exit(1);
}

try {
  const supabaseUrl = new URL(process.env.VITE_SUPABASE_URL);
  if (!/\.supabase\.co$/i.test(supabaseUrl.hostname)) {
    throw new Error("VITE_SUPABASE_URL should look like https://<project-ref>.supabase.co");
  }
} catch (error) {
  console.error(`Invalid VITE_SUPABASE_URL: ${error.message}`);
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const hasS3Config = Boolean(
  process.env.SUPABASE_S3_REGION &&
    process.env.SUPABASE_S3_ACCESS_KEY_ID &&
    process.env.SUPABASE_S3_SECRET_ACCESS_KEY &&
    process.env.SUPABASE_S3_BUCKET
);

function normalizeKeyword(word) {
  return String(word)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim();
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function splitIntoChunks(text, maxLength = 700) {
  const cleanText = String(text).replace(/\s+/g, " ").trim();
  if (!cleanText) return [];

  const sentences = cleanText.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if (!sentence) continue;

    const candidate = currentChunk ? `${currentChunk} ${sentence}` : sentence;
    if (candidate.length <= maxLength) {
      currentChunk = candidate;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
      currentChunk = sentence;
      continue;
    }

    for (let index = 0; index < sentence.length; index += maxLength) {
      chunks.push(sentence.slice(index, index + maxLength).trim());
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildKeywords({ title, category, tags = [], text }) {
  return Array.from(
    new Set(
      `${title} ${category} ${tags.join(" ")} ${text}`
        .split(/\s+/)
        .map(normalizeKeyword)
        .filter((word) => word.length > 2)
    )
  ).slice(0, 40);
}

function validateRecord(record) {
  const requiredFields = ["doc_id", "title", "source", "language", "category"];
  const missing = requiredFields.filter((field) => !record[field]);

  if (missing.length > 0) {
    throw new Error(`Record is missing required fields: ${missing.join(", ")}`);
  }

  if (!["bm", "en"].includes(record.language)) {
    throw new Error(`Invalid language "${record.language}". Use "bm" or "en".`);
  }

  if (!record.content && !record.local_file_path) {
    throw new Error(`Record "${record.doc_id}" must include either content or local_file_path.`);
  }
}

function guessContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".pdf":
      return "application/pdf";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

async function uploadSourceFileToS3(record, projectRoot, s3Client) {
  if (!record.local_file_path) {
    return {
      sourceUrl: record.source_url ?? null,
      storagePath: record.storage_path ?? null,
      fileName: record.file_name ?? null,
    };
  }

  if (!hasS3Config) {
    throw new Error(
      `Record "${record.doc_id}" has local_file_path but Supabase S3 environment variables are missing.`
    );
  }

  const absoluteFilePath = path.resolve(projectRoot, record.local_file_path);
  const fileBody = await fs.readFile(absoluteFilePath);
  const fileName = record.file_name ?? path.basename(absoluteFilePath);
  const objectKey =
    record.storage_path ??
    `agriculture-docs/${slugify(record.source)}/${slugify(record.doc_id)}/${fileName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.SUPABASE_S3_BUCKET,
      Key: objectKey,
      Body: fileBody,
      ContentType: guessContentType(absoluteFilePath),
    })
  );

  const publicBaseUrl = process.env.SUPABASE_S3_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const sourceUrl = publicBaseUrl
    ? `${publicBaseUrl}/${objectKey}`
    : `s3://${process.env.SUPABASE_S3_BUCKET}/${objectKey}`;

  return {
    sourceUrl,
    storagePath: objectKey,
    fileName,
  };
}

async function extractTextFromLocalFile(record, projectRoot) {
  if (!record.local_file_path) {
    return String(record.content ?? "").trim();
  }

  const absoluteFilePath = path.resolve(projectRoot, record.local_file_path);
  const extension = path.extname(absoluteFilePath).toLowerCase();

  if (extension === ".pdf") {
    const fileBuffer = await fs.readFile(absoluteFilePath);
    const parsed = await pdfParse(fileBuffer);
    return parsed.text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  if (extension === ".txt" || extension === ".md") {
    return (await fs.readFile(absoluteFilePath, "utf8")).trim();
  }

  if (record.content) {
    return String(record.content).trim();
  }

  throw new Error(
    `Record "${record.doc_id}" uses unsupported file type "${extension}". Add content manually or use PDF/TXT/MD.`
  );
}

async function main() {
  const absoluteInputPath = path.resolve(projectRoot, inputPath);
  const raw = await fs.readFile(absoluteInputPath, "utf8");
  const records = JSON.parse(raw);

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Input JSON must be a non-empty array.");
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const s3Client = hasS3Config
    ? new S3Client({
        region: process.env.SUPABASE_S3_REGION,
        endpoint: process.env.SUPABASE_S3_ENDPOINT,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY,
        },
      })
    : null;
  let totalChunks = 0;
  const rows = [];

  for (const record of records) {
    validateRecord(record);
    const uploadedSource = await uploadSourceFileToS3(record, projectRoot, s3Client);
    const extractedText = await extractTextFromLocalFile(record, projectRoot);

    if (!extractedText) {
      throw new Error(`Record "${record.doc_id}" did not produce any text to index.`);
    }

    const chunks = splitIntoChunks(extractedText, record.maxChunkLength ?? 700);
    const tags = Array.isArray(record.tags) ? record.tags : [];
    const oppositeLanguage = record.language === "bm" ? "en" : "bm";

    chunks.forEach((chunkText, index) => {
      const chunkNumber = String(index + 1).padStart(3, "0");
      const chunkId = `${slugify(record.doc_id)}-${record.language}-${chunkNumber}`;

      rows.push({
        id: chunkId,
        doc_id: record.doc_id,
        chunk_id: chunkId,
        title: record.title,
        source: record.source,
        source_type: record.source_type ?? "text",
        source_url: uploadedSource.sourceUrl,
        language: record.language,
        category: record.category,
        region: record.region ?? "malaysia",
        crop: record.crop ?? "paddy",
        chunk_text: chunkText,
        keywords: buildKeywords({
          title: record.title,
          category: record.category,
          tags,
          text: chunkText,
        }),
        tags,
        chunk_index: index + 1,
        total_chunks: chunks.length,
        translated_from: record.translated_from ?? null,
        paired_chunk_id: record.paired_doc_id
          ? `${slugify(record.paired_doc_id)}-${oppositeLanguage}-${chunkNumber}`
          : null,
        storage_path: uploadedSource.storagePath,
        file_name: uploadedSource.fileName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      totalChunks += 1;
    });
  }

  const { error } = await supabase.from("agriculture_docs").upsert(rows, {
    onConflict: "id",
  });

  if (error) {
    throw new Error(error.message);
  }

  console.log(`Uploaded ${records.length} source records as ${totalChunks} Supabase rows.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
