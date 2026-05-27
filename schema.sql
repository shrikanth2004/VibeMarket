-- Supabase Database Schema for VibeMarket
-- Copy and paste this script into your Supabase project's SQL Editor and run it.

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Clean up existing tables if any (use with caution in production)
-- drop table if exists public.notifications cascade;
-- drop table if exists public.comments cascade;
-- drop table if exists public.reviews cascade;
-- drop table if exists public.wishlists cascade;
-- drop table if exists public.products cascade;
-- drop table if exists public.profiles cascade;

-- 1. Profiles Table (linked to Auth.Users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.profiles enable row level security;

-- Profiles Policies
create policy "Public profiles are viewable by everyone" on public.profiles
  for select using (true);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- Trigger to automatically create a profile for new auth.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    'user'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Recreate trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Products Table
create table public.products (
  id uuid default gen_random_uuid() primary key,
  seller_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text not null,
  category text not null,
  price numeric(12, 2) not null check (price >= 0),
  condition text not null check (condition in ('New', 'Like New', 'Good', 'Fair')),
  location text not null,
  images text[] default '{}' not null,
  is_approved boolean default true not null,
  status text not null default 'active' check (status in ('active', 'sold', 'reserved', 'draft')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for Products
alter table public.products enable row level security;

-- Products Policies
create policy "Products are viewable by everyone" on public.products
  for select using (is_approved = true or (auth.uid() = seller_id) or (exists (
    select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'
  )));

create policy "Authenticated users can insert products" on public.products
  for insert with check (auth.uid() = seller_id);

create policy "Sellers or admins can update products" on public.products
  for update using (auth.uid() = seller_id or (exists (
    select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'
  )));

create policy "Sellers or admins can delete products" on public.products
  for delete using (auth.uid() = seller_id or (exists (
    select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'
  )));

-- 3. Wishlists Table (Favorites)
create table public.wishlists (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, product_id)
);

-- Enable RLS
alter table public.wishlists enable row level security;

create policy "Users can view their own wishlist" on public.wishlists
  for select using (auth.uid() = user_id);

create policy "Users can add to their own wishlist" on public.wishlists
  for insert with check (auth.uid() = user_id);

create policy "Users can remove from their own wishlist" on public.wishlists
  for delete using (auth.uid() = user_id);

-- 4. Reviews Table (Ratings & Text Review)
create table public.reviews (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.reviews enable row level security;

create policy "Reviews are viewable by everyone" on public.reviews
  for select using (true);

create policy "Authenticated users can insert reviews" on public.reviews
  for insert with check (auth.uid() = user_id);

create policy "Review authors or admins can delete reviews" on public.reviews
  for delete using (auth.uid() = user_id or (exists (
    select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'
  )));

-- 5. Comments Table (Discussion Chat per Product)
create table public.comments (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.comments enable row level security;

create policy "Comments are viewable by everyone" on public.comments
  for select using (true);

create policy "Authenticated users can insert comments" on public.comments
  for insert with check (auth.uid() = user_id);

create policy "Comment authors or admins can delete comments" on public.comments
  for delete using (auth.uid() = user_id or (exists (
    select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'
  )));

-- 6. Notifications Table
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null, -- 'comment', 'review', 'product_update', 'system'
  title text not null,
  message text not null,
  is_read boolean default false not null,
  link_url text, -- optional link to the product or page
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.notifications enable row level security;

create policy "Users can view their own notifications" on public.notifications
  for select using (auth.uid() = user_id);

create policy "Users can update their own notifications (mark as read)" on public.notifications
  for update using (auth.uid() = user_id);

create policy "Anyone can insert notifications (to notify product owners)" on public.notifications
  for insert with check (true);

-- 7. Saved Searches (filters + price alerts)
create table public.saved_searches (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  label text,
  search text,
  category text,
  condition text,
  min_price numeric(12, 2),
  max_price numeric(12, 2),
  location text,
  sort_by text default 'newest',
  alert_enabled boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.saved_searches enable row level security;

create policy "Users can view own saved searches" on public.saved_searches
  for select using (auth.uid() = user_id);

create policy "Users can insert own saved searches" on public.saved_searches
  for insert with check (auth.uid() = user_id);

create policy "Users can update own saved searches" on public.saved_searches
  for update using (auth.uid() = user_id);

create policy "Users can delete own saved searches" on public.saved_searches
  for delete using (auth.uid() = user_id);

-- Storage: In Supabase Dashboard → Storage, create a bucket named `product-images`.
-- It can remain private; the API serves signed URLs to the frontend.


-- Run this in Supabase SQL Editor (adds listing status + saved searches)

-- 1. Listing status (active, sold, reserved, draft)
alter table public.products
  add column if not exists status text not null default 'active'
  check (status in ('active', 'sold', 'reserved', 'draft'));

create index if not exists products_status_idx on public.products (status);

-- 2. Saved searches & price alerts
create table if not exists public.saved_searches (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  label text,
  search text,
  category text,
  condition text,
  min_price numeric(12, 2),
  max_price numeric(12, 2),
  location text,
  sort_by text default 'newest',
  alert_enabled boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.saved_searches enable row level security;

create policy "Users can view own saved searches" on public.saved_searches
  for select using (auth.uid() = user_id);

create policy "Users can insert own saved searches" on public.saved_searches
  for insert with check (auth.uid() = user_id);

create policy "Users can update own saved searches" on public.saved_searches
  for update using (auth.uid() = user_id);

create policy "Users can delete own saved searches" on public.saved_searches
  for delete using (auth.uid() = user_id);

