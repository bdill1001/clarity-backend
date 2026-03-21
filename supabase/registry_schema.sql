-- Create the ENUM types for statuses and votes
CREATE TYPE registry_status AS ENUM ('pending', 'confirmed_ai', 'confirmed_human', 'disputed');
CREATE TYPE user_vote_type AS ENUM ('HUMAN', 'AI', 'UNSURE');

-- Create Artist Registry Table
-- This table is the central source of truth for crowd-sourced AI intelligence.
CREATE TABLE artist_registry (
  artist_id text PRIMARY KEY,
  artist_name text NOT NULL,
  status registry_status DEFAULT 'pending',
  trust_score integer DEFAULT 0,
  ai_analysis_score integer DEFAULT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Protect innocent artists from being immediately banned by rogue flags
-- The status transitions via backend triggers or logic based on trust_score.
-- +10 means confirmed_ai, <= -5 means confirmed_human.

-- Create User Votes Table
-- Tracks individual votes to prevent duplicate spamming from the community.
CREATE TABLE user_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id text REFERENCES artist_registry(artist_id) ON DELETE CASCADE,
  track_id text NOT NULL,
  vote user_vote_type NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, artist_id) -- Prevent users from voting multiple times on the same artist
);

-- Alternatively, if we don't have auth.users setup matching our app's ID format yet, 
-- we can change user_id to text if we are just using spotify IDs.
-- Let's define user_id as text:
ALTER TABLE user_votes DROP CONSTRAINT user_votes_user_id_fkey;
ALTER TABLE user_votes ALTER COLUMN user_id TYPE text;

-- Add RLS Policies
ALTER TABLE artist_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_votes ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access to the registry (we handle auth manually in backend)
CREATE POLICY "Allow public read access to registry" ON artist_registry FOR SELECT USING (true);

-- The Node.js backend uses a SERVICE_ROLE key, which inherently bypasses RLS policies entirely.
-- Therefore, these tables are secure. No INSERT/UPDATE policies needed for public.

-- Create trigger to automatically update updated_at timestamp on artist_registry
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON artist_registry
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();
