require('dotenv').config();
const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

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

async function getArtistAlbums(token, artistId) {
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  return data.total || 0;
}

async function analyzeTrackWithAI(artistId, token) {
  const artistDataRes = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, { headers: { Authorization: `Bearer ${token}` } });
  const artistData = await artistDataRes.json();
  const artistName = artistData.name;
  const trackName = "Midnight Drive"; // Sample track
  const totalReleases = await getArtistAlbums(token, artistId);
  const relatedArtistCount = 0;
  const playlists = [];
  const genres = artistData.genres || [];
  const images = artistData.images || [];
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
   - A human footprint: A real indie human will almost ALWAYS have an Instagram, Bandcamp, TikTok, or local gig listed. However, brand new humans might not have a strong Web Presence yet. If an artist has official streaming releases but ABSOLUTELY ZERO human social media footprint OR biographical data anywhere on the internet, they MIGHT be a mass-produced AI farm. **CRITICAL:** You can ONLY penalize an artist for a "Void of Existence" if their Release Velocity is suspiciously high (e.g., > 10 releases) OR if their Profile Image URL is assessed as AI-generated in Rule 4. If they have less than 10 releases, no footprint, AND a real human photo, you MUST default to "Uncertain" or "Likely Human" (Protecting brand new/local artists).
   - Public Exposure: Search explicitly for Reddit threads or music forum posts discussing if "${artistName}" is AI. If the artist has been "outed" by the community as a synthetic farm, you MUST classify as 'Likely AI'.
If EITHER the public exposure is confirmed, OR the "void of existence" is confirmed ALONGSIDE high Release Velocity AND/OR AI-generated Profile Art, you MAY OVERRIDE the Nuclear Innocence Rule and classify as 'Likely AI' (90%+).
7. THE HYBRID IDENTITY RULE: Our goal is to detect synthetic *audio*. If Google Search reveals that an artist is a real, verified human, but they are explicitly using generative AI (Suno, Udio, Voice Clones) to create the *music or vocals* for this track, you MUST flag it as 'Likely AI'. A human identity does NOT protect synthetic audio.

Gating Guardrails:
- Many genuine human indie artists start with 0 genres and 0 related artists. Do not flag as AI *solely* for being unpopular or isolated.
- Brand new human artists often have NO social media presence and 1-5 track releases. You MUST protect them with the Nuclear Innocence Rule.
- Stylized names (DeadMau5) do not mean AI.
- Formulate a 1-2 sentence compelling reason for your classification. This reason will be shown directly to the user in the app, so it MUST be written in a friendly, conversational, non-jargon style. (e.g., "While Tim is a real rocker, it looks like he used AI tools to bring this specific track to life!" or "This anonymous artist is flooding the platform with hundreds of releases, a common sign of AI generation."). Do NOT use sterile, robotic analytical jargon like 'telemetry', 'dossier', 'multimodal analysis', or 'nuclear innocence rule'. Speak to the music fan.
Return ONLY a strict JSON object classifying this track, with no markdown formatting or backticks. It must contain EXACTLY these keys:
{
  "aiLikelihood": 0-100 (integer representing AI probability),
  "isRecognizedArtist": true/false,
  "label": "Likely Human" | "Uncertain" | "Likely AI",
  "reasons": ["1-2 sentences explaining reasoning"]
}`;

  console.log("DOSSIER GATHERED:");
  console.log({ totalReleases, genres, relatedArtistCount, playlists: playlists.length, profileImageUrl });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    config: { tools: [{ googleSearch: {} }], temperature: 0.0 }
  });
  
  let textResp = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
  console.log("\nGEMINI OUTPUT:\n", textResp);
}

async function run() {
  const token = await getClientCredentialsToken();
  await analyzeTrackWithAI("29eWAY1JQA6HQsXAmQCO0y", token);
}

run();
