import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;

async function getArtistData(accessToken, artistId) {
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return response.ok ? response.json() : null;
}
async function getArtistAlbums(accessToken, artistId) {
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?limit=1`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return response.ok ? (await response.json()).total : 0;
}
async function getRelatedArtists(accessToken, artistId) {
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/related-artists`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return response.ok ? ((await response.json()).artists?.length || 0) : 0;
}
async function searchPlaylists(accessToken, trackName, artistName) {
  const query = encodeURIComponent(`track:${trackName} artist:${artistName}`);
  const response = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=playlist&limit=5`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return response.ok ? ((await response.json()).playlists?.items?.map(p => p.name) || []) : [];
}

async function analyzeTrackWithAI(dossier) {
  const { trackName, artistName, artistData, relatedArtistCount, totalReleases, playlists } = dossier;
  const followers = artistData?.followers?.total || 0;
  const popularity = artistData?.popularity || 0;
  const genres = artistData?.genres || [];
  const images = artistData?.images || [];
  const profileImageUrl = images.length > 0 ? images[0].url : "No image available";

  const promptText = `=== CLARITY AI DETECTION DOSSIER ===
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
Return ONLY a strict JSON object classifying this track, with no markdown formatting or backticks. It must contain EXACTLY these keys:
{
  "aiLikelihood": 0-100 (integer representing AI probability),
  "isRecognizedArtist": true/false,
  "label": "Likely Human" | "Uncertain" | "Likely AI",
  "reasons": ["1-2 sentences explaining reasoning"]
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    config: { tools: [{ googleSearch: {} }], temperature: 0.2 }
  });
  
  let textResp = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(textResp);
}

async function run() {
  const { data: users } = await supabase.from('users').select('*').eq('is_active', true);
  
  for (const user of users) {
    if (user.id !== 'fff3d4c5-c34a-4808-aac9-b2fd9a18e0a8') continue; // only target the active testing user
    
    console.log(`Checking user ${user.id}...`);
    try {
      const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${user.access_token}` }
      });
      if (!response.ok) { console.log('HTTP Error:', response.status); continue; }
      
      const playingData = await response.json();
      const track = playingData.item;
      const trackName = track.name;
      const artistName = track.artists.map(a => a.name).join(', ');
      console.log(`User ${user.id} playing: ${trackName} by ${artistName}`);
      
      const artistId = track.artists[0]?.id;
      const [artistData, totalReleases, relatedArtistCount, playlists] = await Promise.all([
        getArtistData(user.access_token, artistId),
        getArtistAlbums(user.access_token, artistId),
        getRelatedArtists(user.access_token, artistId),
        searchPlaylists(user.access_token, trackName, artistName)
      ]);
      
      const dossier = { trackName, artistName, artistData, relatedArtistCount, totalReleases, playlists };
      console.log("Dossier:", JSON.stringify(dossier, null, 2));
      
      console.log("Contacting Gemini...");
      const analysis = await analyzeTrackWithAI(dossier);
      console.log("Analysis Result:", analysis);
      
      if (analysis && analysis.aiLikelihood >= 65 && user.expo_push_token) {
        console.log("Triggering Push Notification to:", user.expo_push_token);
        const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: user.expo_push_token,
            title: '🤖 AI Track Detected',
            body: `Clarity detected that "${trackName}" by ${artistName} is likely generated by AI.`,
            data: { trackId: track.id, analysis },
          }),
        });
        const pushData = await pushRes.json();
        console.log("Push API Response:", pushData);
      } else {
        console.log("Not triggering push: Likelihood under threshold or missing push token.");
      }
    } catch (e) {
      console.error(e);
    }
  }
}

run();
