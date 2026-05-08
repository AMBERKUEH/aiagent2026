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
  try {
    const { data, error } = await supabase
      .from('agriculture_docs')
      .select('chunk_text')
      .eq('language', language)
      .contains('keywords', [keyword])
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data
      .map((row) => row.chunk_text?.trim())
      .filter((chunk): chunk is string => Boolean(chunk));
  } catch (error) {
    // Gracefully handle network errors
    return [];
  }
}
