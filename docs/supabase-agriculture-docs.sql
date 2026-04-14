create table if not exists public.agriculture_docs (
  id text primary key,
  doc_id text not null,
  chunk_id text not null unique,
  title text not null,
  source text not null,
  source_type text,
  source_url text,
  language text not null check (language in ('bm', 'en')),
  category text not null,
  region text default 'malaysia',
  crop text default 'paddy',
  chunk_text text not null,
  keywords text[] not null default '{}',
  tags text[] not null default '{}',
  chunk_index integer not null,
  total_chunks integer not null,
  translated_from text,
  paired_chunk_id text,
  storage_path text,
  file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agriculture_docs_language_idx
  on public.agriculture_docs (language);

create index if not exists agriculture_docs_category_idx
  on public.agriculture_docs (category);

create index if not exists agriculture_docs_keywords_gin_idx
  on public.agriculture_docs using gin (keywords);

alter table public.agriculture_docs enable row level security;

create policy "Allow read access to agriculture docs"
  on public.agriculture_docs
  for select
  to anon, authenticated
  using (true);
