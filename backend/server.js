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
    console.log(`[Analyze] Manual analysis requested for: ${trackName} by ${artistName}`);
    
    // Fetch telemetry
    const [artistData, totalReleases, relatedArtistCount, playlists] = await Promise.all([
      getArtistData(accessToken, artistId),
      getArtistAlbums(accessToken, artistId),
      getRelatedArtists(accessToken, artistId),
      searchPlaylists(accessToken, trackName, artistName)
    ]);

    const dossier = { trackName, artistName, artistData, relatedArtistCount, totalReleases, playlists };

    // Run AI analysis
    const analysis = await analyzeTrackWithAI(dossier);
    if (!analysis) throw new Error("Gemini returned null analysis");

    // Format like the frontend expects
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

// --- Spotify API Utilities ---

async function refreshSpotifyToken(userId, refreshToken) {
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
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
3. Semantic Patterns: Does the artist name follow compound AI pseudonyms (e.g., "Luna Echo", "Static Wave")? Do the playlists mentioning them have names like "AI Music", "Suno", or "Udio"?
4. Multimodal Visual Assessment: Analyze the provided Profile Image URL. Are there classic AI generation artifacts (DALL-E/Midjourney plastic skin, asymmetrical features, garbled text)? Note: Using AI art does not guarantee the music is AI, but it is a strong data point.
5. THE NUCLEAR INNOCENCE RULE: If you do not explicitly recognize this artist from your training data, YOU MUST DEFAULT to 'Uncertain' or 'Likely Human' to protect obscure human artists. The ONLY exceptions allowing a 'Likely AI' classification are: 
A) The artist name explicitly contains AI markers (e.g., "Suno", "Udio", "AI Music").
B) The Profile Image contains EGREGIOUS, undeniable AI-generation hallmarks (specifically: mangled/garbled text attempting to look like English, impossible anatomy, or highly generic synthetic artifacts). Stylized cartoon/vector art is common for humans—only override this failsafe if the AI artifacting is objective and overwhelming.
C) High Release Velocity (See Rule 2): If the artist has a massive number of releases but zero footprint.
D) Grounded Search Verification: (SEE RULE 6)
6. GOOGLE SEARCH GROUNDING (THE ULTIMATE TIEBREAKER): You are equipped with Google Search. If an artist is unknown, YOU MUST search the web for their name. You are looking for TWO things:
   - A human footprint: A real indie human will almost ALWAYS have an Instagram, Bandcamp, TikTok, or local gig listed. If an artist has official streaming releases but ABSOLUTELY ZERO human social media footprint or biographical data anywhere on the internet, they are a mass-produced AI farm. 
   - Public Exposure: Search explicitly for Reddit threads or music forum posts discussing if "${artistName}" is AI. If the artist has been "outed" by the community as a synthetic farm, you MUST classify as 'Likely AI'.
If either the "void of existence" or public exposure is confirmed via search, you MAY OVERRIDE the Nuclear Innocence Rule and classify as 'Likely AI' (90%+).
7. THE HYBRID IDENTITY RULE: Our goal is to detect synthetic *audio*. If Google Search reveals that an artist is a real, verified human, but they are explicitly using generative AI (Suno, Udio, Voice Clones) to create the *music or vocals* for this track, you MUST flag it as 'Likely AI'. A human identity does NOT protect synthetic audio.

Gating Guardrails:
- Many genuine human indie artists start with 0 genres. Do not flag as AI *solely* for being unpopular.
- Stylized names (DeadMau5) do not mean AI.
- Formulate a 1-2 sentence compelling reason for your classification. This reason will be shown directly to the user in the app, so it MUST be written in a friendly, conversational, non-jargon style. (e.g., "While Tim is a real rocker, it looks like he used AI tools to bring this specific track to life!" or "This anonymous artist is flooding the platform with hundreds of releases, a common sign of AI generation."). Do NOT use sterile, robotic analytical jargon like 'telemetry', 'dossier', 'multimodal analysis', or 'nuclear innocence rule'. Speak to the music fan.

Return a strict JSON object classifying this track.`;

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
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            aiLikelihood: {
              type: Type.INTEGER,
              description: "A number from 0 to 100 representing the likelihood this is AI generated."
            },
            isRecognizedArtist: {
              type: Type.BOOLEAN,
              description: "Whether you explicitly recognize this artist from your training data."
            },
            label: {
              type: Type.STRING,
              description: "Must be exactly 'Likely Human', 'Uncertain', or 'Likely AI'"
            },
            reasons: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "A list of reasons (1-2 sentences each) justifying your score."
            }
          },
          required: ["aiLikelihood", "isRecognizedArtist", "label", "reasons"]
        }
      }
    });

    const responseText = response.text();
    if (!responseText) throw new Error("Empty response from Gemini");

    return JSON.parse(responseText);
  } catch (error) {
    console.error('[Gemini] Analysis failed:', error.message);
    return null;
  }
}

// --- Background Polling Worker ---

async function pollUsers() {
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

      console.log(`[Worker] Interrogating Gemini for "${trackName}"...`);
      // 4. Analyze Track
      const analysis = await analyzeTrackWithAI(dossier);

      // Update DB to mark track as analyzed
      await supabase.from('users').update({ last_analyzed_track_id: trackId }).eq('id', user.id);

      // 4. Send Notification if highly suspicious
      if (analysis && analysis.aiLikelihood >= 65 && user.expo_push_token) {
        console.log(`[Worker] AI Track Detected for ${user.id}! Sending Push Notification.`);

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
      }

    } catch (userErr) {
      console.error(`[Worker] Error processing user ${user.id}:`, userErr.message);
    }
  }
}

// --- Start the Server & Loop ---

app.listen(PORT, () => {
  console.log(`[Server] Clarity Backend listening on port ${PORT}`);

  // Start the polling loop immediately, then execute every POLLING_INTERVAL_MS
  pollUsers();
  setInterval(pollUsers, POLLING_INTERVAL_MS);
});
