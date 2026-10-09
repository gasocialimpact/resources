-- Brainstorm Board: shared boards with live editing.
--
-- Access model: anyone with a board's link can view and edit it. The board id
-- in the link is a long random secret. Tables are closed to direct access and
-- reached only through the functions below, each of which requires a board
-- id, so boards can't be listed or guessed.
--
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Safe to re-run.

-- ---------- Tables ----------

create table if not exists public.boards (
  id text primary key check (char_length(id) >= 20),
  title text not null default 'Untitled Brainstorm',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.frames (
  board_id text not null references public.boards (id) on delete cascade,
  id text not null,
  position double precision not null default 0,
  title text not null default '',
  width integer,
  height integer,
  is_deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (board_id, id)
);

-- One row per Excalidraw element. `version` / `version_nonce` decide which
-- copy wins when two people change the same element (Excalidraw's own rule).
create table if not exists public.elements (
  board_id text not null references public.boards (id) on delete cascade,
  id text not null,
  frame_id text not null,
  version integer not null,
  version_nonce bigint not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (board_id, id)
);

create index if not exists elements_board_frame on public.elements (board_id, frame_id);

alter table public.boards enable row level security;
alter table public.frames enable row level security;
alter table public.elements enable row level security;

-- No policies: the anon key gets no direct table access.
revoke all on public.boards, public.frames, public.elements from anon, authenticated;

-- ---------- Functions (the only way in) ----------

create or replace function public.bb_create_board(p_id text, p_title text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.boards (id, title)
  values (p_id, coalesce(nullif(p_title, ''), 'Untitled Brainstorm'))
  on conflict (id) do nothing;
$$;

create or replace function public.bb_get_board(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when b.id is null then null else jsonb_build_object(
    'id', b.id,
    'title', b.title,
    'updated_at', b.updated_at,
    'frames', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'position', f.position, 'title', f.title,
        'width', f.width, 'height', f.height
      ) order by f.position)
      from public.frames f
      where f.board_id = b.id and not f.is_deleted
    ), '[]'::jsonb),
    'elements', coalesce((
      select jsonb_agg(jsonb_build_object('frame_id', e.frame_id, 'element', e.data))
      from public.elements e
      join public.frames f on f.board_id = e.board_id and f.id = e.frame_id and not f.is_deleted
      where e.board_id = b.id
    ), '[]'::jsonb)
  ) end
  from (select p_id as want) w
  left join public.boards b on b.id = w.want;
$$;

create or replace function public.bb_set_title(p_id text, p_title text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.boards
  set title = coalesce(nullif(p_title, ''), 'Untitled Brainstorm'), updated_at = now()
  where id = p_id;
$$;

-- p_frames: [{ id, position, title, width, height, is_deleted }]
-- Frame order and titles are last-write-wins.
create or replace function public.bb_upsert_frames(p_board text, p_frames jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.frames (board_id, id, position, title, width, height, is_deleted, updated_at)
  select p_board, f->>'id', coalesce((f->>'position')::float8, 0), coalesce(f->>'title', ''),
         (f->>'width')::int, (f->>'height')::int, coalesce((f->>'is_deleted')::boolean, false), now()
  from jsonb_array_elements(p_frames) f
  where exists (select 1 from public.boards where id = p_board)
  on conflict (board_id, id) do update set
    position = excluded.position,
    title = excluded.title,
    width = excluded.width,
    height = excluded.height,
    is_deleted = excluded.is_deleted,
    updated_at = now();
  update public.boards set updated_at = now() where id = p_board;
$$;

-- p_elements: [{ frame_id, element }]. An incoming element replaces the stored
-- one only if it's newer: higher version, or same version and lower nonce.
create or replace function public.bb_upsert_elements(p_board text, p_elements jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.elements as cur (board_id, id, frame_id, version, version_nonce, data, updated_at)
  select p_board, x->'element'->>'id', x->>'frame_id',
         (x->'element'->>'version')::int, (x->'element'->>'versionNonce')::bigint,
         x->'element', now()
  from jsonb_array_elements(p_elements) x
  where exists (select 1 from public.boards where id = p_board)
  on conflict (board_id, id) do update set
    frame_id = excluded.frame_id,
    version = excluded.version,
    version_nonce = excluded.version_nonce,
    data = excluded.data,
    updated_at = now()
  where cur.version < excluded.version
     or (cur.version = excluded.version and cur.version_nonce > excluded.version_nonce);
  update public.boards set updated_at = now() where id = p_board;
$$;

revoke all on function public.bb_create_board(text, text) from public;
revoke all on function public.bb_get_board(text) from public;
revoke all on function public.bb_set_title(text, text) from public;
revoke all on function public.bb_upsert_frames(text, jsonb) from public;
revoke all on function public.bb_upsert_elements(text, jsonb) from public;
grant execute on function public.bb_create_board(text, text) to anon, authenticated;
grant execute on function public.bb_get_board(text) to anon, authenticated;
grant execute on function public.bb_set_title(text, text) to anon, authenticated;
grant execute on function public.bb_upsert_frames(text, jsonb) to anon, authenticated;
grant execute on function public.bb_upsert_elements(text, jsonb) to anon, authenticated;

-- ---------- Images (PDF pages, uploads) ----------

-- Public bucket: files are readable by URL (paths include the board's secret
-- id) but the bucket can't be listed. Uploads only; nothing is overwritten.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('board-files', 'board-files', true, 15728640,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "board files upload" on storage.objects;
create policy "board files upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'board-files');
