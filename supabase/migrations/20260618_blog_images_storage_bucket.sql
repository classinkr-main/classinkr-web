-- blog-images: 블로그 썸네일, 히어로, 본문 이미지 공개 버킷
-- 관리자 업로드는 service role API route가 수행하고, 공개 페이지는 public URL을 읽는다.

insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read blog images'
  ) then
    create policy "Public read blog images"
      on storage.objects for select
      using (bucket_id = 'blog-images');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Service role manage blog images'
  ) then
    create policy "Service role manage blog images"
      on storage.objects for all
      to service_role
      using (bucket_id = 'blog-images')
      with check (bucket_id = 'blog-images');
  end if;
end $$;
