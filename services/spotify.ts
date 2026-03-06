import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { Track } from '@/types';

const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || '';
const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-read-recently-played',
];

const TOKEN_KEY = 'spotify_access_token';
const REFRESH_KEY = 'spotify_refresh_token';
const EXPIRY_KEY = 'spotify_token_expiry';

export const spotifyDiscovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: SPOTIFY_TOKEN_ENDPOINT,
};

export const spotifyRedirectUri = AuthSession.makeRedirectUri({
  scheme: 'clarity-app',
});

export function useSpotifyAuthRequest() {
  console.log('[Spotify] Creating auth request with redirect:', spotifyRedirectUri);
  return AuthSession.useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      scopes: SCOPES,
      redirectUri: spotifyRedirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    },
    spotifyDiscovery
  );
}

export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  try {
    console.log('[Spotify] Exchanging code for token...');
    const body = [
      'grant_type=authorization_code',
      `code=${encodeURIComponent(code)}`,
      `redirect_uri=${encodeURIComponent(spotifyRedirectUri)}`,
      `client_id=${encodeURIComponent(SPOTIFY_CLIENT_ID)}`,
      `code_verifier=${encodeURIComponent(codeVerifier)}`,
    ].join('&');

    const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Spotify] Token exchange failed:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log('[Spotify] Token exchange successful, expires in:', data.expires_in);

    const expiresAt = Date.now() + data.expires_in * 1000;
    await saveTokens(data.access_token, data.refresh_token, expiresAt);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    console.error('[Spotify] Token exchange error:', error);
    return null;
  }
}

let _lastRefreshFailed = false;

export function didLastRefreshFail(): boolean {
  return _lastRefreshFailed;
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!refreshToken) {
      console.log('[Spotify] No refresh token available');
      _lastRefreshFailed = true;
      return null;
    }

    console.log('[Spotify] Refreshing access token...');
    const body = [
      'grant_type=refresh_token',
      `refresh_token=${encodeURIComponent(refreshToken)}`,
      `client_id=${encodeURIComponent(SPOTIFY_CLIENT_ID)}`,
    ].join('&');

    const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Spotify] Token refresh failed:', response.status, errorText);
      _lastRefreshFailed = true;

      if (response.status === 400 || response.status === 401) {
        console.error('[Spotify] Refresh token is revoked or invalid. Clearing tokens.');
        await clearTokens();
      }
      return null;
    }

    const data = await response.json();
    console.log('[Spotify] Token refresh successful');
    _lastRefreshFailed = false;

    const expiresAt = Date.now() + data.expires_in * 1000;
    await saveTokens(data.access_token, data.refresh_token || refreshToken, expiresAt);

    return data.access_token;
  } catch (error) {
    console.error('[Spotify] Token refresh error:', error);
    _lastRefreshFailed = true;
    return null;
  }
}

async function saveTokens(accessToken: string, refreshToken: string, expiresAt: number): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  await SecureStore.setItemAsync(EXPIRY_KEY, expiresAt.toString());
}

export async function getValidAccessToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const expiryStr = await SecureStore.getItemAsync(EXPIRY_KEY);

    if (!token || !expiryStr) {
      console.log('[Spotify] No stored token found');
      return null;
    }

    const expiresAt = parseInt(expiryStr, 10);
    if (Date.now() > expiresAt - 60000) {
      console.log('[Spotify] Token expired or expiring soon, refreshing...');
      return await refreshAccessToken();
    }

    return token;
  } catch (error) {
    console.error('[Spotify] Error getting valid token:', error);
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(EXPIRY_KEY);
  console.log('[Spotify] Tokens cleared');
}

export async function hasStoredTokens(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return !!token;
}

export async function getStoredTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const accessToken = await SecureStore.getItemAsync(TOKEN_KEY);
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function validateStoredTokens(): Promise<'valid' | 'refreshed' | 'invalid'> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    const expiryStr = await SecureStore.getItemAsync(EXPIRY_KEY);

    if (!token || !refreshToken) {
      console.log('[Spotify] No stored tokens found during validation');
      return 'invalid';
    }

    const expiresAt = expiryStr ? parseInt(expiryStr, 10) : 0;
    const isExpired = Date.now() > expiresAt - 60000;

    if (!isExpired) {
      console.log('[Spotify] Validating current token with API...');
      try {
        const response = await fetchWithTimeout(`${SPOTIFY_API_BASE}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }, 5000);

        if (response.ok) {
          console.log('[Spotify] Current token is valid');
          return 'valid';
        }

        if (response.status === 401) {
          console.log('[Spotify] Token returned 401 despite not expired, will refresh');
        } else {
          console.warn(`[Spotify] Token validation got status ${response.status}`);
        }
      } catch (e) {
        console.warn('[Spotify] Token validation network error, will try refresh:', e);
      }
    } else {
      console.log('[Spotify] Token is expired, will attempt refresh');
    }

    console.log('[Spotify] Attempting token refresh during validation...');
    const newToken = await refreshAccessToken();
    if (newToken) {
      console.log('[Spotify] Token refreshed successfully during validation');
      return 'refreshed';
    }

    console.warn('[Spotify] Token refresh failed during validation — tokens are invalid');
    await clearTokens();
    return 'invalid';
  } catch (error) {
    console.error('[Spotify] validateStoredTokens error:', error);
    return 'invalid';
  }
}

interface SpotifyArtist {
  id: string;
  name: string;
}

interface SpotifyAlbum {
  name: string;
  images: { url: string; width: number; height: number }[];
  release_date: string;
  label?: string;
}

interface SpotifyTrackItem {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  popularity: number;
  duration_ms: number;
  external_urls: { spotify: string };
}

interface SpotifyNowPlaying {
  is_playing: boolean;
  item: SpotifyTrackItem | null;
  currently_playing_type: string;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 6000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function spotifyFetch(url: string, token: string, maxRetries: number = 2): Promise<Response | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${token}` },
      }, 6000);

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (attempt + 1) * 1500;
        console.warn(`[Spotify] Rate limited (429) on ${url}, waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}`);
        await delay(waitMs);
        continue;
      }

      if (response.status === 401) {
        console.warn(`[Spotify] Token expired (401) on ${url}, refreshing...`);
        const newToken = await refreshAccessToken();
        if (newToken) {
          token = newToken;
          continue;
        }
        return null;
      }

      if (!response.ok) {
        console.warn(`[Spotify] Request failed: ${response.status} for ${url}`);
        if (attempt < maxRetries - 1) {
          await delay((attempt + 1) * 800);
          continue;
        }
        return null;
      }

      return response;
    } catch (error) {
      console.warn(`[Spotify] Network error on ${url} (attempt ${attempt + 1}):`, error);
      if (attempt < maxRetries - 1) {
        await delay((attempt + 1) * 1000);
        continue;
      }
      return null;
    }
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function spotifyFetchJson<T>(url: string, token: string, maxRetries: number = 3): Promise<T | null> {
  const response = await spotifyFetch(url, token, maxRetries);
  if (!response) return null;
  try {
    const text = await response.text();
    if (!text || text.trim().length === 0) {
      console.warn(`[Spotify] Empty response body from ${url}`);
      return null;
    }
    return JSON.parse(text) as T;
  } catch (error) {
    console.warn(`[Spotify] JSON parse error for ${url}:`, error);
    return null;
  }
}

async function tryCurrentlyPlaying(token: string): Promise<{ track: Track | null; status: 'found' | 'empty' | 'auth_error' | 'error'; newToken?: string }> {
  const url = `${SPOTIFY_API_BASE}/me/player/currently-playing`;
  console.log('[Spotify] Trying /me/player/currently-playing...');

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let currentToken = attempt === 0 ? token : (await getValidAccessToken() || token);

      const response = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${currentToken}` },
      }, 6000);

      if (response.status === 204) {
        console.log('[Spotify] currently-playing returned 204 (empty)');
        return { track: null, status: 'empty' };
      }

      if (response.status === 401) {
        console.log('[Spotify] currently-playing got 401, refreshing token...');
        const newToken = await refreshAccessToken();
        if (!newToken) return { track: null, status: 'auth_error' };
        token = newToken;
        continue;
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
        console.warn(`[Spotify] currently-playing rate limited, waiting ${waitMs}ms`);
        await delay(waitMs);
        continue;
      }

      if (!response.ok) {
        console.warn(`[Spotify] currently-playing error: ${response.status}`);
        return { track: null, status: 'error' };
      }

      const text = await response.text();
      if (!text || text.trim().length === 0) {
        console.log('[Spotify] currently-playing empty body');
        return { track: null, status: 'empty' };
      }

      const data: SpotifyNowPlaying = JSON.parse(text);
      const baseTrack = mapSpotifyTrack(data);
      if (!baseTrack) return { track: null, status: 'empty' };
      return { track: baseTrack, status: 'found', newToken: token };
    } catch (e) {
      console.warn(`[Spotify] currently-playing attempt ${attempt + 1} error:`, e);
      if (attempt === 0) { await delay(1000); continue; }
    }
  }
  return { track: null, status: 'error' };
}

interface SpotifyPlayerState {
  is_playing: boolean;
  currently_playing_type: string;
  item: SpotifyTrackItem | null;
  device?: { id: string; name: string; is_active: boolean };
}

async function tryPlayerState(token: string): Promise<{ track: Track | null; status: 'found' | 'empty' | 'auth_error' | 'error' }> {
  const url = `${SPOTIFY_API_BASE}/me/player`;
  console.log('[Spotify] Trying /me/player (playback state)...');

  try {
    const response = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}` },
    }, 6000);

    if (response.status === 204) {
      console.log('[Spotify] /me/player returned 204 (no active device)');
      return { track: null, status: 'empty' };
    }

    if (response.status === 401) {
      console.log('[Spotify] /me/player got 401');
      return { track: null, status: 'auth_error' };
    }

    if (!response.ok) {
      console.warn(`[Spotify] /me/player error: ${response.status}`);
      return { track: null, status: 'error' };
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) {
      console.log('[Spotify] /me/player empty body');
      return { track: null, status: 'empty' };
    }

    const data: SpotifyPlayerState = JSON.parse(text);
    console.log(`[Spotify] /me/player: is_playing=${data.is_playing}, type=${data.currently_playing_type}, device=${data.device?.name ?? 'none'}, has_item=${!!data.item}`);

    if (!data.item || data.currently_playing_type !== 'track') {
      return { track: null, status: 'empty' };
    }

    const nowPlaying: SpotifyNowPlaying = {
      is_playing: data.is_playing,
      item: data.item,
      currently_playing_type: data.currently_playing_type,
    };
    const baseTrack = mapSpotifyTrack(nowPlaying);
    if (!baseTrack) return { track: null, status: 'empty' };
    return { track: baseTrack, status: 'found' };
  } catch (e) {
    console.warn('[Spotify] /me/player error:', e);
    return { track: null, status: 'error' };
  }
}

interface SpotifyRecentItem {
  track: SpotifyTrackItem;
  played_at: string;
}

async function tryRecentlyPlayed(token: string): Promise<{ track: Track | null; status: 'found' | 'empty' | 'error' }> {
  const url = `${SPOTIFY_API_BASE}/me/player/recently-played?limit=1`;
  console.log('[Spotify] Trying /me/player/recently-played...');

  try {
    const response = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}` },
    }, 6000);

    if (!response.ok) {
      console.warn(`[Spotify] recently-played error: ${response.status}`);
      return { track: null, status: 'error' };
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) {
      return { track: null, status: 'empty' };
    }

    const data = JSON.parse(text) as { items?: SpotifyRecentItem[] };
    if (!data.items || data.items.length === 0) {
      console.log('[Spotify] recently-played: no items');
      return { track: null, status: 'empty' };
    }

    const recent = data.items[0];
    console.log(`[Spotify] recently-played: "${recent.track.name}" played at ${recent.played_at}`);

    const playedAt = new Date(recent.played_at).getTime();
    const now = Date.now();
    const ageMinutes = (now - playedAt) / 60000;

    if (ageMinutes > 10) {
      console.log(`[Spotify] recently-played track is ${ageMinutes.toFixed(1)} min old, too stale`);
      return { track: null, status: 'empty' };
    }

    const albumArt =
      recent.track.album.images.find((img) => img.width >= 300)?.url ||
      recent.track.album.images[0]?.url ||
      '';

    const track: Track = {
      id: recent.track.id,
      name: recent.track.name,
      artist: recent.track.artists.map((a) => a.name).join(', '),
      artistIds: recent.track.artists.map((a) => a.id),
      album: recent.track.album.name,
      albumArt,
      releaseDate: recent.track.album.release_date || '',
      popularity: recent.track.popularity ?? -1,
      durationMs: recent.track.duration_ms ?? 0,
      label: recent.track.album.label,
      externalUrl: recent.track.external_urls.spotify,
    };

    return { track, status: 'found' };
  } catch (e) {
    console.warn('[Spotify] recently-played error:', e);
    return { track: null, status: 'error' };
  }
}

export async function fetchNowPlaying(): Promise<{ track: Track | null; error?: string }> {
  const token = await getValidAccessToken();
  if (!token) {
    console.log('[Spotify] No valid token for now-playing fetch');
    return { track: null, error: 'No valid Spotify token. Try reconnecting in Settings.' };
  }

  try {
    console.log('[Spotify] === fetchNowPlaying START ===');

    const result1 = await tryCurrentlyPlaying(token);
    const activeToken = result1.newToken || token;

    if (result1.status === 'auth_error') {
      return { track: null, error: 'Spotify session expired. Try reconnecting in Settings.' };
    }

    if (result1.status === 'found' && result1.track) {
      console.log(`[Spotify] Found track via currently-playing: "${result1.track.name}"`);
      return { track: result1.track };
    }

    console.log('[Spotify] currently-playing returned no track, trying /me/player...');

    const result2 = await tryPlayerState(activeToken);

    if (result2.status === 'auth_error') {
      const refreshed = await refreshAccessToken();
      if (!refreshed) {
        return { track: null, error: 'Spotify session expired. Try reconnecting in Settings.' };
      }
      const retry = await tryPlayerState(refreshed);
      if (retry.status === 'found' && retry.track) {
        console.log(`[Spotify] Found track via /me/player (after refresh): "${retry.track.name}"`);
        return { track: retry.track };
      }
    }

    if (result2.status === 'found' && result2.track) {
      console.log(`[Spotify] Found track via /me/player: "${result2.track.name}"`);
      return { track: result2.track };
    }

    console.log('[Spotify] /me/player returned no track, trying recently-played...');

    const result3 = await tryRecentlyPlayed(activeToken);

    if (result3.status === 'found' && result3.track) {
      console.log(`[Spotify] Found recent track: "${result3.track.name}"`);
      return { track: result3.track };
    }

    console.log('[Spotify] === fetchNowPlaying END — no track found across all endpoints ===');
    return { track: null };
  } catch (error) {
    console.error('[Spotify] Fetch now-playing error:', error);
    return { track: null, error: 'Network error connecting to Spotify' };
  }
}

function mapSpotifyTrack(data: SpotifyNowPlaying): Track | null {
  if (!data.item || data.currently_playing_type !== 'track') {
    console.log('[Spotify] Not a track or no item');
    return null;
  }

  const item = data.item;
  const albumArt =
    item.album.images.find((img) => img.width >= 300)?.url ||
    item.album.images[0]?.url ||
    '';

  const track: Track = {
    id: item.id,
    name: item.name,
    artist: item.artists.map((a) => a.name).join(', '),
    artistIds: item.artists.map((a) => a.id),
    album: item.album.name,
    albumArt,
    releaseDate: item.album.release_date || '',
    popularity: item.popularity ?? -1,
    durationMs: item.duration_ms ?? 0,
    label: item.album.label,
    externalUrl: item.external_urls.spotify,
  };

  console.log(`[Spotify] Mapped track: "${track.name}" by ${track.artist} (pop: ${track.popularity}, label: ${track.label || 'unknown'}, artistIds: ${track.artistIds.join(',')})`);
  return track;
}

interface ArtistDetailsResult {
  name: string;
  followers: number;
  rawFollowers: number;
  genres: string[];
  popularity: number;
  verified: boolean;
  hasImages: boolean;
  imageCount: number;
  searchFollowers?: number;
  searchPopularity?: number;
}

interface AlbumDetails {
  total: number;
  oldestDate: string | null;
  newestDate: string | null;
  releaseFrequency: number;
  allSingles: boolean;
  distinctAlbumNames?: number;
}

export async function enrichTrackData(track: Track): Promise<Track> {
  console.log(`[Spotify] Enriching track data for "${track.name}" by "${track.artist}"...`);
  const enriched = { ...track };

  try {
    const token = await getValidAccessToken();
    if (!token) {
      console.error('[Spotify] No valid token for enrichment');
      enriched.enrichmentComplete = false;
      return enriched;
    }

    const primaryArtistId = track.artistIds[0];
    if (!primaryArtistId) {
      console.warn('[Spotify] No primary artist ID available');
      enriched.enrichmentComplete = false;
      return enriched;
    }

    const artistDetails = await fetchArtistDetailsRobust(primaryArtistId, track.artist, token);

    if (artistDetails) {
      enriched.artistFollowers = artistDetails.followers;
      enriched.artistRawFollowers = artistDetails.rawFollowers;
      enriched.artistGenres = artistDetails.genres;
      enriched.artistPopularity = artistDetails.popularity;
      enriched.artistName = artistDetails.name;
      enriched.artistHasImages = artistDetails.hasImages;
      enriched.artistImageCount = artistDetails.imageCount;
      enriched.enrichmentComplete = true;
      console.log(`[Spotify] Artist enriched: name="${artistDetails.name}", followers=${artistDetails.followers} (raw=${artistDetails.rawFollowers}, search=${artistDetails.searchFollowers ?? 'n/a'}), genres=[${artistDetails.genres.join(', ')}], artistPop=${artistDetails.popularity}, hasImages=${artistDetails.hasImages}, imageCount=${artistDetails.imageCount}`);
    } else {
      console.warn(`[Spotify] Artist enrichment FAILED for "${track.artist}" (id: ${primaryArtistId})`);
      enriched.enrichmentComplete = false;
    }

    await delay(150);

    const freshToken = await getValidAccessToken();
    const activeToken = freshToken || token;

    const [albumCount, relatedCount, topTrackPop] = await Promise.all([
      fetchArtistAlbumCount(primaryArtistId, activeToken),
      fetchRelatedArtistCount(primaryArtistId, activeToken),
      fetchTopTrackPopularity(primaryArtistId, activeToken),
    ]);

    if (albumCount !== -1) {
      enriched.artistAlbumCount = albumCount;
      enriched.albumCountVerified = true;
    } else {
      enriched.artistAlbumCount = undefined;
      enriched.albumCountVerified = false;
    }
    console.log(`[Spotify] Album count: ${enriched.artistAlbumCount} (verified: ${enriched.albumCountVerified})`);

    if (relatedCount !== -1) {
      enriched.artistRelatedArtists = relatedCount;
      enriched.artistHasRelated = relatedCount > 0;
      console.log(`[Spotify] Related artists: ${relatedCount}`);
    } else {
      enriched.artistRelatedArtists = undefined;
      enriched.artistHasRelated = undefined;
    }

    if (topTrackPop !== -1) {
      enriched.artistTopTrackPopularity = topTrackPop;
      console.log(`[Spotify] Top track popularity: ${topTrackPop}`);
    }

    await delay(150);

    const [albumLabel, fullTrackData, albumDetails] = await Promise.all([
      track.label ? Promise.resolve(track.label) : fetchAlbumLabel(track.id, activeToken),
      track.popularity === -1 ? fetchFullTrackDetails(track.id, activeToken) : Promise.resolve(null),
      fetchArtistAlbumDetails(primaryArtistId, activeToken),
    ]);

    if (fullTrackData && track.popularity === -1) {
      enriched.popularity = fullTrackData.popularity ?? 0;
      console.log(`[Spotify] Full track fetch got popularity: ${enriched.popularity}`);
    } else if (track.popularity === -1) {
      enriched.popularity = 0;
    }

    if (albumDetails) {
      enriched.releaseFrequency = albumDetails.releaseFrequency;
      enriched.oldestReleaseDate = albumDetails.oldestDate ?? undefined;
      enriched.newestReleaseDate = albumDetails.newestDate ?? undefined;
      enriched.allSingles = albumDetails.allSingles;
      enriched.distinctAlbumNames = albumDetails.distinctAlbumNames;
      console.log(`[Spotify] Release frequency: ${albumDetails.releaseFrequency.toFixed(2)}/month, allSingles=${albumDetails.allSingles}, span=${albumDetails.oldestDate} to ${albumDetails.newestDate}, distinctNames=${albumDetails.distinctAlbumNames}`);
    }

    if (albumLabel && !track.label) {
      enriched.label = albumLabel;
      enriched.labelVerified = true;
      console.log(`[Spotify] Album label fetched: "${albumLabel}"`);
    } else if (track.label) {
      enriched.labelVerified = true;
    }
  } catch (error) {
    console.warn('[Spotify] Error enriching track data:', error);
    enriched.enrichmentComplete = false;
  }

  enriched.trackArtistCount = track.artistIds.length;

  computeDataReliability(enriched);

  console.log(`[Spotify] FINAL enriched track: pop=${enriched.popularity}, followers=${enriched.artistFollowers}, genres=${JSON.stringify(enriched.artistGenres)}, artistPop=${enriched.artistPopularity}, albums=${enriched.artistAlbumCount}, enrichComplete=${enriched.enrichmentComplete}, dataReliable=${enriched.dataReliable}, trackArtistCount=${enriched.trackArtistCount}`);
  return enriched;
}

async function fetchArtistDetailsRobust(
  artistId: string,
  artistName: string,
  token: string
): Promise<ArtistDetailsResult | null> {
  console.log(`[Spotify] Fetching artist details (robust) for "${artistName}" (id: ${artistId})`);

  const directResult = await fetchArtistDirect(artistId, token);

  await delay(300);

  const searchResult = await searchArtistData(artistName, artistId, token);

  console.log(`[Spotify] Initial results — direct: followers=${directResult?.followers ?? 'null'}, pop=${directResult?.popularity ?? 'null'}, genres=${directResult?.genres?.length ?? 'null'} | search: followers=${searchResult?.followers ?? 'null'}, pop=${searchResult?.popularity ?? 'null'}`);

  if (directResult && searchResult) {
    const finalFollowers = Math.max(directResult.followers, searchResult.followers);
    const finalPopularity = Math.max(directResult.popularity, searchResult.popularity);
    const finalGenres = directResult.genres.length > 0 ? directResult.genres : (searchResult.genres || []);

    console.log(`[Spotify] Merged: followers=${finalFollowers} (direct=${directResult.followers}, search=${searchResult.followers}), popularity=${finalPopularity} (direct=${directResult.popularity}, search=${searchResult.popularity})`);

    if (finalFollowers > 0 || finalPopularity > 0) {
      return {
        ...directResult,
        followers: finalFollowers,
        rawFollowers: directResult.rawFollowers,
        popularity: finalPopularity,
        genres: finalGenres,
        searchFollowers: searchResult.followers,
        searchPopularity: searchResult.popularity,
      };
    }

    console.log(`[Spotify] Both direct and search returned 0/0, retrying with fresh token...`);
    await delay(1500);
    const freshToken = await getValidAccessToken();
    if (freshToken) {
      const retryDirect = await fetchArtistDirect(artistId, freshToken);
      console.log(`[Spotify] Retry direct: followers=${retryDirect?.followers ?? 'null'}, pop=${retryDirect?.popularity ?? 'null'}`);

      await delay(500);
      const retrySearch = await searchArtistData(artistName, artistId, freshToken);
      console.log(`[Spotify] Retry search: followers=${retrySearch?.followers ?? 'null'}, pop=${retrySearch?.popularity ?? 'null'}`);

      const bestDirect = retryDirect || directResult;
      const bestSearch = retrySearch || searchResult;
      const bestFollowers = Math.max(bestDirect.followers, bestSearch?.followers ?? 0, directResult.followers, searchResult.followers);
      const bestPopularity = Math.max(bestDirect.popularity, bestSearch?.popularity ?? 0, directResult.popularity, searchResult.popularity);
      const bestGenres = bestDirect.genres.length > 0 ? bestDirect.genres : (bestSearch?.genres || directResult.genres || []);

      console.log(`[Spotify] Final merged after retry: followers=${bestFollowers}, pop=${bestPopularity}, genres=${bestGenres.length}`);

      return {
        name: bestDirect.name,
        followers: bestFollowers,
        rawFollowers: bestDirect.rawFollowers,
        genres: bestGenres,
        popularity: bestPopularity,
        verified: bestFollowers > 1000 && bestGenres.length > 0,
        hasImages: bestDirect.hasImages || directResult.hasImages,
        imageCount: Math.max(bestDirect.imageCount, directResult.imageCount),
        searchFollowers: bestSearch?.followers ?? searchResult.followers,
        searchPopularity: bestSearch?.popularity ?? searchResult.popularity,
      };
    }

    return {
      ...directResult,
      searchFollowers: searchResult.followers,
      searchPopularity: searchResult.popularity,
    };
  }

  if (directResult && !searchResult) {
    if (directResult.followers > 0 && directResult.popularity > 0) {
      return directResult;
    }

    console.log(`[Spotify] Direct returned 0s and search failed, retrying with fresh token...`);
    await delay(1000);
    const freshToken = await getValidAccessToken();
    if (freshToken) {
      const retryDirect = await fetchArtistDirect(artistId, freshToken);
      if (retryDirect && (retryDirect.followers > 0 || retryDirect.popularity > 0)) {
        return retryDirect;
      }

      await delay(500);
      const retrySearch = await searchArtistData(artistName, artistId, freshToken);
      if (retrySearch) {
        return {
          ...directResult,
          followers: Math.max(directResult.followers, retrySearch.followers),
          popularity: Math.max(directResult.popularity, retrySearch.popularity),
          genres: directResult.genres.length > 0 ? directResult.genres : (retrySearch.genres || []),
          searchFollowers: retrySearch.followers,
          searchPopularity: retrySearch.popularity,
        };
      }
    }

    return directResult;
  }

  if (!directResult && searchResult) {
    console.log(`[Spotify] Direct failed, using search result for "${artistName}"`);
    return {
      name: searchResult.name || artistName,
      followers: searchResult.followers,
      rawFollowers: 0,
      genres: searchResult.genres || [],
      popularity: searchResult.popularity,
      verified: searchResult.followers > 1000 && (searchResult.genres || []).length > 0,
      hasImages: searchResult.hasImages ?? false,
      imageCount: searchResult.imageCount ?? 0,
      searchFollowers: searchResult.followers,
      searchPopularity: searchResult.popularity,
    };
  }

  console.warn(`[Spotify] Both direct and search FAILED for "${artistName}" (${artistId}), trying one final attempt...`);
  await delay(1000);
  const lastToken = await getValidAccessToken();
  if (lastToken) {
    const lastDirect = await fetchArtistDirect(artistId, lastToken);
    if (lastDirect) return lastDirect;
  }

  return null;
}

interface SpotifyArtistData {
  name?: string;
  followers?: { total?: number };
  genres?: string[];
  popularity?: number;
  images?: { url: string }[];
}

async function fetchArtistDirect(artistId: string, token: string): Promise<ArtistDetailsResult | null> {
  const url = `${SPOTIFY_API_BASE}/artists/${artistId}`;
  console.log(`[Spotify] Direct artist fetch: ${url}`);

  const response = await spotifyFetch(url, token, 3);
  if (!response) {
    console.warn(`[Spotify] Direct artist fetch returned no response for ${artistId}`);
    return null;
  }

  let rawText = '';
  try {
    rawText = await response.text();
    if (!rawText || rawText.trim().length === 0) {
      console.warn(`[Spotify] Direct artist fetch returned empty body for ${artistId}`);
      return null;
    }
  } catch (e) {
    console.warn(`[Spotify] Failed to read response text for ${artistId}:`, e);
    return null;
  }

  let data: SpotifyArtistData;
  try {
    data = JSON.parse(rawText) as SpotifyArtistData;
  } catch (e) {
    console.warn(`[Spotify] Failed to parse JSON for artist ${artistId}:`, e);
    return null;
  }

  console.log(`[Spotify] RAW artist API response for ${artistId}: followers=${JSON.stringify(data.followers)}, popularity=${data.popularity}, genres=${JSON.stringify(data.genres)}, name="${data.name}", images=${Array.isArray(data.images) ? data.images.length : 'none'}`);

  const name = data.name ?? 'Unknown';
  const rawFollowers = typeof data.followers?.total === 'number' ? data.followers.total : (typeof (data as Record<string, unknown>).followers === 'number' ? (data as Record<string, unknown>).followers as number : 0);
  const genres = Array.isArray(data.genres) ? data.genres : [];
  const popularity = typeof data.popularity === 'number' ? data.popularity : 0;
  const imageCount = Array.isArray(data.images) ? data.images.length : 0;
  const hasImages = imageCount > 0;

  console.log(`[Spotify] Direct artist parsed: name="${name}", followers=${rawFollowers}, genres=[${genres.join(', ')}], popularity=${popularity}, images=${imageCount}`);

  return {
    name,
    followers: rawFollowers,
    rawFollowers,
    genres,
    popularity,
    verified: rawFollowers > 1000 && genres.length > 0,
    hasImages,
    imageCount,
  };
}

interface SearchArtistResult {
  name: string;
  followers: number;
  popularity: number;
  genres?: string[];
  hasImages?: boolean;
  imageCount?: number;
  id?: string;
}

async function searchArtistData(
  artistName: string,
  expectedArtistId: string,
  token: string
): Promise<SearchArtistResult | null> {
  try {
    const query = encodeURIComponent(`artist:"${artistName}"`);
    const url = `${SPOTIFY_API_BASE}/search?q=${query}&type=artist&limit=10`;
    console.log(`[Spotify] Search API for "${artistName}": ${url}`);

    const data = await spotifyFetchJson<{ artists?: { items?: SpotifySearchArtistItem[] } }>(url, token, 3);
    if (!data?.artists?.items || data.artists.items.length === 0) {
      console.log(`[Spotify] Search returned no results for "${artistName}"`);

      const fallbackQuery = encodeURIComponent(artistName);
      const fallbackUrl = `${SPOTIFY_API_BASE}/search?q=${fallbackQuery}&type=artist&limit=10`;
      console.log(`[Spotify] Trying fallback search without quotes: ${fallbackUrl}`);

      const fallbackData = await spotifyFetchJson<{ artists?: { items?: SpotifySearchArtistItem[] } }>(fallbackUrl, token, 3);
      if (!fallbackData?.artists?.items || fallbackData.artists.items.length === 0) {
        console.log(`[Spotify] Fallback search also returned no results`);
        return null;
      }

      return pickBestSearchMatch(fallbackData.artists.items, artistName, expectedArtistId);
    }

    return pickBestSearchMatch(data.artists.items, artistName, expectedArtistId);
  } catch (error) {
    console.warn('[Spotify] Search artist error:', error);
    return null;
  }
}

interface SpotifySearchArtistItem {
  id?: string;
  name?: string;
  followers?: { total?: number };
  popularity?: number;
  genres?: string[];
  images?: { url: string }[];
}

function pickBestSearchMatch(
  items: SpotifySearchArtistItem[],
  artistName: string,
  expectedArtistId: string
): SearchArtistResult | null {
  if (!items || items.length === 0) return null;

  const idMatch = items.find(a => a.id === expectedArtistId);
  if (idMatch) {
    console.log(`[Spotify] Search found exact ID match: "${idMatch.name}" (${idMatch.id})`);
    return extractSearchResult(idMatch);
  }

  const normalizedName = artistName.toLowerCase().trim();
  const nameMatch = items.find(a => a.name?.toLowerCase().trim() === normalizedName);
  if (nameMatch) {
    console.log(`[Spotify] Search found exact name match: "${nameMatch.name}" (${nameMatch.id})`);
    return extractSearchResult(nameMatch);
  }

  const closeMatch = items.find(a => {
    const n = a.name?.toLowerCase().trim() ?? '';
    return n.includes(normalizedName) || normalizedName.includes(n);
  });
  if (closeMatch) {
    console.log(`[Spotify] Search found close name match: "${closeMatch.name}" (${closeMatch.id})`);
    return extractSearchResult(closeMatch);
  }

  console.log(`[Spotify] Search found no good match for "${artistName}" among: ${items.map(i => `"${i.name}" (${i.id})`).join(', ')}`);
  return null;
}

function extractSearchResult(item: SpotifySearchArtistItem): SearchArtistResult {
  const followers = typeof item.followers?.total === 'number' ? item.followers.total : 0;
  const popularity = typeof item.popularity === 'number' ? item.popularity : 0;
  const genres = Array.isArray(item.genres) ? item.genres : [];
  const imageCount = Array.isArray(item.images) ? item.images.length : 0;

  return {
    name: item.name || 'Unknown',
    followers,
    popularity,
    genres,
    hasImages: imageCount > 0,
    imageCount,
    id: item.id,
  };
}

async function fetchArtistAlbumCount(artistId: string, token: string): Promise<number> {
  try {
    const url = `${SPOTIFY_API_BASE}/artists/${artistId}/albums?include_groups=album,single&limit=1`;
    const data = await spotifyFetchJson<{ total?: number }>(url, token, 3);
    if (!data) return -1;
    const total = data.total ?? 0;
    console.log(`[Spotify] Artist album count: ${total}`);
    return total;
  } catch (error) {
    console.warn('[Spotify] Fetch artist album count error:', error);
    return -1;
  }
}

async function fetchRelatedArtistCount(artistId: string, token: string): Promise<number> {
  try {
    const url = `${SPOTIFY_API_BASE}/artists/${artistId}/related-artists`;
    const data = await spotifyFetchJson<{ artists?: unknown[] }>(url, token, 3);
    if (!data) return -1;
    const count = Array.isArray(data.artists) ? data.artists.length : 0;
    console.log(`[Spotify] Related artists count: ${count}`);
    return count;
  } catch (error) {
    console.warn('[Spotify] Fetch related artists error:', error);
    return -1;
  }
}

async function fetchTopTrackPopularity(artistId: string, token: string): Promise<number> {
  try {
    const url = `${SPOTIFY_API_BASE}/artists/${artistId}/top-tracks?market=US`;
    const data = await spotifyFetchJson<{ tracks?: { popularity?: number }[] }>(url, token, 3);
    if (!data) return -1;
    const tracks = Array.isArray(data.tracks) ? data.tracks : [];
    if (tracks.length === 0) return 0;
    const maxPop = Math.max(...tracks.map(t => t.popularity ?? 0));
    console.log(`[Spotify] Top track max popularity: ${maxPop} (${tracks.length} tracks)`);
    return maxPop;
  } catch (error) {
    console.warn('[Spotify] Fetch top tracks error:', error);
    return -1;
  }
}

async function fetchAlbumLabel(trackId: string, token: string): Promise<string | undefined> {
  try {
    const trackData = await spotifyFetchJson<{ album?: { id?: string } }>(`${SPOTIFY_API_BASE}/tracks/${trackId}`, token);
    if (!trackData?.album?.id) return undefined;

    await delay(100);
    const albumData = await spotifyFetchJson<{ label?: string }>(`${SPOTIFY_API_BASE}/albums/${trackData.album.id}`, token);
    return albumData?.label || undefined;
  } catch (error) {
    console.warn('[Spotify] Fetch album label error:', error);
    return undefined;
  }
}

async function fetchFullTrackDetails(trackId: string, token: string): Promise<{ popularity: number } | null> {
  try {
    const data = await spotifyFetchJson<{ popularity?: number }>(`${SPOTIFY_API_BASE}/tracks/${trackId}`, token);
    if (!data) return null;
    console.log(`[Spotify] Full track data: popularity=${data.popularity}`);
    return { popularity: data.popularity ?? 0 };
  } catch (error) {
    console.warn('[Spotify] Full track fetch error:', error);
    return null;
  }
}

async function fetchArtistAlbumDetails(artistId: string, token: string): Promise<AlbumDetails | null> {
  try {
    const url = `${SPOTIFY_API_BASE}/artists/${artistId}/albums?include_groups=album,single&limit=50`;
    const data = await spotifyFetchJson<{ total?: number; items?: { release_date?: string; album_type?: string; name?: string }[] }>(url, token);
    if (!data) return null;

    const items = Array.isArray(data.items) ? data.items : [];
    const total = data.total ?? items.length;

    if (items.length === 0) {
      return { total, oldestDate: null, newestDate: null, releaseFrequency: 0, allSingles: true, distinctAlbumNames: 0 };
    }

    const dates = items
      .map(item => item.release_date)
      .filter((d): d is string => !!d)
      .sort();

    const albumTypes = items.map(item => item.album_type?.toLowerCase());
    const allSingles = albumTypes.every(t => t === 'single');

    const albumNames = new Set(items.map(item => item.name?.toLowerCase()).filter(Boolean));
    const distinctAlbumNames = albumNames.size;

    const oldestDate = dates.length > 0 ? dates[0] : null;
    const newestDate = dates.length > 0 ? dates[dates.length - 1] : null;

    let releaseFrequency = 0;
    if (oldestDate && newestDate && dates.length >= 2) {
      const oldest = new Date(oldestDate).getTime();
      const newest = new Date(newestDate).getTime();
      const spanDays = Math.max(1, (newest - oldest) / (1000 * 60 * 60 * 24));
      releaseFrequency = dates.length / (spanDays / 30);
    }

    console.log(`[Spotify] Album details: total=${total}, oldest=${oldestDate}, newest=${newestDate}, freq=${releaseFrequency.toFixed(2)}/month, allSingles=${allSingles}, fetched=${items.length}, distinctNames=${distinctAlbumNames}`);
    return { total, oldestDate, newestDate, releaseFrequency, allSingles, distinctAlbumNames };
  } catch (error) {
    console.warn('[Spotify] Fetch album details error:', error);
    return null;
  }
}

function computeDataReliability(enriched: Track): void {
  if (!enriched.enrichmentComplete) return;

  const trackPop = enriched.popularity ?? 0;
  const artFollowers = enriched.artistFollowers ?? 0;
  const artPop = enriched.artistPopularity ?? 0;
  const topTrackP = enriched.artistTopTrackPopularity ?? 0;
  const albumCount = enriched.artistAlbumCount ?? 0;
  const hasGenres = (enriched.artistGenres ?? []).length > 0;
  const hasRelated = enriched.artistHasRelated === true;

  const trulySuspicious = (
    (trackPop > 60 && artFollowers === 0 && artPop === 0 && hasRelated) ||
    (topTrackP > 50 && artFollowers === 0 && hasGenres && hasRelated) ||
    (artPop > 40 && artFollowers === 0 && hasGenres)
  );

  if (trulySuspicious) {
    enriched.dataReliable = false;
    enriched.dataReliabilityNote = `Spotify API may have returned incorrect follower count: artist has ${artPop} popularity, ${hasGenres ? 'genres' : 'no genres'}, ${hasRelated ? 'related artists' : 'no related artists'}, but shows 0 followers. Follower count may be inaccurate but other data points are still valid.`;
    console.warn(`[Spotify] DATA NOTE: followers=${artFollowers} looks suspect given artistPop=${artPop}, trackPop=${trackPop}, genres=${hasGenres}, related=${hasRelated}. Follower count flagged but other data trusted.`);
  } else {
    enriched.dataReliable = true;
    console.log(`[Spotify] Data marked RELIABLE: followers=${artFollowers}, artistPop=${artPop}, trackPop=${trackPop}, albums=${albumCount}, genres=${hasGenres}, related=${hasRelated}, topTrackPop=${topTrackP}`);
  }
}

export async function fetchArtistDetails(artistId: string) {
  const token = await getValidAccessToken();
  if (!token) {
    console.error(`[Spotify] No token available for artist fetch (artistId=${artistId})`);
    return null;
  }
  return fetchArtistDirect(artistId, token);
}

export async function fetchArtistAlbums(artistId: string): Promise<number> {
  const token = await getValidAccessToken();
  if (!token) return 0;
  return fetchArtistAlbumCount(artistId, token);
}
