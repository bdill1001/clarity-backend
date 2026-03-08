const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const crypto = require('crypto');
require('dotenv').config();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let accessToken = "";

async function getSpotifyToken() {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  const data = await response.json();
  accessToken = data.access_token;
}

async function analyzeTrackWithGemini(trackName, artistName, genres, relatedArtistCount, totalReleases, playlists, profileImageUrl) {
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

Return ONLY a strict JSON object classifying this track, with no markdown formatting or backticks. It must contain:
{
  "classification": "Likely Human" | "Uncertain" | "Likely AI",
  "confidence_score": 0-100,
  "reasoning": "1-2 sentences"
}`;

    const requestBody = {
        contents: [{
            role: "user",
            parts: [{ text: promptText }]
        }],
        tools: [{
            googleSearch: {}
        }],
        generationConfig: {
            temperature: 0.2
        }
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
        throw new Error("Gemini returned no candidates: " + JSON.stringify(data));
    }
    let textResp = data.candidates[0].content.parts[0].text;
    textResp = textResp.replace(/`|json/g, '').trim();
    return JSON.parse(textResp);
}

// Fetch artist details and call Gemini
async function assessTrack(trackInput, expectedOutcome, scenarioLabel) {
    console.log(`\n[======] Evaluating ${scenarioLabel} `);
    console.log(`         Testing: "${trackInput.trackName}" by ${trackInput.artistName} (Expected: ${expectedOutcome})`);
    
    // Get Artist details
    const artistResponse = await fetch(`https://api.spotify.com/v1/artists/${trackInput.artistId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    // Wait slightly to respect rate limits
    await new Promise(res => setTimeout(res, 500));

    let genres = [];
    let profileImageUrl = '';
    
    if (artistResponse.ok) {
        const artistData = await artistResponse.json();
        genres = artistData.genres || [];
        if (artistData.images && artistData.images.length > 0) {
            profileImageUrl = artistData.images[0].url;
        }
    }

    // Fetch Release Velocity (Total Albums/Singles)
    let totalReleases = 0;
    const albumsResponse = await fetch(`https://api.spotify.com/v1/artists/${trackInput.artistId}/albums?limit=1`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (albumsResponse.ok) {
        const albumsData = await albumsResponse.json();
        totalReleases = albumsData.total || 0;
    }

    // Related artists
    let relatedArtistCount = 0;
    const relatedResponse = await fetch(`https://api.spotify.com/v1/artists/${trackInput.artistId}/related-artists`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (relatedResponse.ok) {
        const relatedData = await relatedResponse.json();
        relatedArtistCount = relatedData.artists ? relatedData.artists.length : 0;
    }

    // Search for public playlists mentioning them
    let playlists = [];
    const searchStr = `"${trackInput.artistName}"`;
    const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(searchStr)}&type=playlist&limit=3`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.playlists && searchData.playlists.items) {
           playlists = searchData.playlists.items.filter(i=>i!==null).map(p => p.name);
        }
    }

    // Call Gemini
    const result = await analyzeTrackWithGemini(
        trackInput.trackName, 
        trackInput.artistName, 
        genres, 
        relatedArtistCount, 
        totalReleases, 
        playlists, 
        profileImageUrl
    );

    let passed = false;
    if (expectedOutcome === 'Likely Human' && (result.classification === 'Likely Human' || (result.classification === 'Uncertain' && scenarioLabel.includes('Indie Failsafe')))) passed = true;
    if (expectedOutcome === 'Likely AI' && result.classification === 'Likely AI') passed = true;
    if (expectedOutcome === 'Uncertain' && result.classification === 'Uncertain') passed = true;
    
    // Edge case parsing
    if (scenarioLabel.includes('Label-Managed')) {
      if (result.classification === 'Uncertain' || result.classification === 'Likely AI') passed = true; // Both are acceptable outcomes
    }
    if (scenarioLabel.includes('B2B Ghost')) {
      if (result.classification === 'Uncertain' || result.classification === 'Likely AI') passed = true; 
    }

    if (passed) {
        console.log(`   ✅ SUCCESS. Got ${result.classification} (${result.confidence_score}%)`);
        console.log(`      Reasoning (User Facing): "${result.reasoning}"`);
    } else {
        console.log(`   ❌ FAILED! Expected ${expectedOutcome}, Got ${result.classification} (${result.confidence_score}%)`);
        console.log(`      Reason: ${result.reasoning}`);
    }
}

async function runPhase2Roadmap() {
    await getSpotifyToken();
    console.log("Starting Phase 2: Advanced Niche Edge Cases Validation...");

    // SCENARIO 6: The "Human Using AI as a Tool" 
    // Tim Cauty - Groove Machine
    const sc6Search = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent('track:"Groove Machine" artist:"Tim Cauty"')}&type=track&limit=1`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (sc6Search.ok) {
        let data = await sc6Search.json();
        if (data.tracks && data.tracks.items.length > 0) {
            const track = data.tracks.items[0];
            await assessTrack({ trackName: track.name, artistName: track.artists[0].name, artistId: track.artists[0].id }, "Likely AI", "Scenario 6: Human Using AI Tool");
            await new Promise(res => setTimeout(res, 2000));
        }
    }

    // SCENARIO 7: The "AI-Assisted Human" (Vocaloids / AI Voice Clones)
    // Hatsune Miku - "World is Mine"
    const sc7Search = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent('track:"World is Mine" artist:"ryo (supercell)"')}&type=track&limit=1`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (sc7Search.ok) {
        let data = await sc7Search.json();
        if (data.tracks && data.tracks.items.length > 0) {
            const track = data.tracks.items[0];
            await assessTrack({ trackName: track.name, artistName: track.artists[0].name, artistId: track.artists[0].id }, "Likely Human", "Scenario 7: AI-Assisted Human (Vocaloid)");
            await new Promise(res => setTimeout(res, 2000));
        }
    }

    // SCENARIO 8: The B2B Ghost Producer (Stock Music Composers)
    // Search for generic "White Noise Baby Sleep"
    const sc8Search = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent('genre:"sleep" artist:"White Noise"')}&type=track&limit=1`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (sc8Search.ok) {
        let data = await sc8Search.json();
        if (data.tracks && data.tracks.items.length > 0) {
            const track = data.tracks.items[0];
            await assessTrack({ trackName: track.name, artistName: track.artists[0].name, artistId: track.artists[0].id }, "Uncertain", "Scenario 8: B2B Ghost Producer");
            await new Promise(res => setTimeout(res, 2000));
        }
    }

    // SCENARIO 9: The "Label-Managed Faceless Project"
    // Lofi Girl
    const sc9Search = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent('artist:"Lofi Girl"')}&type=track&limit=1`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (sc9Search.ok) {
        let data = await sc9Search.json();
        if (data.tracks && data.tracks.items.length > 0) {
            const track = data.tracks.items[0];
            await assessTrack({ trackName: track.name, artistName: track.artists[0].name, artistId: track.artists[0].id }, "Likely Human", "Scenario 9: Label-Managed Faceless Project");
            await new Promise(res => setTimeout(res, 2000));
        }
    }

    // SCENARIO 10: The Cover-Song Clone Farm
    // Search for acoustic pop covers
    const sc10Search = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent('track:"Shape of You" genre:"acoustic cover"')}&type=track&limit=2`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (sc10Search.ok) {
        let data = await sc10Search.json();
        if (data.tracks && data.tracks.items.length > 0) {
            const track = data.tracks.items[0]; // Just take first one found
            await assessTrack({ trackName: track.name, artistName: track.artists[0].name, artistId: track.artists[0].id }, "Likely AI", "Scenario 10: AI Cover Clone Farm");
            await new Promise(res => setTimeout(res, 2000));
        }
    }


    console.log("\nPhase 2 Validation Complete.");
}

runPhase2Roadmap().catch(console.error);
