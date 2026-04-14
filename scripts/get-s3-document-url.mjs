import process from "node:process";
import { config as loadEnv } from "dotenv";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

loadEnv();

const objectKey = process.argv[2];

if (!objectKey) {
  console.error("Usage: node scripts/get-s3-document-url.mjs <s3-key>");
  process.exit(1);
}

const required = [
  "SUPABASE_S3_ENDPOINT",
  "SUPABASE_S3_REGION",
  "SUPABASE_S3_ACCESS_KEY_ID",
  "SUPABASE_S3_SECRET_ACCESS_KEY",
  "SUPABASE_S3_BUCKET",
];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const s3Client = new S3Client({
  region: process.env.SUPABASE_S3_REGION,
  endpoint: process.env.SUPABASE_S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY,
  },
});

const command = new GetObjectCommand({
  Bucket: process.env.SUPABASE_S3_BUCKET,
  Key: objectKey,
});

const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
console.log(url);
