require('dotenv').config();
const { GoogleGenAI, Type } = require('@google/genai');
const fs = require('fs');
const path = require('path');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Sleep utility to respect rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getClientCredentialsToken() {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });
  if (!response.ok) throw new Error('Failed to get Spotify Token');
  const data = await response.json();
  return data.access_token;
}

async function getTestTracks(accessToken) {
  let expectedAi = [];
  let expectedHuman = [];

  // Search for known AI tracks
  let response = await fetch('https://api.spotify.com/v1/search?q=suno&type=track', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (response.ok) {
    let data = await response.json();
    for (const track of data.tracks.items) {
      if (track && track.artists && track.artists.length > 0) {
        expectedAi.push({
          trackId: track.id,
          trackName: track.name,
          artistName: track.artists[0].name,
          artistId: track.artists[0].id,
          expectedType: 'AI'
        });
      }
    }
  }

  // Search for highly obscure indie tracks (Human control group)
  // We use niche genres to ensure we get artists with very low listener counts/followers
  response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent('genre:"deep indie rock"')}&type=track&limit=5`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (response.ok) {
    let data = await response.json();
    for (const track of data.tracks.items) {
      if (track && track.artists && track.artists.length > 0) {
        expectedHuman.push({
          trackId: track.id,
          trackName: track.name,
          artistName: track.artists[0].name,
          artistId: track.artists[0].id,
          expectedType: 'Human'
        });
      }
    }
  }

  return [...expectedAi, ...expectedHuman];
}

async function getArtistData(accessToken, artistId) {
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
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/related-artists`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return 0;
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

async function analyzeWithGemini(dossier) {
  try {
    const { trackName, artistName, artistData, relatedArtistCount, totalReleases, playlists } = dossier;
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
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      config: {
        tools: [{ googleSearch: {} }],
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

    return JSON.parse(response.text);
  } catch (error) {
    console.error('[Gemini Error]', error.message);
    return null;
  }
}

async function processTracks() {  
  const token = process.env.TESTING_ACCESS_TOKEN;
  if (!token) {
    console.error("❌ CRITICAL ERROR: Spotfy's API blocks follower/popularity data when using generic Client Credentials.");
    console.error("❌ You must run 'node get-token.js' to authenticate your user account first, and ensure TESTING_ACCESS_TOKEN is in your .env!");
    process.exit(1);
  }
  console.log('Generating test datasets via Spotify Search API...');
  const allTracks = await getTestTracks(token);
  console.log(`Total tracks to process: ${allTracks.length}`);

  const csvStream = fs.createWriteStream(path.join(__dirname, 'testing_results.csv'), { flags: 'w' });
  csvStream.write('TrackName,ArtistName,Expected,PredictedLabel,aiLikelihood,FastPathTriggered,IsRecognized,TotalReleases,RelatedArtists,Reasons\n');

  let processedCount = 0;
  let correctCount = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const t of allTracks) {
    console.log(`\n[${++processedCount}/${allTracks.length}] Testing: "${t.trackName}" by ${t.artistName} (Expected: ${t.expectedType})`);
    
    let fastPathTriggered = false;
    let finalLabel = 'Uncertain';
    let aiLikelihood = 50;
    let isRecognized = false;
    let reasons = '';
    
    const artistData = await getArtistData(token, t.artistId);
    let relatedArtistCount = 0;
    let totalReleases = 0;
    
    // We still keep the fast-path whitelist logic on followers natively but don't pass it to AI
    const followers = artistData?.followers?.total || 0;
    const popularity = artistData?.popularity || 0;
    const genres = artistData?.genres || [];

    if (artistData && (followers > 500000 || popularity > 80)) {
      relatedArtistCount = await getRelatedArtists(token, t.artistId);
      if (genres.length >= 3 && relatedArtistCount >= 5) {
        fastPathTriggered = true;
        finalLabel = 'Likely Human';
        aiLikelihood = 0;
        isRecognized = true;
        reasons = 'Fast-Path Whitelist Triggered (Famous Artist)';
        console.log(` - Fast path triggered!`);
      }
    }

    if (!fastPathTriggered) {
      if (relatedArtistCount === 0 && artistData) {
        relatedArtistCount = await getRelatedArtists(token, t.artistId);
      }
      
      if (t.artistId) {
        totalReleases = await getArtistAlbums(token, t.artistId);
      }

      const playlists = await searchPlaylists(token, t.trackName, t.artistName);
      const dossier = { trackName: t.trackName, artistName: t.artistName, artistData, relatedArtistCount, totalReleases, playlists };
      
      const analysis = await analyzeWithGemini(dossier);
      if (analysis) {
        finalLabel = analysis.label;
        aiLikelihood = analysis.aiLikelihood;
        isRecognized = analysis.isRecognizedArtist;
        reasons = analysis.reasons.join(' | ').replace(/"/g, '""');
      } else {
        reasons = 'Gemini Analysis Failed';
      }
    }

    // Evaluate success
    let success = false;
    if (t.expectedType === 'AI' && finalLabel === 'Likely AI') success = true;
    if (t.expectedType === 'Human' && finalLabel === 'Likely Human') success = true;
    
    if (!success) {
      if (t.expectedType === 'Human' && finalLabel !== 'Likely Human') falsePositives++;
      if (t.expectedType === 'AI' && finalLabel !== 'Likely AI') falseNegatives++;
      console.log(`   ❌ FAILED! Expected ${t.expectedType}, Got ${finalLabel} (${aiLikelihood}%)`);
      console.log(`      Reason: ${reasons}`);
    } else {
      console.log(`   ✅ SUCCESS. Got ${finalLabel}`);
      correctCount++;
    }

    csvStream.write(`"${t.trackName.replace(/"/g, '""')}","${t.artistName.replace(/"/g, '""')}",${t.expectedType},${finalLabel},${aiLikelihood},${fastPathTriggered},${isRecognized},${totalReleases},${relatedArtistCount},"${reasons}"\n`);
    
    // Sleep to avoid rate limits
    await sleep(2000);
  }

  csvStream.end();

  console.log(`\n\n=== OVERALL RESULTS ===`);
  console.log(`Total Processed: ${processedCount}`);
  console.log(`Correctly Classified: ${correctCount} (${Math.round((correctCount/processedCount)*100)}%)`);
  console.log(`False Positives (Human tagged AI): ${falsePositives}`);
  console.log(`False Negatives (AI tagged Human): ${falseNegatives}`);
  console.log(`Results written to backend/testing_results.csv`);
}

processTracks().catch(console.error);
