require('dotenv').config();
const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// --- Spotify API Utilities ---

async function getClientCredentialsToken() {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });
  const data = await response.json();
  return data.access_token;
}

async function searchArtistId(accessToken, artistName) {
  const query = encodeURIComponent(artistName);
  const response = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=artist&limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.artists?.items[0]?.id;
}

async function getArtistData(accessToken, artistId) {
  if (!artistId) return null;
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  return response.json();
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

// --- Gemini Analysis (Mirrors server.js) ---

async function analyzeTrackWithAI(dossier) {
  try {
    const { trackName, artistName, artistData, relatedArtistCount, playlists } = dossier;
    
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
Artist Followers: ${followers}
Artist Popularity Score: ${popularity}/100
Artist Genres: ${genres.length > 0 ? genres.join(', ') : 'None listed'}
Related Artists Count: ${relatedArtistCount} (Crucial human indicator)
Public Playlists Found via Search: ${playlists.length > 0 ? playlists.join(' | ') : 'None found'}
Profile Image URL: ${profileImageUrl}

== INSTRUCTIONS (THE SIX PILLARS OF ASSESSMENT) ==
You are an expert music industry analyst specializing in detecting synthetic/AI-generated music (e.g., Suno, Udio) exploiting streaming platforms.
Analyze the provided dossier across the following pillars:

1. Profile & Audience Metrics: Does this artist have a hyper-inflated number of releases but zero "Related Artists" or followers? 
2. Semantic Patterns: Does the artist name follow compound AI pseudonyms (e.g., "Luna Echo", "Static Wave")? Do the playlists mentioning them have names like "AI Music"?
3. Multimodal Visual Assessment: Analyze the provided Profile Image URL. Are there classic AI generation artifacts (DALL-E/Midjourney plastic skin, asymmetrical features, garbled text)? Note: Using AI art does not guarantee the music is AI, but it is a data point.
4. Public Discourse & Internal LLM Knowledge: Search your internal training data. Do you recognize this artist as a real human musician? Are they discussed on Reddit/blogs? 

Gating Guardrails:
- Many human indie artists start with 0 followers and 0 genres. Do not flag as AI *solely* for being unpopular.
- Stylized names (DeadMau5) do not mean AI.
- If the track is AI, formulate a 1-2 sentence compelling reason why.

Return a strict JSON object classifying this track.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            aiLikelihood: { type: Type.INTEGER, description: "A number from 0 to 100 representing the likelihood this is AI generated." },
            isRecognizedArtist: { type: Type.BOOLEAN, description: "Whether you explicitly recognize this artist from your training data." },
            label: { type: Type.STRING, description: "Must be exactly 'Likely Human', 'Uncertain', or 'Likely AI'" },
            reasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of reasons (1-2 sentences each) justifying your score." }
          },
          required: ["aiLikelihood", "isRecognizedArtist", "label", "reasons"]
        }
      }
    });

    return JSON.parse(response.text());
  } catch (error) {
    console.error('[Gemini] Analysis failed:', error.message);
    return null;
  }
}

// --- Test Runner ---

async function runTest(token, trackName, artistName) {
  console.log(`\n\n----------------------------------------`);
  console.log(`🧪 TESTING: "${trackName}" by ${artistName}`);
  console.log(`----------------------------------------`);
  
  const artistId = await searchArtistId(token, artistName);
  let artistData = null;
  let relatedArtistCount = 0;
  let playlists = [];

  if (artistId) {
    artistData = await getArtistData(token, artistId);
    
    // Pillar 1: Fast-Path Array
    if (artistData) {
      const followers = artistData.followers?.total || 0;
      const popularity = artistData.popularity || 0;
      const genres = artistData.genres || [];
      
      if (followers > 500000 || popularity > 80) {
        relatedArtistCount = await getRelatedArtists(token, artistId);
        if (genres.length >= 3 && relatedArtistCount >= 5) {
          console.log(`[PASS] 🟢 FAST-PATH WHITELIST TRIGGERED! Famous human artist verified. Skipping AI.`);
          return;
        }
      }
    }
  } else {
    console.log(`⚠️ Artist not found on Spotify. (Could be purely synthetic)`);
  }

  if (artistId && relatedArtistCount === 0) {
    relatedArtistCount = await getRelatedArtists(token, artistId);
  }

  playlists = await searchPlaylists(token, trackName, artistName);

  const dossier = { trackName, artistName, artistData, relatedArtistCount, playlists };
  console.log(`\n📡 DOSSIER GATHERED:\n - Followers: ${artistData?.followers?.total || 0}\n - Popularity: ${artistData?.popularity || 0}/100\n - Related Nodes: ${relatedArtistCount}\n - Linked Playlists: ${playlists.length}`);
  
  console.log(`\n🧠 Interrogating Gemini (Checking 6 Pillars)...`);
  const analysis = await analyzeTrackWithAI(dossier);
  
  console.log(`\n✅ RESULT:`);
  console.log(` - Label: ${analysis.label}`);
  console.log(` - AI Likelihood: ${analysis.aiLikelihood}%`);
  console.log(` - Recognized by LLM: ${analysis.isRecognizedArtist}`);
  console.log(` - Reasoning:\n    * ${analysis.reasons.join('\n    * ')}`);
}

async function main() {
  console.log(`[Suite] Initializing Clarity Test Runner...`);
  const token = await getClientCredentialsToken();
  if (!token) {
    console.error("Failed to acquire Spotify Token.");
    return;
  }

  // 1. Extreme Famous Artist (Should hit Fast-Path)
  await runTest(token, "Cruel Summer", "Taylor Swift");

  // 2. Medium Human Indie Artist
  await runTest(token, "Space Song", "Beach House");
  
  // 3. Known Suno AI Name Pattern (Should fail Fast-Path and hit Gemini)
  await runTest(token, "Neon Cyber Odyssey", "Echoes of Tomorrow");

  console.log(`\n\n[Suite] Tests completed.`);
}

main();
