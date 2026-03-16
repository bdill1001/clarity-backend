export interface Track {
  id: string;
  name: string;
  artist: string;
  artistIds: string[];
  album: string;
  albumArt: string;
  releaseDate: string;
  popularity: number;
  durationMs: number;
  label?: string;
  externalUrl?: string;
  artistFollowers?: number;
  artistGenres?: string[];
  artistPopularity?: number;
  artistName?: string;
  artistAlbumCount?: number;
  artistRelatedArtists?: number;
  artistHasRelated?: boolean;
  artistTopTrackPopularity?: number;
  labelVerified?: boolean;
  enrichmentComplete?: boolean;
  albumCountVerified?: boolean;
  artistHasImages?: boolean;
  artistImageCount?: number;
  releaseFrequency?: number;
  oldestReleaseDate?: string;
  newestReleaseDate?: string;
  allSingles?: boolean;
  artistRawFollowers?: number;
  dataReliable?: boolean;
  dataReliabilityNote?: string;
  trackArtistCount?: number;
  albumTrackCount?: number;
  albumLabelFromAlbum?: string;
  distinctAlbumNames?: number;
  averageTrackPopularity?: number;
  hasLyrics?: boolean;
  accessToken?: string;
  artistId?: string;
}

export interface AnalysisResult {
  trackId: string;
  aiLikelihood: number;
  label: 'Likely Human' | 'Unsure' | 'Likely AI';
  reasonCodes: string[];
  reasons: string[];
  analyzedAt: string;
}

export interface AnalyzedTrack {
  track: Track;
  analysis: AnalysisResult;
}

export interface UserFeedback {
  trackId: string;
  userLabel: 'HUMAN' | 'AI' | 'UNSURE';
  createdAt: string;
}

export type FilterType = 'all' | 'human' | 'unsure' | 'ai';

export interface AppSettings {
  autoDetect: boolean;
  notificationSound: boolean;
  alertThreshold: number;
  isOnboarded: boolean;
  spotifyConnected: boolean;
  subscriptionStatus: 'free' | 'trial_active' | 'subscribed';
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoDetect: true,
  notificationSound: true,
  alertThreshold: 75,
  isOnboarded: false,
  spotifyConnected: false,
  subscriptionStatus: 'free',
};
