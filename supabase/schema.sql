-- ============================================================================
-- One Trip — Chat system Supabase schema / مخطط قاعدة بيانات الدردشة
-- ----------------------------------------------------------------------------
-- AR: مخطط موحّد للمحادثات والرسائل للتزامن عبر الأجهزة (web + WhatsApp).
--     آمن لإعادة التشغيل (idempotent): يمكن لصقه عدة مرات بدون أخطاء.
-- EN: Canonical conversations + messages schema for cross-device sync.
--     Idempotent: safe to paste/run multiple times.
--
-- JS <-> SQL mapping / التحويل بين JS و SQL:
--   msg.from      <-> sender
--   unreadAgent   <-> unread_agent
--   unreadUser    <-> unread_user
--   assignedTo    <-> assigned_to
--   createdAt     <-> created_at
--   updatedAt     <-> updated_at
--   (camelCase JS  <->  snake_case SQL)
--   Timestamps are bigint epoch milliseconds / الأوقات bigint بالملي ثانية.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Tables / الجداول
-- ----------------------------------------------------------------------------

-- AR: جدول المحادثات (محادثة لكل زائر/قناة).  EN: one row per conversation.
create table if not exists public.conversations (
  id           text primary key,
  name         text default 'زائر',          -- visitor display name / اسم الزائر
  phone        text default '',
  channel      text default 'web',            -- web | whatsapp ...
  status       text default 'open',           -- open | closed ...
  assigned_to  text,                           -- agent id / الموظف المسؤول
  unread_agent int  default 0,                 -- unread for agent / غير مقروء للموظف
  unread_user  int  default 0,                 -- unread for user  / غير مقروء للزائر
  created_at   bigint,                          -- epoch ms / ملي ثانية
  updated_at   bigint,                          -- epoch ms / ملي ثانية
  meta         jsonb default '{}'::jsonb        -- arbitrary metadata / بيانات إضافية
);

-- AR: جدول الرسائل.  EN: messages, FK -> conversations (cascade delete).
create table if not exists public.messages (
  id              text primary key,
  conversation_id text references public.conversations(id) on delete cascade,
  sender          text,                          -- maps JS msg.from / يقابل msg.from
  text            text,
  type            text default 'text',           -- text | image | system ...
  data            jsonb,                          -- payload for non-text / حمولة
  ts              bigint,                          -- epoch ms / ملي ثانية
  read            boolean default false
);

-- AR: فهرس للقراءة الزمنية داخل المحادثة.  EN: index for ordered reads.
create index if not exists messages_conversation_id_ts_idx
  on public.messages (conversation_id, ts);


-- ----------------------------------------------------------------------------
-- Realtime / البث اللحظي
-- AR: أضف الجدولين لمنشور Realtime (idempotent عبر DO block).
-- EN: add both tables to the supabase_realtime publication (guarded).
-- ----------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
end $$;


-- ----------------------------------------------------------------------------
-- Row Level Security / أمان مستوى الصف (RLS)
-- ----------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- ============================================================================
-- DEMO policies / سياسات تجريبية
-- ⚠️ AR: مفتوحة بالكامل لـ anon (select/insert/update) — للتجربة فقط، غير آمنة للإنتاج.
-- ⚠️ EN: fully open to anon (select/insert/update) — DEMO ONLY, NOT for production.
-- ============================================================================

-- conversations
drop policy if exists demo_anon_select_conversations on public.conversations;
create policy demo_anon_select_conversations on public.conversations
  for select to anon using (true);

drop policy if exists demo_anon_insert_conversations on public.conversations;
create policy demo_anon_insert_conversations on public.conversations
  for insert to anon with check (true);

drop policy if exists demo_anon_update_conversations on public.conversations;
create policy demo_anon_update_conversations on public.conversations
  for update to anon using (true) with check (true);

-- messages
drop policy if exists demo_anon_select_messages on public.messages;
create policy demo_anon_select_messages on public.messages
  for select to anon using (true);

drop policy if exists demo_anon_insert_messages on public.messages;
create policy demo_anon_insert_messages on public.messages
  for insert to anon with check (true);

drop policy if exists demo_anon_update_messages on public.messages;
create policy demo_anon_update_messages on public.messages
  for update to anon using (true) with check (true);


-- ============================================================================
-- ⚠️ PRODUCTION — tighter example policies (COMMENTED OUT) / سياسات إنتاج أكثر تشدّدًا
-- ----------------------------------------------------------------------------
-- AR: في الإنتاج: احذف سياسات demo_anon_* أعلاه، واجعل كل الكتابة عبر service_role
--     من السيرفر فقط، واقصر قراءة الزائر على محادثته (عبر phone/session في JWT claims).
-- EN: In production: DROP the demo_anon_* policies above. Writes go through the
--     server's service_role only (service_role bypasses RLS). Scope visitor reads
--     to their own conversation via a phone/session claim in the JWT.
--
-- -- 1) Remove demo policies:
-- drop policy if exists demo_anon_select_conversations on public.conversations;
-- drop policy if exists demo_anon_insert_conversations on public.conversations;
-- drop policy if exists demo_anon_update_conversations on public.conversations;
-- drop policy if exists demo_anon_select_messages on public.messages;
-- drop policy if exists demo_anon_insert_messages on public.messages;
-- drop policy if exists demo_anon_update_messages on public.messages;
--
-- -- 2) No anon INSERT/UPDATE policies at all => anon cannot write.
-- --    The WhatsApp/server uses the service_role key which BYPASSES RLS.
--
-- -- 3) Visitor read scoped by phone/session (claim set when minting the anon JWT):
-- --    e.g. request.jwt.claims ->> 'phone'  or  ->> 'session_id'
-- create policy prod_visitor_read_own_conversation on public.conversations
--   for select to anon
--   using ( phone = (auth.jwt() ->> 'phone') );
--
-- create policy prod_visitor_read_own_messages on public.messages
--   for select to anon
--   using (
--     conversation_id in (
--       select id from public.conversations
--       where phone = (auth.jwt() ->> 'phone')
--     )
--   );
-- ============================================================================
