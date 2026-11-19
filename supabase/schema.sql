-- =====================================================================
-- あさログ  Supabase スキーマ
-- Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」してください。
-- 何度実行しても壊れないように書いてあります（再実行で設定を上書き）。
-- =====================================================================

-- ---------- テーブル ----------

-- アプリ全体の設定（1行だけ）
create table if not exists public.app_config (
  id          int primary key default 1 check (id = 1),
  approval    text not null default 'auto' check (approval in ('auto', 'manual')),
  group_name  text not null default '' check (char_length(group_name) <= 24),
  welcome     text not null default '' check (char_length(welcome) <= 300),
  updated_at  timestamptz not null default now()
);
insert into public.app_config (id) values (1) on conflict (id) do nothing;

-- 参加者のプロフィール（auth.users と 1対1）
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  nickname            text not null check (char_length(nickname) between 1 and 20),
  bio                 text not null default '' check (char_length(bio) <= 60),
  color               text not null default '#E07B5A' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  default_vis         text not null default 'public' check (default_vis in ('public', 'private')),
  default_hide_photo  boolean not null default false,
  status              text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  role                text not null default 'member' check (role in ('member', 'admin')),
  agreed_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 朝の記録（1人1日1件）
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  author        uuid not null references public.profiles (id) on delete cascade,
  date          date not null,
  visibility    text not null default 'public' check (visibility in ('public', 'private')),
  skipped       boolean not null default false,
  menu          text not null default '' check (char_length(menu) <= 80),
  bed           text not null default '' check (bed = '' or bed ~ '^[0-2][0-9]:[0-5][0-9]$'),
  wake          text not null default '' check (wake = '' or wake ~ '^[0-2][0-9]:[0-5][0-9]$'),
  bft           text not null default '' check (bft = '' or bft ~ '^[0-2][0-9]:[0-5][0-9]$'),
  sleep_min     int check (sleep_min between 0 and 1440),
  maker         text not null default '',
  tags          text[] not null default '{}',
  balance       text[] not null default '{}',
  feel          text not null default '',
  place         text not null default '',
  with_whom     text not null default '',
  dur           text not null default '',
  sat           text not null default '',
  mood          text not null default '',
  note          text not null default '' check (char_length(note) <= 300),
  photo_path    text,
  photo_hidden  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (author, date)
);
create index if not exists posts_date_idx on public.posts (date desc, created_at desc);

-- 「おはよう」リアクション
create table if not exists public.likes (
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ---------- 判定用の関数（RLS の中で使う） ----------

create or replace function public.is_active(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and status = 'active');
$$;

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and role = 'admin' and status = 'active');
$$;

-- 投稿が「他の参加者に見えてよい公開投稿」か
create or replace function public.post_is_shared(p public.posts)
returns boolean language sql stable security definer set search_path = public as $$
  select p.visibility = 'public' and public.is_active(p.author);
$$;

-- ---------- トリガー ----------

-- 参加登録時：状態と権限はサーバー側で決める（最初の1人は管理者）
create or replace function public.profiles_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id := auth.uid();
  if not exists (select 1 from public.profiles where role = 'admin') then
    new.role := 'admin';
    new.status := 'active';
  else
    new.role := 'member';
    new.status := case when (select approval from public.app_config where id = 1) = 'manual'
                       then 'pending' else 'active' end;
  end if;
  new.created_at := now();
  new.agreed_at := now();
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_before_insert on public.profiles;
create trigger profiles_before_insert before insert on public.profiles
  for each row execute function public.profiles_before_insert();

-- プロフィール更新時：状態・権限は管理者しか変えられない
create or replace function public.profiles_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.status is distinct from old.status or new.role is distinct from old.role) then
    if not public.is_admin(auth.uid()) then
      raise exception '状態や権限は管理者だけが変更できます';
    end if;
    if old.id = auth.uid() and new.role <> 'admin' then
      raise exception '自分の管理者権限は外せません';
    end if;
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  new.agreed_at := old.agreed_at;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_before_update on public.profiles;
create trigger profiles_before_update before update on public.profiles
  for each row execute function public.profiles_before_update();

-- 投稿：作者は本人に固定、承認制を切り替えたときの既存参加者も守る
create or replace function public.posts_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author := auth.uid();
    new.created_at := now();
  else
    new.author := old.author;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists posts_before_write on public.posts;
create trigger posts_before_write before insert or update on public.posts
  for each row execute function public.posts_before_write();

-- 設定の更新日時
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists app_config_touch on public.app_config;
create trigger app_config_touch before update on public.app_config
  for each row execute function public.touch_updated_at();

-- ---------- 行レベルセキュリティ（RLS） ----------

alter table public.app_config enable row level security;
alter table public.profiles   enable row level security;
alter table public.posts      enable row level security;
alter table public.likes      enable row level security;

-- app_config：ログインした人は読める／管理者だけ更新
drop policy if exists "config read" on public.app_config;
create policy "config read" on public.app_config for select to authenticated using (true);
drop policy if exists "config admin update" on public.app_config;
create policy "config admin update" on public.app_config for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- profiles
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_admin(auth.uid())
  or (public.is_active(auth.uid()) and status = 'active')
);
drop policy if exists "profiles insert self" on public.profiles;
create policy "profiles insert self" on public.profiles for insert to authenticated
  with check (id = auth.uid());
drop policy if exists "profiles update self or admin" on public.profiles;
create policy "profiles update self or admin" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "profiles delete self or admin" on public.profiles;
create policy "profiles delete self or admin" on public.profiles for delete to authenticated
  using (id = auth.uid() or (public.is_admin(auth.uid()) and role <> 'admin'));

-- posts
drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts for select to authenticated using (
  author = auth.uid()
  or (public.is_active(auth.uid()) and public.post_is_shared(posts))
  or (public.is_admin(auth.uid()) and visibility = 'public')
);
drop policy if exists "posts insert own" on public.posts;
create policy "posts insert own" on public.posts for insert to authenticated
  with check (public.is_active(auth.uid()));
drop policy if exists "posts update own" on public.posts;
create policy "posts update own" on public.posts for update to authenticated
  using (author = auth.uid() and public.is_active(auth.uid()))
  with check (author = auth.uid());
drop policy if exists "posts delete own or admin" on public.posts;
create policy "posts delete own or admin" on public.posts for delete to authenticated using (
  author = auth.uid()
  or (public.is_admin(auth.uid()) and visibility = 'public')
);

-- likes
drop policy if exists "likes read" on public.likes;
create policy "likes read" on public.likes for select to authenticated using (public.is_active(auth.uid()));
drop policy if exists "likes insert own" on public.likes;
create policy "likes insert own" on public.likes for insert to authenticated with check (
  user_id = auth.uid() and public.is_active(auth.uid())
  and exists (select 1 from public.posts p where p.id = post_id and public.post_is_shared(p))
);
drop policy if exists "likes delete own" on public.likes;
create policy "likes delete own" on public.likes for delete to authenticated using (user_id = auth.uid());

-- ---------- 管理用の関数 ----------

-- 承認制に切り替えるときは、既存の参加者を「参加中」のまま保つ（status は変わらないので何もしない）。
-- 退会：自分のアカウントを丸ごと削除（写真はアプリ側で先に削除する）
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'ログインしていません'; end if;
  if public.is_admin(auth.uid()) and (select count(*) from public.profiles where role = 'admin') = 1
     and (select count(*) from public.profiles) > 1 then
    raise exception '管理者が自分しかいないため退会できません。先に別の人を管理者にしてください';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- 写真の保存場所（Storage） ----------
-- 非公開バケット。写真は「<ユーザーID>/<ファイル名>」に保存し、見るときは署名付きURLを使う。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "photos insert own folder" on storage.objects;
create policy "photos insert own folder" on storage.objects for insert to authenticated with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_active(auth.uid())
);

drop policy if exists "photos read" on storage.objects;
create policy "photos read" on storage.objects for select to authenticated using (
  bucket_id = 'photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      public.is_active(auth.uid())
      and exists (
        select 1 from public.posts p
        where p.photo_path = storage.objects.name
          and p.photo_hidden = false
          and public.post_is_shared(p)
      )
    )
  )
);

drop policy if exists "photos update own" on storage.objects;
create policy "photos update own" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photos delete own or admin" on storage.objects;
create policy "photos delete own or admin" on storage.objects for delete to authenticated using (
  bucket_id = 'photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin(auth.uid())
  )
);
