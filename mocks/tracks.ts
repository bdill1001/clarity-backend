import { Track, AnalyzedTrack } from '@/types';

export const MOCK_TRACKS: Track[] = [
  {
    id: 'track_001',
    name: 'Midnight Echoes',
    artist: 'SynthVault',
    artistIds: ['art_001'],
    album: 'Digital Dreams Vol. 47',
    albumArt: 'https://images.unsplash.com/photo-1614149162883-504ce4d13909?w=300&h=300&fit=crop',
    releaseDate: '2025-12-15',
    popularity: 12,
    durationMs: 195000,
    label: 'AI Music Factory',
  },
  {
    id: 'track_002',
    name: 'Golden Hour',
    artist: 'Maya Chen',
    artistIds: ['art_002'],
    album: 'Sunlit Stories',
    albumArt: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop',
    releaseDate: '2025-09-20',
    popularity: 72,
    durationMs: 234000,
    label: 'Interscope Records',
  },
  {
    id: 'track_003',
    name: 'Lo-Fi Daydream #128',
    artist: 'ChillBot3000',
    artistIds: ['art_003'],
    album: 'Ambient Study Beats Collection',
    albumArt: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=300&h=300&fit=crop',
    releaseDate: '2026-01-03',
    popularity: 8,
    durationMs: 180000,
  },
  {
    id: 'track_004',
    name: 'Broken Strings',
    artist: 'The Revivalists',
    artistIds: ['art_004'],
    album: 'Pour It Out Into The Night',
    albumArt: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
    releaseDate: '2025-06-14',
    popularity: 65,
    durationMs: 248000,
    label: 'Loma Vista Recordings',
  },
  {
    id: 'track_005',
    name: 'Serenity Flow',
    artist: 'AI Melodics',
    artistIds: ['art_005'],
    album: 'Calm Frequencies EP 12',
    albumArt: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&h=300&fit=crop',
    releaseDate: '2026-02-01',
    popularity: 4,
    durationMs: 210000,
  },
  {
    id: 'track_006',
    name: 'City Lights',
    artist: 'Juno Park',
    artistIds: ['art_006'],
    album: 'Neon Postcards',
    albumArt: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop',
    releaseDate: '2025-11-08',
    popularity: 58,
    durationMs: 215000,
    label: 'Republic Records',
  },
  {
    id: 'track_007',
    name: 'Ambient Texture #77',
    artist: 'GenWave',
    artistIds: ['art_007'],
    album: 'Textures Vol. 9',
    albumArt: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop',
    releaseDate: '2026-02-10',
    popularity: 3,
    durationMs: 175000,
  },
  {
    id: 'track_008',
    name: 'Wildflower',
    artist: 'Billie Marten',
    artistIds: ['art_008'],
    album: 'Drop Cherries',
    albumArt: 'https://images.unsplash.com/photo-1484876065684-b683cf17d276?w=300&h=300&fit=crop',
    releaseDate: '2025-03-22',
    popularity: 48,
    durationMs: 226000,
    label: 'Fiction Records',
  },
];

export const DEMO_NOW_PLAYING: Track = MOCK_TRACKS[0];

export function getMockHistory(): AnalyzedTrack[] {
  return MOCK_TRACKS.map((track) => {
    const score = generateDeterministicScore(track);
    return {
      track,
      analysis: {
        trackId: track.id,
        aiLikelihood: score.likelihood,
        label: score.label,
        reasonCodes: score.reasonCodes,
        reasons: score.reasons,
        analyzedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  });
}

function generateDeterministicScore(track: Track): {
  likelihood: number;
  label: 'Likely Human' | 'Uncertain' | 'Likely AI';
  reasonCodes: string[];
  reasons: string[];
} {
  let score = 0;
  const reasonCodes: string[] = [];
  const reasons: string[] = [];

  if (track.popularity < 15) {
    score += 25;
    reasonCodes.push('LOW_POPULARITY');
    reasons.push('Signals suggest very low listener engagement relative to catalog size');
  }

  if (track.name.match(/#\d+|Vol\.|EP\s*\d|Collection/i)) {
    score += 20;
    reasonCodes.push('TEMPLATE_NAMING');
    reasons.push('Track naming follows repetitive template patterns common in AI catalogs');
  }

  if (!track.label || track.label.toLowerCase().includes('ai') || track.label.toLowerCase().includes('factory')) {
    score += 15;
    reasonCodes.push('SUSPECT_LABEL');
    reasons.push('Distribution label signals suggest automated publishing pipeline');
  }

  if (track.artist.match(/bot|gen|synth|ai|melodic/i)) {
    score += 20;
    reasonCodes.push('ARTIST_NAME_PATTERN');
    reasons.push('Artist identity patterns are consistent with AI-generated content profiles');
  }

  const releaseYear = new Date(track.releaseDate).getFullYear();
  if (releaseYear >= 2026 && track.popularity < 20) {
    score += 10;
    reasonCodes.push('RECENT_LOW_TRACTION');
    reasons.push('Very recent release with minimal organic traction detected');
  }

  if (track.durationMs < 185000 && track.popularity < 20) {
    score += 10;
    reasonCodes.push('SHORT_DURATION');
  }

  score = Math.min(score, 98);

  const label: 'Likely Human' | 'Uncertain' | 'Likely AI' =
    score >= 70 ? 'Likely AI' : score >= 30 ? 'Uncertain' : 'Likely Human';

  return {
    likelihood: score,
    label,
    reasonCodes: reasonCodes.slice(0, 5),
    reasons: reasons.slice(0, 3),
  };
}
