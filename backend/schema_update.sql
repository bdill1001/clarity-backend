-- Migration: Create Global Analysis Cache
-- This table stores artist-level AI assessment results for reuse across all users.

CREATE TABLE IF NOT EXISTS public.global_analyses (
    artist_id TEXT PRIMARY KEY,
    artist_name TEXT NOT NULL,
    ai_likelihood INTEGER NOT NULL CHECK (ai_likelihood >= 0 AND ai_likelihood <= 100),
    label TEXT NOT NULL,
    reasons TEXT[] NOT NULL,
    is_recognized_artist BOOLEAN DEFAULT false,
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_global_analyses_label ON public.global_analyses(label);

-- Enable RLS
ALTER TABLE public.global_analyses ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role has full access to global_analyses" 
    ON public.global_analyses FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Allow public read access (optional, if frontend needs to check cache directly)
CREATE POLICY "Allow public read access to global_analyses" 
    ON public.global_analyses FOR SELECT 
    USING (true);
