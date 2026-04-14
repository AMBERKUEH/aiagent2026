import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Readability } from "@mozilla/readability/index.js";
import { JSDOM } from "jsdom";
import TurndownService from "turndown/lib/turndown.cjs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: npm run fetch:rag -- <path-to-link-json>");
  process.exit(1);
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toGoogleDocsTxtExport(url) {
  const match = url.match(/^https:\/\/docs\.google\.com\/document\/d\/([^/]+)/i);
  if (!match) return null;
  return `https://docs.google.com/document/d/${match[1]}/export?format=txt`;
}

async function fetchSourceContent(url) {
  const googleDocsTxtUrl = toGoogleDocsTxtExport(url);

  if (googleDocsTxtUrl) {
    const response = await fetch(googleDocsTxtUrl);
    if (!response.ok) {
      throw new Error(`Google Docs export failed with ${response.status}`);
    }

    const text = await response.text();
    return `Source: ${url}\n\n${text.trim()}`;
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 SmartPaddyRAG/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed with ${response.status}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article?.content) {
    throw new Error("Could not extract main content from page");
  }

  const markdown = turndown.turndown(article.content).trim();
  return `# ${article.title ?? "Untitled"}\n\nSource: ${url}\n\n${markdown}`;
}

async function main() {
  const absoluteInputPath = path.resolve(projectRoot, inputPath);
  const raw = await fs.readFile(absoluteInputPath, "utf8");
  const sources = JSON.parse(raw);

  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error("Input JSON must be a non-empty array.");
  }

  const outputDir = path.join(projectRoot, "documents");
  await fs.mkdir(outputDir, { recursive: true });

  const generatedRecords = [];

  for (const source of sources) {
    if (!source.name || !source.url || !source.language || !source.category || !source.source) {
      throw new Error(
        `Each source needs name, url, language, category, and source. Problem source: ${JSON.stringify(source)}`
      );
    }

    const fileBaseName = `${slugify(source.name)}.md`;
    const localFilePath = path.join(outputDir, fileBaseName);

    try {
      const content = await fetchSourceContent(source.url);
      await fs.writeFile(localFilePath, content, "utf8");

      generatedRecords.push({
        doc_id: source.doc_id ?? slugify(source.name),
        paired_doc_id: source.paired_doc_id ?? null,
        title: source.title ?? source.name,
        source: source.source,
        source_type: "md",
        local_file_path: `documents/${fileBaseName}`,
        language: source.language,
        category: source.category,
        region: source.region ?? "malaysia",
        crop: source.crop ?? "paddy",
        tags: Array.isArray(source.tags) ? source.tags : [],
        source_url: source.url,
        storage_path:
          source.storage_path ??
          `agriculture-docs/${slugify(source.source)}/${fileBaseName}`,
        file_name: fileBaseName,
      });

      console.log(`Saved ${source.url} -> documents/${fileBaseName}`);
    } catch (error) {
      console.error(`Failed ${source.url}: ${error.message}`);
    }
  }

  const manifestPath = path.join(projectRoot, "docs", "generated-rag-upload.json");
  await fs.writeFile(manifestPath, JSON.stringify(generatedRecords, null, 2), "utf8");
  console.log(`Generated upload manifest -> docs/generated-rag-upload.json`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
