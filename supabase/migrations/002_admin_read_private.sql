-- 2026-11-19 追加：管理者が「自分だけ」の記録（写真以外）も見られるようにする
-- すでに schema.sql を実行済みのプロジェクトでは、これだけを SQL Editor で実行してください。
-- （schema.sql をもう一度まるごと実行しても同じ結果になります）
-- 写真は Storage のルールで、自分だけ・非公開の写真は本人しか取り出せないまま変わりません。

drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts for select to authenticated using (
  author = auth.uid()
  or (public.is_active(auth.uid()) and public.post_is_shared(posts))
  or public.is_admin(auth.uid())
);
