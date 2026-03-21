import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const POLLING_INTERVAL_MS = 30000; // Poll every 30 seconds

// In-Memory Cache to prevent duplicate push notifications for same user+track
// Works well for prototype scaling. Clears on Render deployment/restarts.
const notifiedTracksCache = new Set();

// External Clients
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || '' // Use Service Role Key to bypass RLS
);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

// --- API Endpoints ---

// Health check
app.get('/', (req, res) => res.send('Clarity Backend Worker is running.'));

// --- Registry Helpers ---
async function updateRegistryFromAnalysis(artistId, artistName, aiLikelihood) {
  let points = 0;
  if (aiLikelihood > 85) points = 10;
  else if (aiLikelihood < 15) points = -10;
  
  if (points !== 0) {
    const { data: existing } = await supabase.from('artist_registry').select('*').eq('artist_id', artistId).maybeSingle();
    let trustScore = existing ? existing.trust_score : 0;
    
    // Only apply the 10-point AI swing ONCE per artist to avoid infinite scaling
    if (!existing || existing.ai_analysis_score === null) {
       trustScore += points;
       let status = 'pending';
       if (trustScore >= 10) status = 'confirmed_ai';
       if (trustScore <= -5) status = 'confirmed_human';
       // We leave disputed logic to the voting route since AI only sets this once
       
       await supabase.from('artist_registry').upsert({
         artist_id: artistId,
         artist_name: artistName,
         ai_analysis_score: points,
         trust_score: trustScore,
         status: status
       }, { onConflict: 'artist_id' });
       console.log(`[Registry] Auto-applied ${points} points for ${artistName} from Gemini analysis.`);
    }
  }
}

// Register / Update User Endpoint
// The React Native app calls this after Spotify OAuth completes
app.post('/api/register', async (req, res) => {
  const { spotifyId, accessToken, refreshToken, expoPushToken } = req.body;

  if (!spotifyId || !accessToken || !refreshToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .upsert({
        spotify_id: spotifyId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expo_push_token: expoPushToken || null,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'spotify_id' })
      .select();

    if (error) throw error;
    res.json({ success: true, user: data[0] });
  } catch (err) {
    console.error('[Register] DB Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Manual Analysis Endpoint for Frontend UI
app.post('/api/analyze', async (req, res) => {
  const { trackId, artistId, trackName, artistName, accessToken } = req.body;
  
  if (!trackId || !artistId || !accessToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    console.log(`[Analyze] Manual analysis requested for: ${trackName} by ${artistName} (ID: ${artistId})`);
    
    // 0.5 Check Community Registry First
    const { data: registryItem } = await supabase
      .from('artist_registry')
      .select('*')
      .eq('artist_id', artistId)
      .maybeSingle();

    if (registryItem) {
      if (registryItem.status === 'confirmed_ai') {
        console.log(`[Analyze] Registry HIT (AI) for: ${artistName}`);
        return res.json({
          trackId: trackId,
          aiLikelihood: 98,
          label: 'Likely AI',
          reasons: ['Crowd-Sourced Consensus: Confirmed AI via Clarity Registry'],
          reasonCodes: ['COMMUNITY_VERIFIED'],
          analyzedAt: new Date().toISOString()
        });
      }
      if (registryItem.status === 'confirmed_human') {
        console.log(`[Analyze] Registry HIT (Human) for: ${artistName}`);
        return res.json({
          trackId: trackId,
          aiLikelihood: 2,
          label: 'Likely Human',
          reasons: ['Crowd-Sourced Consensus: Confirmed Human via Clarity Registry'],
          reasonCodes: ['COMMUNITY_VERIFIED'],
          analyzedAt: new Date().toISOString()
        });
      }
    }

    // 1. Check Global Cache First
    const { data: cached, error: cacheError } = await supabase
      .from('global_analyses')
      .select('*')
      .eq('artist_id', artistId)
      .maybeSingle();

    if (cached && !cacheError) {
      console.log(`[Analyze] Cache HIT for artist: ${artistName}. Skipping Gemini.`);
      return res.json({
        trackId: trackId,
        aiLikelihood: cached.ai_likelihood,
        label: cached.label,
        reasons: cached.reasons,
        reasonCodes: ['CACHED_RESULT'],
        analyzedAt: cached.analyzed_at
      });
    }

    console.log(`[Analyze] Cache MISS for artist: ${artistName}. Executing Forensic Engine...`);

    // 2. Fetch telemetry
    const [artistData, totalReleases, relatedArtistCount, playlists] = await Promise.all([
      getArtistData(accessToken, artistId),
      getArtistAlbums(accessToken, artistId),
      getRelatedArtists(accessToken, artistId),
      searchPlaylists(accessToken, trackName, artistName)
    ]);

    const dossier = { trackName, artistName, artistData, relatedArtistCount, totalReleases, playlists };

    // 3. Run AI analysis
    const analysis = await analyzeTrackWithAI(dossier);
    if (!analysis) throw new Error("Gemini returned null analysis object");

    // 4. Save to Global Cache
    const { error: saveError } = await supabase
      .from('global_analyses')
      .upsert({
        artist_id: artistId,
        artist_name: artistName,
        ai_likelihood: analysis.aiLikelihood,
        label: analysis.label,
        reasons: analysis.reasons,
        is_recognized_artist: analysis.isRecognizedArtist || false,
        updated_at: new Date().toISOString()
      }, { onConflict: 'artist_id' });

    if (saveError) console.error('[Analyze] Failed to save to cache:', saveError.message);
    
    // 4.5 Auto-update Registry with heavy AI weight
    await updateRegistryFromAnalysis(artistId, artistName, analysis.aiLikelihood);

    // 5. Respond
    const result = {
      trackId: trackId,
      aiLikelihood: analysis.aiLikelihood,
      label: analysis.label,
      reasons: analysis.reasons,
      reasonCodes: ['AI_ASSESSMENT_COMPLETE'],
      analyzedAt: new Date().toISOString()
    };

    res.json(result);
  } catch (err) {
    console.error('[Analyze] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Registry Endpoints ---

app.post('/api/registry/vote', async (req, res) => {
  const { userId, artistId, artistName, trackId, vote } = req.body;
  if (!userId || !artistId || !trackId || !vote) return res.status(400).json({ error: 'Missing fields' });
  
  try {
     const { error: voteErr } = await supabase.from('user_votes').insert({ user_id: userId, artist_id: artistId, track_id: trackId, vote });
     if (voteErr) {
        if (voteErr.code === '23505') return res.status(400).json({ error: 'User already voted for this artist' });
        throw voteErr;
     }
     
     let points = vote === 'AI' ? 1 : (vote === 'HUMAN' ? -2 : 0);
     if (points === 0) return res.json({ success: true });
     
     const { data: existing } = await supabase.from('artist_registry').select('*').eq('artist_id', artistId).maybeSingle();
     let trustScore = (existing ? existing.trust_score : 0) + points;
     let aiScore = existing ? existing.ai_analysis_score : null;
     let status = existing ? existing.status : 'pending';
     
     // Deep Analysis Protocol (Disputes)
     if (aiScore === -10 && trustScore >= 0) status = 'disputed';
     else if (aiScore === 10 && trustScore <= 0) status = 'disputed';
     else if (trustScore >= 10 && status !== 'disputed') status = 'confirmed_ai';
     else if (trustScore <= -5 && status !== 'disputed') status = 'confirmed_human';
     
     await supabase.from('artist_registry').upsert({
       artist_id: artistId,
       artist_name: artistName,
       trust_score: trustScore,
       status: status,
       updated_at: new Date().toISOString()
     }, { onConflict: 'artist_id' });
     
     res.json({ success: true, newStatus: status, newScore: trustScore });
  } catch (err) {
     console.error('[Registry Vote] Error:', err.message);
     res.status(500).json({ error: err.message });
  }
});

app.post('/api/registry/submit', async (req, res) => {
  const { url, accessToken } = req.body;
  if (!url || !accessToken) return res.status(400).json({ error: 'Missing fields' });
  
  try {
    const match = url.match(/spotify\.com\/(track|artist)\/([a-zA-Z0-9]+)/);
    if (!match) return res.status(400).json({ error: 'Invalid Spotify URL' });
    const type = match[1];
    const id = match[2];
    
    let trackData;
    if (type === 'track') {
       const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${id}`, { headers: { Authorization: `Bearer ${accessToken}` }});
       if (!trackRes.ok) return res.status(400).json({ error: 'Failed to fetch track' });
       trackData = await trackRes.json();
    } else if (type === 'artist') {
       const topRes = await fetch(`https://api.spotify.com/v1/artists/${id}/top-tracks?market=US`, { headers: { Authorization: `Bearer ${accessToken}` }});
       if (!topRes.ok) {
           if (topRes.status === 403 || topRes.status === 404 || topRes.status === 429) {
               console.log(`[Registry Submit] Caught ${topRes.status} for artist ${id}. Generating mock track...`);
               const artistRes = await fetch(`https://api.spotify.com/v1/artists/${id}`, { headers: { Authorization: `Bearer ${accessToken}` }});
               
               let artistName = `Unknown Artist (${id})`;
               if (artistRes.ok) {
                   const artistData = await artistRes.json();
                   artistName = artistData.name || artistName;
               } else {
                   console.warn(`[Registry Submit] Could not fetch artist name either. Status: ${artistRes.status}`);
               }
               
               trackData = {
                  id: `shadowbanned_${id}`,
                  name: "[Tracks Unavailable - Region Locked or Removed]",
                  artists: [{ id: id, name: artistName }]
               };
           } else {
               const errText = await topRes.text();
               console.error('[Registry Submit] Spotify API Error:', errText);
               return res.status(400).json({ error: `Failed to fetch artist tracks: ${topRes.status} ${errText}` });
           }
       } else {
           const topData = await topRes.json();
           if (!topData.tracks || topData.tracks.length === 0) return res.status(400).json({ error: 'Artist has no playable tracks' });
           trackData = topData.tracks[0];
       }
    }
    
    res.json({
       trackId: trackData.id,
       artistId: trackData.artists[0].id,
       trackName: trackData.name,
       artistName: trackData.artists[0].name
    });
  } catch (err) {
    console.error('[Registry Submit] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/registry/list', async (req, res) => {
  try {
    const { data: artists, error } = await supabase
      .from('artist_registry')
      .select('artist_id, artist_name, trust_score')
      .eq('status', 'confirmed_ai')
      .order('trust_score', { ascending: false });
      
    if (error) throw error;
    res.json(artists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Spotify API Utilities ---

async function refreshSpotifyToken(userId, refreshToken) {
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: SPOTIFY_CLIENT_ID
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`[Spotify] Failed to refresh token for user ${userId}:`, data);
      return null;
    }

    // Update DB with new token
    await supabase.from('users').update({
      access_token: data.access_token,
      ...(data.refresh_token && { refresh_token: data.refresh_token }), // Update refresh token if a new one is provided
      updated_at: new Date().toISOString()
    }).eq('id', userId);

    return data.access_token;
  } catch (err) {
    console.error(`[Spotify] Error refreshing token for ${userId}:`, err.message);
    return null;
  }
}

async function getCurrentlyPlaying(accessToken) {
  const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (response.status === 204) return null; // Nothing playing
  if (response.status === 401) throw new Error('Token expired');
  if (!response.ok) return null;

  return response.json();
}

async function getArtistData(accessToken, artistId) {
  if (!artistId) return null;
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  return response.json();
}

async function getArtistAlbums(accessToken, artistId) {
  if (!artistId) return 0;
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return 0;
  const data = await response.json();
  return data.total || 0;
}

async function getRelatedArtists(accessToken, artistId) {
  if (!artistId) return null;
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/related-artists`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.artists ? data.artists.length : 0;
}

async function searchPlaylists(accessToken, trackName, artistName) {
  const query = encodeURIComponent(`track:${trackName} artist:${artistName}`);
  const response = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=playlist&limit=5`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.playlists?.items?.map(p => p.name) || [];
}

// --- AI Analysis ---

async function analyzeTrackWithAI(dossier) {
  try {
    const { trackName, artistName, artistData, relatedArtistCount, totalReleases, playlists } = dossier;
    
    // Extract metadata safely
    const followers = artistData?.followers?.total || 0;
    const popularity = artistData?.popularity || 0;
    const genres = artistData?.genres || [];
    const images = artistData?.images || [];
    const profileImageUrl = images.length > 0 ? images[0].url : "No image available";

    const promptText = `
=== CLARITY AI DETECTION DOSSIER ===
Track Name: "${trackName}"
Artist Name: "${artistName}"

== Spotify API Telemetry ==
Total Releases (Albums/Singles): ${totalReleases}
Artist Genres: ${genres.length > 0 ? genres.join(', ') : 'None listed'}
Related Artists Count: ${relatedArtistCount} (Crucial human indicator, if available)
Public Playlists Found via Search: ${playlists.length > 0 ? playlists.join(' | ') : 'None found'}
Profile Image URL: ${profileImageUrl}

== INSTRUCTIONS (THE SIX PILLARS OF ASSESSMENT) ==
You are an expert music industry analyst specializing in detecting synthetic/AI-generated music (e.g., Suno, Udio) exploiting streaming platforms.
Analyze the provided dossier across the following pillars:

1. Internal LLM Knowledge (PRIMARY PILLAR): Search your core training data. Do you recognize "${artistName}" as a real, established human musician? If the artist is highly famous (e.g., Post Malone, Kendrick Lamar, Taylor Swift) or a known indie act, classify as 'Likely Human' immediately.
2. Release Velocity: Generative AI farms prioritize quantity over quality. If an obscure artist has a massive volume of releases (e.g., > 50) but 0 related artists and no playlist presence, this is highly indicative of an AI farm flooding the platform.
3. Semantic Patterns: Does the artist name follow compound AI pseudonyms (e.g., "Luna Echo", "Static Wave")? Note: Trendy human names (e.g., "Aria Chen", "Kai Rivers") occupy a gray area. **CRITICAL:** A suspicious name pattern ALONE is not enough for 'Likely AI'; it MUST be corroborated by another forensic pillar.
4. Multimodal Visual Assessment: Analyze the provided Profile Image URL. Are there classic AI generation artifacts (DALL-E/Midjourney plastic skin, asymmetrical features, garbled text)? Note: Using AI art does not guarantee the music is AI, but it is a strong data point.
5. THE NUCLEAR INNOCENCE RULE: If you do not explicitly recognize this artist from your training data, YOU MUST DEFAULT to 'Unsure' or 'Likely Human' to protect obscure human artists. The ONLY exceptions allowing a 'Likely AI' classification are if the "Forensic Corroboration Gate" is met (At least TWO of the following signals must be positive):
   A) The artist name fits a synthetic/generated pattern (Rule 3).
   B) The Profile Image contains EGREGIOUS, undeniable AI-generation hallmarks (Rule 4).
   C) High Release Frequency (Rule 2): Specifically, a sustained density of >3 tracks per month recently (NOT just lifetime total).
   D) Void of Existence (Rule 6): Absolutely zero social media or biographical data found via Search.
6. GOOGLE SEARCH GROUNDING (THE ULTIMATE TIEBREAKER): You are equipped with Google Search. If an artist is unknown, YOU MUST search the web for their name. You are looking for TWO things:
   - A human footprint: A real indie human will almost ALWAYS have an Instagram, Bandcamp, TikTok, or local gig listed. However, brand new humans might not have a strong Web Presence yet. If an artist has official streaming releases but ABSOLUTELY ZERO human social media footprint OR biographical data anywhere on the internet, they MIGHT be a mass-produced AI farm.
   - Public Exposure: Search explicitly for Reddit threads or music forum posts discussing if "${artistName}" is AI. **GATE:** You require at least TWO independent sources or ONE highly authoritative source (e.g., music journalism) before using this as a decisive override.
7. THE HYBRID IDENTITY RULE: Our goal is to detect synthetic *audio*. If Google Search reveals that an artist is a real, verified human, but they are explicitly using generative AI (Suno, Udio, Voice Clones) to create the *music or vocals* for this track, you MUST flag it as 'Likely AI'. A human identity does NOT protect synthetic audio.
8. NETWORK VERIFICATION (RELATED ARTISTS): If related artists are found, check if their profiles are also "ghostly" (0 followers, AI art, no genres). If the related network looks like an automated "AI Cluster," ignore the related-artist signal as a human indicator.

Gating Guardrails:
- Nuclear Innocence Rule: If you do not explicitly recognize this artist, DEFAULT to 'Unsure' or 'Likely Human'. You would rather miss an AI artist than falsely accuse a real human. However, if EGREGIOUS AI visual artifacts are present, the gate is lowered.
- Name Isolation: Do not guess 'Likely AI' solely because a name sounds trendy (e.g., "Lyla Vale").
- Lifetime vs. Density: High lifetime releases over many years (DIY musicians) is NOT a penalty; focus on RECENT upload density.
- Formulate a 1-2 sentence compelling reason. Speak to the music fan in a friendly style.
Return ONLY a strict JSON object:
{
  "aiLikelihood": 0-100 (integer),
  "isRecognizedArtist": true/false,
  "label": "Likely Human" | "Unsure" | "Likely AI",
  "reasons": ["1-2 sentences explaining reasoning"]
}

}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [
        {
          role: 'user',
          parts: [{ text: promptText }]
        }
      ],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.0
      }
    });

    const responseText = response.text;
    if (!responseText) throw new Error("Empty response from Gemini");

    let textResp = responseText;
    textResp = textResp.replace(/```json/g, '').replace(/```/g, '').trim();
    const analysis = JSON.parse(textResp);
    return analysis;
  } catch (error) {
    console.error('[Gemini] Analysis failed:', error.message);
    throw new Error(`[Gemini] ${error.message}`);
  }
}

// --- Background Polling Worker ---

let isWorkerRunning = false;

async function pollUsers() {
  if (isWorkerRunning) {
    console.log(`[Worker] Previous polling cycle still running. Skipping this tick.`);
    return;
  }
  isWorkerRunning = true;
  
  try {
    console.log(`[Worker] Starting polling cycle at ${new Date().toISOString()}...`);

  // 1. Fetch active users
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true);

  if (error || !users) {
    console.error('[Worker] Failed to fetch users:', error);
    return;
  }

  // 2. Poll each user (in parallel with simple Promise.all, or sequentially for massive scaling)
  for (const user of users) {
    try {
      let token = user.access_token;
      let playingData;

      try {
        playingData = await getCurrentlyPlaying(token);
      } catch (err) {
        if (err.message === 'Token expired') {
          console.log(`[Worker] Token expired for ${user.id}, refreshing...`);
          token = await refreshSpotifyToken(user.id, user.refresh_token);
          if (!token) continue; // Skip to next user if refresh failed
          playingData = await getCurrentlyPlaying(token);
        } else {
          continue;
        }
      }

      // If nothing is playing or it's not a track, skip
      if (!playingData || !playingData.is_playing || playingData.currently_playing_type !== 'track') {
        continue;
      }

      const track = playingData.item;
      const trackId = track.id;

      // Skip if we already analyzed this track for this user
      if (trackId === user.last_analyzed_track_id) {
        continue;
      }

      const trackName = track.name;
      const artistName = track.artists.map(a => a.name).join(', ');

      console.log(`[Worker] User ${user.id} playing NEW track: "${trackName}" by ${artistName}. Gathering intelligence...`);

      // 3. Gather Intelligence Dossier
      const artistId = track.artists[0]?.id;
      let artistData = null;
      let relatedArtistCount = 0;
      let playlists = [];

      if (artistId) {
        artistData = await getArtistData(token, artistId);
        
        // Pillar 1: Fast-Path Whitelist Check & Guardrails
        if (artistData) {
          const followers = artistData.followers?.total || 0;
          const popularity = artistData.popularity || 0;
          const genres = artistData.genres || [];
          
          if (followers > 500000 || popularity > 80) {
            relatedArtistCount = await getRelatedArtists(token, artistId);
            if (genres.length >= 3 && relatedArtistCount >= 5) {
              console.log(`[Worker] FAST-PATH WHITELIST TRIGGERED for ${artistName}. Skipping AI analysis.`);
              await supabase.from('users').update({ last_analyzed_track_id: trackId }).eq('id', user.id);
              continue;
            }
          }
        }
      }

      // If related artists weren't fetched during the fast-path check, do it now
      if (artistId && relatedArtistCount === 0) {
        relatedArtistCount = await getRelatedArtists(token, artistId);
      }

      let totalReleases = 0;
      if (artistId) {
        totalReleases = await getArtistAlbums(token, artistId);
      }

      playlists = await searchPlaylists(token, trackName, artistName);

      const dossier = {
        trackName,
        artistName,
        artistData,
        relatedArtistCount,
        totalReleases,
        playlists
      };

      // 3.5 Check Community Registry first
      let analysis = null;
      if (artistId) {
        const { data: registryItem } = await supabase.from('artist_registry').select('*').eq('artist_id', artistId).maybeSingle();
        if (registryItem) {
          if (registryItem.status === 'confirmed_ai') {
            console.log(`[Worker] Registry HIT (AI) for: ${artistName}. Skipping Gemini.`);
            analysis = { aiLikelihood: 98, label: 'Likely AI', reasons: ['Crowd-Sourced Consensus: Confirmed AI via Clarity Registry'], isRecognizedArtist: false };
          } else if (registryItem.status === 'confirmed_human') {
            console.log(`[Worker] Registry HIT (Human) for: ${artistName}. Skipping Gemini.`);
            analysis = { aiLikelihood: 2, label: 'Likely Human', reasons: ['Crowd-Sourced Consensus: Confirmed Human via Clarity Registry'], isRecognizedArtist: true };
          }
        }
      }

      // 3.6 Check Global Cache first (if not in Registry)
      if (!analysis && artistId) {
        const { data: cached } = await supabase
          .from('global_analyses')
          .select('*')
          .eq('artist_id', artistId)
          .maybeSingle();
          
        if (cached) {
          console.log(`[Worker] Cache HIT for artist: ${artistName}. Skipping Gemini.`);
          analysis = {
            aiLikelihood: cached.ai_likelihood,
            label: cached.label,
            reasons: cached.reasons,
            isRecognizedArtist: cached.is_recognized_artist
          };
        }
      }

      if (!analysis) {
        console.log(`[Worker] Interrogating Gemini for "${trackName}"...`);
        // 4. Analyze Track
        analysis = await analyzeTrackWithAI(dossier);
        
        // Save to Global Cache
        if (analysis && artistId) {
          await supabase.from('global_analyses').upsert({
            artist_id: artistId,
            artist_name: artistName,
            ai_likelihood: analysis.aiLikelihood,
            label: analysis.label,
            reasons: analysis.reasons,
            is_recognized_artist: analysis.isRecognizedArtist || false,
            updated_at: new Date().toISOString()
          }, { onConflict: 'artist_id' });
          
          await updateRegistryFromAnalysis(artistId, artistName, analysis.aiLikelihood);
        }
      }

      // Update DB to mark track as analyzed
      await supabase.from('users').update({ last_analyzed_track_id: trackId }).eq('id', user.id);

      // 5. Send Notification if highly suspicious
      if (analysis && analysis.aiLikelihood >= 65 && user.expo_push_token) {
        // Use expo_push_token in cache key to prevent duplicates if user has multiple DB rows
        const cacheKey = `${user.expo_push_token}_${trackId}`;
        if (!notifiedTracksCache.has(cacheKey)) {
          console.log(`[Worker] AI Track Detected for ${user.id}! Sending Push Notification.`);
          notifiedTracksCache.add(cacheKey);

          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: user.expo_push_token,
              title: '🤖 AI Track Detected',
              body: `Clarity detected that "${trackName}" by ${artistName} is likely generated by AI.`,
              data: { trackId, analysis },
            }),
          });
        } else {
          console.log(`[Worker] Push already sent for ${cacheKey}. Skipping.`);
        }
      }

    } catch (userErr) {
      console.error(`[Worker] Error processing user ${user.id}:`, userErr.message);
    }
  }
  
  } finally {
    isWorkerRunning = false;
  }
}

// --- Start the Server & Loop ---

app.listen(PORT, () => {
  console.log(`[Server] Clarity Backend listening on port ${PORT}`);

  // Start the polling loop immediately, then execute every POLLING_INTERVAL_MS
  pollUsers();
  setInterval(pollUsers, POLLING_INTERVAL_MS);
});
