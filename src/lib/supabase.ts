import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

type AgricultureDocRow = {
  chunk_text?: string | null;
};

type SearchAgricultureDocsParams = {
  keyword: string;
  language: "bm" | "en";
  limit?: number;
};

export async function searchAgricultureDocs({
  keyword,
  language,
  limit = 4,
}: SearchAgricultureDocsParams): Promise<string[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return [];
  }

  const url = new URL("/rest/v1/agriculture_docs", supabaseUrl);
  url.searchParams.set("select", "chunk_text");
  url.searchParams.set("language", `eq.${language}`);
  url.searchParams.set("keywords", `cs.{${keyword}}`);
  url.searchParams.set("limit", String(limit));

  try {
    const response = await fetch(url.toString(), {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as AgricultureDocRow[];
    return data
      .map((row) => row.chunk_text?.trim())
      .filter((chunk): chunk is string => Boolean(chunk));
  } catch (error) {
    // Gracefully handle network errors (e.g., ERR_NAME_NOT_RESOLVED)
    return [];
  }
}
