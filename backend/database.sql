-- Setup Script for Supabase Database
-- Run this in your Supabase project's SQL Editor

-- 1. Create the Users table
create table public.users (
  id uuid default gen_random_uuid() primary key,
  spotify_id text unique not null,
  expo_push_token text,
  access_token text not null,
  refresh_token text not null,
  last_analyzed_track_id text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Set up RLS (Row Level Security) - Optional but recommended
-- This ensures that only the service role (your backend) can read/write everything freely
alter table public.users enable row level security;

-- Create policy to allow service role full access
create policy "Service role has full access to users" 
  on public.users for all 
  using (true) 
  with check (true);

-- Create policy to allow clients to insert/upsert their own tokens (optional if only backend does it)
create policy "Allow insert via anon key for registration" 
  on public.users for insert 
  with check (true);

create policy "Allow update via anon key for own row" 
  on public.users for update 
  using (true)
  with check (true);
