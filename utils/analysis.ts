import { z } from 'zod';
import { Track, AnalysisResult } from '@/types';

const analysisSchema = z.object({
  aiLikelihood: z.number().min(1).max(99).describe('Percentage likelihood that this track is AI-generated (1-99). Use the FULL range based on evidence.'),
  label: z.enum(['Likely Human', 'Uncertain', 'Likely AI']).describe('Classification label'),
  reasons: z.array(z.string()).min(1).max(6).describe('Top reasons for the classification, each 1-2 sentences'),
  reasonCodes: z.array(z.string()).max(6).describe('Short code identifiers for each reason'),
  isRecognizedArtist: z.boolean().describe('Set to true ONLY if you personally recognize this artist from your training data as a real human musician at any level of fame'),
  recognitionConfidence: z.enum(['none', 'low', 'medium', 'high']).describe('How confident are you that you recognize this artist? none=never heard of them, low=vaguely familiar, medium=fairly sure, high=definitely know them'),
});

const AI_NAME_KEYWORDS = [
  /\bai\b/i, /\ba\.i\b/i, /\bbot\b/i, /\bneural\b/i, /\bsynthetic\b/i,
  /\balgorithm/i, /\bgenerat/i, /\bmachine\b/i, /\bdigital\s*soul/i,
  /\bcyber/i, /\belectro\s*mind/i, /\bvirtual\b/i, /\bhologram/i,
  /\broboti/i, /\bandroid/i, /\bautomaton/i, /\bdeep\s*learn/i,
];

const AI_COMPOUND_NAME_PATTERNS = [
  /\bnova\b.*\b(cordova|synth|byte|pixel|echo|wave|flux|data|core|net)/i,
  /\becho\s*(novella|byte|pulse|wave|flux|data)/i,
  /\bstatic\s*compliance/i,
  /\b(pixel|byte|data|flux|core|net)\s*(wave|soul|mind|dream|pulse)/i,
  /\b(dream|soul|mind)\s*(byte|pixel|flux|wave|circuit)/i,
  /\b(luna|aria|wyla|nova|echo|lyra|aura|zara|nyla|kira)\s+(rose|hayes|chen|gray|blake|rivers|west|vale|reed|shaw|frost|lake|storm|sky|moon|rain|cloud|snow|star|breeze|wilde|fox|blue|jade|pearl|ivy|fern|sage|dawn|eve|winter|summer|spring|autumn)/i,
  /\b(kai|liam|ethan|aiden|finn|jace|cole|reed|blake|sage)\s+(aurora|nova|echo|luna|rivers|frost|storm|vale|sky|moon)/i,
  /\babedi\b/i,
];

const AI_BAND_NAME_PATTERNS = [
  /^the\s+(velvet|crimson|silver|golden|neon|midnight|crystal|amber|cobalt|electric|lunar|solar|cosmic|ethereal|phantom|silent|hollow|fading|distant|floating|drifting|wandering|digital|synthetic)\s+(sundown|sunrise|horizon|cascade|whisper|echoes?|drift|haven|harbor|voyage|reverie|mirage|meadow|garden|ember|shadow|pulse|shimmer|aurora|solstice|equinox|zenith|current|breeze|tide|wave|glow|haze|mist|bloom|frost|rain|dusk|dawn)/i,
  /^(velvet|crimson|silver|golden|neon|midnight|crystal|amber|cobalt|electric|lunar|solar|cosmic|ethereal)\s+(sundown|sunrise|horizon|cascade|whisper|echoes?|drift|haven|harbor|voyage|reverie|mirage|meadow|ember|shadow|pulse|shimmer|aurora|solstice)/i,
  /^the\s+\w+\s+(collective|project|experiment|ensemble|sessions?|chronicles?|soundscape|frequencies)/i,
  /^(azure|indigo|cerulean|scarlet|ivory|obsidian|sapphire)\s+(dreams?|skies|waters|shores|paths?|trails?|winds?|tides?|echoes?)/i,
];

const AI_LABEL_PATTERNS = [
  /suno/i, /udio/i, /boomy/i, /mubert/i, /aiva/i, /amper/i,
  /endel/i, /loudly/i, /beatoven/i, /soundraw/i, /ecrett/i,
];

const HUMAN_NAME_PATTERNS = [
  /^[A-Z][a-z]+\s+[A-Z][a-z]+$/,
  /^[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+$/,
  /^(DJ|MC|Lil|Big|Young|Old)\s/i,
  /^[A-Z][a-z]{2,}\s+[A-Z]\.\s+[A-Z][a-z]+$/,
];

const CREATIVE_HUMAN_NAME_PATTERNS = [
  /^\w+\d\w*$/i,
  /^[A-Z][a-z]+[A-Z][a-z]+$/,
  /^The\s+/i,
  /^[A-Z][a-z]+\s+(and|&)\s+the\s+/i,
];

function computeHeuristicSignals(track: Track): {
  releaseToFollowerRatio: number | null;
  nameAiKeywordScore: number;
  nameAiCompoundScore: number;
  labelAiScore: number;
  humanNameScore: number;
  profileCompleteness: number;
  hasRelatedArtists: boolean | null;
  topTrackPopularity: number | null;
  releaseFrequency: number | null;
  allSingles: boolean | null;
  hasArtistImages: boolean | null;
  artistImageCount: number | null;
  dataReliable: boolean | null;
  summary: string[];
} {
  const signals: string[] = [];
  let nameAiKeywordScore = 0;
  let nameAiCompoundScore = 0;
  let labelAiScore = 0;
  let humanNameScore = 0;

  for (const pattern of AI_NAME_KEYWORDS) {
    if (pattern.test(track.artist) || pattern.test(track.name)) {
      nameAiKeywordScore += 25;
    }
  }

  for (const pattern of AI_COMPOUND_NAME_PATTERNS) {
    if (pattern.test(track.artist) || pattern.test(track.name)) {
      nameAiCompoundScore += 30;
    }
  }

  for (const pattern of AI_BAND_NAME_PATTERNS) {
    if (pattern.test(track.artist)) {
      nameAiCompoundScore += 25;
    }
  }

  for (const pattern of HUMAN_NAME_PATTERNS) {
    if (pattern.test(track.artist)) {
      humanNameScore += 20;
      break;
    }
  }

  if (humanNameScore === 0) {
    for (const pattern of CREATIVE_HUMAN_NAME_PATTERNS) {
      if (pattern.test(track.artist)) {
        humanNameScore += 5;
        break;
      }
    }
  }

  if (track.label) {
    for (const pattern of AI_LABEL_PATTERNS) {
      if (pattern.test(track.label)) {
        labelAiScore += 40;
        signals.push(`Label "${track.label}" matches known AI music platform`);
        break;
      }
    }
  }

  let releaseToFollowerRatio: number | null = null;
  const dataReliable = track.dataReliable ?? null;

  if (track.enrichmentComplete && track.artistAlbumCount !== undefined && track.albumCountVerified) {
    const followers = track.artistFollowers ?? 0;
    const albums = track.artistAlbumCount;

    if (followers > 0 && albums > 0) {
      releaseToFollowerRatio = albums / followers;
    } else if (albums > 0 && followers === 0) {
      releaseToFollowerRatio = albums * 100;
    }

    if (albums >= 20 && followers < 100) {
      signals.push(`HIGH AI SIGNAL: ${albums} releases but only ${followers} followers — classic AI music farm pattern`);
    } else if (albums >= 10 && followers < 50) {
      signals.push(`STRONG AI SIGNAL: ${albums} releases with ${followers} followers is very unusual for a human artist`);
    } else if (albums <= 8 && followers < 500) {
      signals.push(`Normal indie pattern: ${albums} releases with ${followers} followers — consistent with a small human artist`);
    } else if (followers >= 500) {
      signals.push(`Artist has ${followers.toLocaleString()} followers — this level of following strongly suggests a real human artist`);
    }
  }

  if (dataReliable === false) {
    signals.push(`Note: Spotify follower count may be inaccurate for this artist, but other profile data (genres, related artists, releases, top track pop) is valid`);
  }

  let profileCompleteness = 0;
  if (track.enrichmentComplete) {
    if ((track.artistFollowers ?? 0) > 0) profileCompleteness += 20;
    if ((track.artistPopularity ?? 0) > 0) profileCompleteness += 20;
    if ((track.artistGenres ?? []).length > 0) profileCompleteness += 20;
    if (track.albumCountVerified && (track.artistAlbumCount ?? 0) > 0) profileCompleteness += 20;
    if (track.artistHasRelated === true) profileCompleteness += 20;
  }

  const hasRelatedArtists = track.artistHasRelated ?? null;
  const topTrackPopularity = track.artistTopTrackPopularity ?? null;
  const releaseFrequency = track.releaseFrequency ?? null;
  const allSingles = track.allSingles ?? null;
  const hasArtistImages = track.artistHasImages ?? null;
  const artistImageCount = track.artistImageCount ?? null;

  if (releaseFrequency !== null && releaseFrequency > 3) {
    signals.push(`HIGH RELEASE FREQUENCY: ${releaseFrequency.toFixed(1)} releases/month — AI music farms often bulk-upload content at inhuman rates`);
  } else if (releaseFrequency !== null && releaseFrequency > 1.5) {
    signals.push(`Elevated release frequency: ${releaseFrequency.toFixed(1)} releases/month — unusually prolific for most human artists`);
  }

  if (allSingles === true && (track.artistAlbumCount ?? 0) >= 5) {
    signals.push(`All releases are singles with no full albums — common pattern for AI-generated music catalogs`);
  }

  if (hasArtistImages === false) {
    signals.push(`Artist profile has NO images — real musicians almost always have at least one profile photo`);
  }

  if (topTrackPopularity !== null && topTrackPopularity > 40) {
    signals.push(`Artist's top track has ${topTrackPopularity}/100 popularity — indicates real organic listener engagement`);
  }

  if (hasRelatedArtists === true) {
    signals.push(`Artist has related artists on Spotify — STRONG human indicator (AI profiles almost never have this)`);
  }

  return {
    releaseToFollowerRatio,
    nameAiKeywordScore: Math.min(nameAiKeywordScore, 50),
    nameAiCompoundScore: Math.min(nameAiCompoundScore, 50),
    labelAiScore: Math.min(labelAiScore, 50),
    humanNameScore: Math.min(humanNameScore, 20),
    profileCompleteness,
    hasRelatedArtists,
    topTrackPopularity,
    releaseFrequency,
    allSingles,
    hasArtistImages,
    artistImageCount,
    dataReliable,
    summary: signals,
  };
}

function buildAnalysisPrompt(track: Track): string {
  const heuristics = computeHeuristicSignals(track);
  const parts: string[] = [];

  parts.push(`You are an expert at detecting AI-generated music on Spotify. Analyze this track and determine if it is AI-generated or made by a real human artist.`);
  parts.push('');
  parts.push('=== TRACK METADATA ===');
  parts.push(`Track: "${track.name}"`);
  parts.push(`Artist: "${track.artist}"`);
  parts.push(`Album: "${track.album}"`);

  if (track.releaseDate) {
    parts.push(`Release Date: ${track.releaseDate}`);
  }

  if (track.label) {
    parts.push(`Label/Distributor: "${track.label}"`);
  }

  parts.push(`Track Popularity: ${track.popularity}/100`);
  parts.push(`Duration: ${Math.round((track.durationMs || 0) / 1000)}s`);

  if (track.trackArtistCount && track.trackArtistCount > 1) {
    parts.push(`Number of credited artists: ${track.trackArtistCount} (collaborations are more common among human artists)`);
  }

  if (track.enrichmentComplete) {
    parts.push('');
    parts.push('=== ARTIST SPOTIFY PROFILE ===');
    if (track.artistName) parts.push(`Artist Display Name: "${track.artistName}"`);

    const followers = track.artistFollowers ?? 0;
    const artistPop = track.artistPopularity ?? 0;

    if (track.dataReliable === false) {
      parts.push(`Followers: ${followers.toLocaleString()} (NOTE: follower count may be inaccurate for this artist due to Spotify API issues, but other profile data below is valid)`);
      parts.push(`Artist Popularity: ${artistPop}/100`);
    } else {
      parts.push(`Followers: ${followers.toLocaleString()}`);
      parts.push(`Artist Popularity: ${artistPop}/100`);
    }

    parts.push(`Genres: ${(track.artistGenres && track.artistGenres.length > 0) ? track.artistGenres.join(', ') : 'None listed'}`);

    if (track.albumCountVerified && track.artistAlbumCount !== undefined) {
      parts.push(`Total Releases (albums + singles): ${track.artistAlbumCount}`);
    } else {
      parts.push(`Total Releases: COULD NOT BE VERIFIED (do NOT assume any specific number)`);
    }

    if (track.distinctAlbumNames !== undefined) {
      parts.push(`Distinct release names: ${track.distinctAlbumNames}`);
    }

    if (track.artistHasRelated !== undefined) {
      if (track.artistHasRelated) {
        parts.push(`Related Artists: YES (${track.artistRelatedArtists} found) — this is a VERY STRONG human indicator. AI-generated profiles virtually NEVER have related artists on Spotify.`);
      } else {
        parts.push(`Related Artists: NONE found — this alone does NOT prove AI; many small indie artists have no related artists`);
      }
    }

    if (track.artistTopTrackPopularity !== undefined && track.artistTopTrackPopularity >= 0) {
      parts.push(`Artist's Top Track Popularity: ${track.artistTopTrackPopularity}/100`);
      if (track.artistTopTrackPopularity > 50) {
        parts.push(`  → Top track pop > 50 means this artist has REAL organic listeners. This is a very strong human signal.`);
      } else if (track.artistTopTrackPopularity > 25) {
        parts.push(`  → Top track pop > 25 indicates some organic listener engagement — leans human.`);
      }
    }

    if (track.artistHasImages !== undefined) {
      parts.push(`Artist has profile images: ${track.artistHasImages} (count: ${track.artistImageCount ?? 'unknown'})`);
      if (track.artistImageCount !== undefined && track.artistImageCount >= 3) {
        parts.push(`  → Multiple profile images (${track.artistImageCount}) suggest an actively managed human artist profile.`);
      }
    }

    parts.push('');
    parts.push('=== HOW TO INTERPRET THE SPOTIFY DATA ===');
    if (followers === 0 && artistPop === 0) {
      parts.push('The artist has 0 followers and 0 popularity. This is a REAL data point — many genuinely small/new artists AND AI-generated profiles have this.');
      parts.push('Use OTHER signals to distinguish: genres, related artists, top track pop, release patterns, name analysis, and your own knowledge.');
      parts.push('0 followers alone is NOT proof of AI. But 0 followers + 0 genres + 0 related artists + many releases = suspicious pattern.');
    } else if (followers > 0) {
      parts.push(`The artist has ${followers.toLocaleString()} real followers. This is meaningful — AI profiles rarely accumulate real followers.`);
    }
  } else {
    parts.push('');
    parts.push('=== ARTIST DATA UNAVAILABLE ===');
    parts.push('Spotify API enrichment FAILED. All artist data (followers, popularity, genres, releases) is UNKNOWN — NOT zero.');
    parts.push('You MUST NOT treat missing data as evidence of AI. Missing data = unknown, not suspicious.');
    parts.push('Base your analysis primarily on your own knowledge and the track metadata available.');
  }

  parts.push('');
  parts.push('=== PRE-COMPUTED SIGNALS ===');
  if (heuristics.summary.length > 0) {
    for (const s of heuristics.summary) {
      parts.push(`• ${s}`);
    }
  }
  if (heuristics.nameAiKeywordScore > 0) {
    parts.push(`• Artist/track name contains explicit AI-related keywords (score: ${heuristics.nameAiKeywordScore}/50)`);
  }
  if (heuristics.nameAiCompoundScore > 0) {
    parts.push(`• Artist name matches known AI-generated compound pseudonym patterns (score: ${heuristics.nameAiCompoundScore}/50)`);
  }
  if (heuristics.labelAiScore > 0) {
    parts.push(`• Label matches known AI music generation platform (score: ${heuristics.labelAiScore}/50)`);
  }
  if (heuristics.humanNameScore >= 15) {
    parts.push(`• Artist name follows a classic human naming pattern like "First Last" (score: ${heuristics.humanNameScore}/20) — NOTE: AI profiles increasingly use realistic human names, so this is only a weak signal`);
  }
  parts.push(`• Profile completeness: ${heuristics.profileCompleteness}%`);
  if (heuristics.releaseToFollowerRatio !== null) {
    parts.push(`• Release-to-follower ratio: ${heuristics.releaseToFollowerRatio.toFixed(2)}`);
  }
  if (heuristics.releaseFrequency !== null) {
    parts.push(`• Release frequency: ${heuristics.releaseFrequency.toFixed(2)} releases/month`);
  }
  if (heuristics.allSingles !== null) {
    parts.push(`• All releases are singles (no albums): ${heuristics.allSingles}`);
  }

  parts.push('');
  parts.push('=== CLASSIFICATION RULES (follow strictly in order) ===');
  parts.push('');
  parts.push('STEP 1 — CHECK YOUR OWN KNOWLEDGE FIRST (HIGHEST PRIORITY):');
  parts.push('- Search your training data thoroughly. If you recognize this artist as a real musician at ANY level, classify as HUMAN.');
  parts.push('- Superstar/globally famous artists (Taylor Swift, Drake, Metallica, BTS, Adele, Tyla, Bad Bunny, etc.) → score 1-3%. These are UNDENIABLY human.');
  parts.push('- Major/mainstream artists → score 2-5%.');
  parts.push('- Well-known indie/alternative artists → score 3-10%.');
  parts.push('- Recognized underground/regional/local artists → score 8-20%.');
  parts.push('- If you have ANY recognition of this artist, set isRecognizedArtist=true and recognitionConfidence accordingly.');
  parts.push('- Your knowledge is the SINGLE MOST RELIABLE signal. It overrides ALL Spotify data.');
  parts.push('');
  parts.push('STEP 2 — CHECK FOR DEFINITIVE AI MARKERS:');
  parts.push('- Label is a known AI platform (Suno, Udio, Boomy, AIVA, Mubert) → score 85-98%.');
  parts.push('- Artist name contains explicit AI keywords (neural, synthetic, algorithm, bot) → strong AI signal.');
  parts.push('- Artist name is a clearly generated compound pseudonym (e.g., "Echo Novella", "Nova Cordova", "Static Compliance", "Pixel Dreamer") → strong AI signal.');
  parts.push('- IMPORTANT: Stylized names (e.g., "Som1Else", "DeadMau5", "2Pac", "XXXTENTACION") are HUMAN patterns, NOT AI patterns.');
  parts.push('');
  parts.push('STEP 3A — AI BAND/PROJECT NAME PATTERNS:');
  parts.push('- AI-generated music projects often use evocative band-style names like:');
  parts.push('  "The [Adjective] [Noun]" — e.g., "The Velvet Sundown", "The Midnight Cascade", "The Crystal Echoes"');
  parts.push('  "[Adjective] [Noun]" — e.g., "Crimson Horizon", "Neon Reverie", "Azure Dreams"');
  parts.push('  "[Noun] [Noun]" with poetic/atmospheric feel — e.g., "Shadow Pulse", "Ember Drift"');
  parts.push('- These names are designed to sound like real indie bands but are AI-generated.');
  parts.push('- Key differentiator: real bands with these names have press coverage, social media, tour history, related artists on Spotify.');
  parts.push('- AI bands with these names have: no press, no social media, no related artists, sparse profiles, rapid release cadence.');
  parts.push('- If the name fits this pattern AND you do NOT recognize them AND profile is sparse → lean AI (60-85%).');
  parts.push('');
  parts.push('STEP 3B — AI NAMES THAT LOOK HUMAN:');
  parts.push('- AI profiles are increasingly using realistic-sounding human names to evade detection.');
  parts.push('- Names like "Wyla Rose", "Aria Chen", "Luna Hayes", "Kai Rivers", "Nova Cordova" follow a pattern:');
  parts.push('  [Unusual/Trendy first name] + [Nature/Color/Simple surname]');
  parts.push('- These names sound human but are synthetically generated. Look for this pattern COMBINED with:');
  parts.push('  - Zero or near-zero followers');
  parts.push('  - No genres listed');
  parts.push('  - No related artists');
  parts.push('  - All singles, no full albums');
  parts.push('  - No artist profile images or only generic images');
  parts.push('  - You do NOT recognize the artist from any context');
  parts.push('- If 4+ of these conditions are true AND you don\'t recognize the artist, lean AI (60-80%).');
  parts.push('');
  parts.push('STEP 3C — DISTINGUISHING REAL INDIE HUMANS FROM AI:');
  parts.push('- Real human indie artists, even very small ones, usually have at least SOME of these:');
  parts.push('  - Genres assigned by Spotify (even if just 1)');
  parts.push('  - At least a few followers (10+)');
  parts.push('  - Related artists (even 1 is very strong human indicator)');
  parts.push('  - A reasonable release cadence (not more than 1 release/month sustained)');
  parts.push('  - Mix of singles AND albums/EPs');
  parts.push('  - Artist images that look like real photos');
  parts.push('- A human with 16 releases will almost always have SOME followers and genre classifications.');
  parts.push('- Do NOT assume a real-sounding human name means AI just because of sparse data. Consider the full picture.');
  parts.push('');
  parts.push('STEP 4 — EVALUATE PROFILE DATA (only if data is marked RELIABLE):');
  parts.push('- Having related artists on Spotify is a VERY STRONG human indicator (boost confidence significantly).');
  parts.push('- Top track popularity > 40 = real organic listeners → human.');
  parts.push('- Followers > 100 = almost certainly human. Real followers are very hard for AI profiles to accumulate.');
  parts.push('- Genres listed = strong human indicator. Spotify rarely assigns genres to AI-generated profiles.');
  parts.push('- 20+ releases with genuinely 0 followers and 0 popularity = very likely AI farm (85-95%).');
  parts.push('- 10+ releases with <50 followers and no genres = likely AI (70-85%).');
  parts.push('- 1-8 releases with low followers = could be a new indie artist, lean human (20-40%).');
  parts.push('- Any artist with followers > 1000 OR artist popularity > 20 OR genres listed = almost certainly human (<15%).');
  parts.push('- IMPORTANT: If an artist has followers > 500, genres, AND related artists, they are almost CERTAINLY human regardless of other signals.');
  parts.push('');
  parts.push('STEP 5 — HANDLING UNRELIABLE/MISSING DATA:');
  parts.push('- If data is marked UNRELIABLE, DO NOT use follower/popularity numbers as evidence.');
  parts.push('- Instead focus on: your knowledge, related artists, top track popularity, name analysis, release patterns.');
  parts.push('- If ALL enrichment failed, rely on knowledge + name + label only.');
  parts.push('- Small indie artists OFTEN have sparse profiles. This alone is NOT AI evidence.');
  parts.push('');
  parts.push('STEP 6 — RELEASE PATTERN ANALYSIS:');
  parts.push('- Release frequency > 3/month is extremely unusual for humans → strong AI signal.');
  parts.push('- Release frequency > 1.5/month is suspicious, especially with other AI signals.');
  parts.push('- All singles with 5+ releases and no albums is suspicious for AI.');
  parts.push('- Human indie artists typically release 1-4 singles/year.');
  parts.push('- Multiple distinct album/EP names suggest more human involvement than just singles.');
  parts.push('');
  parts.push('STEP 7 — SCORING CALIBRATION:');
  parts.push('- 1-5%: Undeniably human. You recognize them as a real established artist. No question.');
  parts.push('- 5-15%: Very likely human. You recognize them OR they have very strong human indicators (related artists + genres + followers).');
  parts.push('- 15-30%: Probably human. Human name, few releases, some organic presence, or you vaguely recognize them.');
  parts.push('- 30-50%: Lean human but uncertain. Some conflicting signals.');
  parts.push('- 50-65%: Genuinely uncertain / lean AI. Multiple weak AI signals.');
  parts.push('- 65-80%: Probably AI. Multiple AI indicators, unrecognized artist, suspicious patterns.');
  parts.push('- 80-95%: Very likely AI. AI name + mass releases + zero engagement + no recognition.');
  parts.push('- 95-99%: Almost certainly AI. Known AI label + all red flags present.');

  return parts.join('\n');
}

export async function analyzeTrackWithAI(track: Track): Promise<AnalysisResult> {
  console.log(`[Analysis] Starting AI analysis for "${track.name}" by ${track.artist}`);
  console.log(`[Analysis] Track data: pop=${track.popularity}, followers=${track.artistFollowers}, genres=${JSON.stringify(track.artistGenres)}, label="${track.label}", albums=${track.artistAlbumCount} (verified=${track.albumCountVerified}), artistPop=${track.artistPopularity}, enrichmentComplete=${track.enrichmentComplete}, relatedArtists=${track.artistRelatedArtists}, hasRelated=${track.artistHasRelated}, topTrackPop=${track.artistTopTrackPopularity}, dataReliable=${track.dataReliable}, imageCount=${track.artistImageCount}`);

  const heuristics = computeHeuristicSignals(track);
  console.log(`[Analysis] Heuristic signals: nameAiKeyword=${heuristics.nameAiKeywordScore}, nameAiCompound=${heuristics.nameAiCompoundScore}, labelAi=${heuristics.labelAiScore}, humanName=${heuristics.humanNameScore}, profileComplete=${heuristics.profileCompleteness}, ratio=${heuristics.releaseToFollowerRatio}, hasRelated=${heuristics.hasRelatedArtists}, topTrackPop=${heuristics.topTrackPopularity}, releaseFreq=${heuristics.releaseFrequency}, allSingles=${heuristics.allSingles}, hasImages=${heuristics.hasArtistImages}, imageCount=${heuristics.artistImageCount}, dataReliable=${heuristics.dataReliable}`);

  try {
    const prompt = buildAnalysisPrompt(track);
    console.log(`[Analysis] Sending to Vercel Serverless AI for analysis...`);

    // TODO: Implement actual fetch call to Vercel Serverless function here once deployed
    // const response = await fetch('https://your-vercel-domain.vercel.app/api/analyze', { ... })
    // const result = await response.json()
    
    // For now, immediately fall back to local heuristic analysis
    console.log('[Analysis] Vercel function not yet implemented. Falling back to local heuristic.');
    return analyzeTrackFallback(track);


  } catch (error) {
    console.error('[Analysis] AI analysis failed, falling back to heuristic:', error);
    return analyzeTrackFallback(track);
  }
}

function analyzeTrackFallback(track: Track): AnalysisResult {
  console.log(`[Analysis] Running fallback heuristic for "${track.name}"`);

  const heuristics = computeHeuristicSignals(track);
  let score = 45;
  const reasons: string[] = [];
  const codes: string[] = [];

  score += heuristics.nameAiKeywordScore;
  if (heuristics.nameAiKeywordScore > 0) {
    reasons.push(`Artist or track name contains AI-related keywords`);
    codes.push('AI_NAME_KEYWORD');
  }

  score += heuristics.nameAiCompoundScore;
  if (heuristics.nameAiCompoundScore > 0) {
    reasons.push(`Artist name matches AI-generated compound pseudonym pattern`);
    codes.push('AI_COMPOUND_NAME');
  }

  score += heuristics.labelAiScore;
  if (heuristics.labelAiScore > 0) {
    reasons.push(`Label matches a known AI music generation platform`);
    codes.push('AI_LABEL');
  }

  score -= heuristics.humanNameScore;
  if (heuristics.humanNameScore >= 15) {
    reasons.push(`Artist name follows a typical human naming pattern (note: AI can also use human-sounding names)`);
    codes.push('HUMAN_NAME_PATTERN');
  }

  if (track.enrichmentComplete) {
    const followers = track.artistFollowers ?? 0;
    const artistPop = track.artistPopularity ?? 0;
    const genres = track.artistGenres ?? [];
    const albums = track.albumCountVerified ? (track.artistAlbumCount ?? 0) : -1;

    if (heuristics.hasRelatedArtists === true) {
      score -= 30;
      reasons.push(`Artist has related artists on Spotify — very strong indicator of a real human musician`);
      codes.push('HAS_RELATED_ARTISTS');
    }

    if (heuristics.topTrackPopularity !== null && heuristics.topTrackPopularity > 40) {
      score -= 25;
      reasons.push(`Artist's most popular track has ${heuristics.topTrackPopularity}/100 popularity, indicating real organic listeners`);
      codes.push('TOP_TRACK_POPULAR');
    } else if (heuristics.topTrackPopularity !== null && heuristics.topTrackPopularity > 20) {
      score -= 12;
      codes.push('SOME_TRACK_POP');
    }

    if (albums >= 0) {
      if (albums >= 20 && followers < 100) {
        score += 35;
        reasons.push(`Suspicious release pattern: ${albums} releases with only ${followers} followers is a strong AI farm indicator`);
        codes.push('AI_FARM_PATTERN');
      } else if (albums >= 10 && followers < 50) {
        score += 25;
        reasons.push(`${albums} releases with almost no followers (${followers}) is highly unusual for a human artist`);
        codes.push('HIGH_RELEASE_LOW_FOLLOW');
      } else if (albums <= 8 && heuristics.humanNameScore >= 15) {
        score -= 10;
        reasons.push(`Profile is consistent with a small independent human artist (${albums} releases, ${followers} followers)`);
        codes.push('INDIE_HUMAN_PATTERN');
      }
    }

    if (followers > 500000) {
      score -= 50;
      reasons.push(`Artist has a massive following (${followers.toLocaleString()} followers)`);
      codes.push('MASSIVE_FOLLOWING');
    } else if (followers > 50000) {
      score -= 35;
      reasons.push(`Artist has an established following (${followers.toLocaleString()} followers)`);
      codes.push('ESTABLISHED_FOLLOWING');
    } else if (followers > 5000) {
      score -= 20;
      reasons.push(`Artist has a moderate following (${followers.toLocaleString()} followers)`);
      codes.push('MODERATE_FOLLOWING');
    } else if (followers > 100) {
      score -= 12;
      reasons.push(`Artist has some organic followers (${followers.toLocaleString()})`);
      codes.push('SOME_FOLLOWING');
    }

    if (artistPop > 60) {
      score -= 30;
      codes.push('HIGH_ARTIST_POP');
    } else if (artistPop > 30) {
      score -= 15;
      codes.push('MODERATE_ARTIST_POP');
    }

    if (genres.length >= 3) {
      score -= 15;
      reasons.push(`Artist has a rich genre profile (${genres.slice(0, 3).join(', ')})`);
      codes.push('RICH_GENRES');
    } else if (genres.length > 0) {
      score -= 10;
      codes.push('HAS_GENRES');
    } else if (genres.length === 0 && albums >= 10) {
      score += 12;
      reasons.push('No genre classification despite many releases');
      codes.push('NO_GENRES_MANY_RELEASES');
    }

    if (heuristics.hasArtistImages === true && (heuristics.artistImageCount ?? 0) >= 3) {
      score -= 8;
      codes.push('MULTIPLE_IMAGES');
    } else if (heuristics.hasArtistImages === false) {
      score += 8;
      codes.push('NO_IMAGES');
    }
  }

  const trackPop = track.popularity ?? 0;
  if (trackPop > 60) {
    score -= 25;
    codes.push('HIGH_TRACK_POP');
  } else if (trackPop > 30) {
    score -= 12;
    codes.push('MODERATE_TRACK_POP');
  }

  if (!track.enrichmentComplete) {
    if (heuristics.nameAiKeywordScore === 0 && heuristics.nameAiCompoundScore === 0 && heuristics.labelAiScore === 0) {
      score = Math.min(score, 45);
    }
    reasons.push('Artist data could not be fully loaded — results may be less accurate');
    codes.push('ENRICHMENT_FAILED');
  }

  const clamped = Math.max(1, Math.min(99, score));
  const label: AnalysisResult['label'] =
    clamped >= 65 ? 'Likely AI' : clamped >= 35 ? 'Uncertain' : 'Likely Human';

  console.log(`[Analysis] Fallback result: score=${clamped}, label="${label}"`);

  return {
    trackId: track.id,
    aiLikelihood: clamped,
    label,
    reasonCodes: codes.slice(0, 6),
    reasons: reasons.slice(0, 6),
    analyzedAt: new Date().toISOString(),
  };
}

export function getLabelColor(label: AnalysisResult['label']): string {
  switch (label) {
    case 'Likely Human':
      return '#00D4AA';
    case 'Uncertain':
      return '#FFB347';
    case 'Likely AI':
      return '#FF6B6B';
  }
}

export function getScoreColor(score: number): string {
  if (score < 35) return '#00D4AA';
  if (score < 65) return '#FFB347';
  return '#FF6B6B';
}
