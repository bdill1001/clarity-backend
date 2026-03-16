require('dotenv').config();
const artistId = '29eWAY1JQA6HQsXAmQCO0y';

async function auditArtist() {
  try {
    const tRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' })
    });
    
    if (!tRes.ok) throw new Error(`Token fetch failed: ${tRes.status} ${await tRes.text()}`);
    const { access_token } = await tRes.json();

    console.log('--- AUDITING ABEDI ---');
    
    // Fetch Releases (Albums and Singles)
    const aRes = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&market=US&limit=1`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const releases = await aRes.json();
    if (releases.error) {
      console.error('API ERROR (Releases):', releases.error);
    } else {
      console.log('Total Releases (Album/Single):', releases.total);
      
      let totalTracks = 0;
      if (releases.items) {
        for (const r of releases.items) {
          console.log(`[${r.album_type}] ${r.name} (${r.release_date}) - ${r.total_tracks} tracks`);
          totalTracks += r.total_tracks;
        }
      }
      console.log('\nGRAND TOTAL TRACK COUNT:', totalTracks);
    }

    // Fetch "Appears On"
    const aoRes = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=appears_on&limit=20`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const appearsOn = await aoRes.json();
    if (appearsOn.error) {
       console.error('API ERROR (Appears On):', appearsOn.error);
    } else {
      console.log('\nTotal "Appears On":', appearsOn.total);
      if (appearsOn.items) {
        appearsOn.items.forEach(r => console.log(`[Appears On] ${r.name} (${r.release_date}) - ${r.total_tracks} tracks`));
      }
    }
  } catch (err) {
    console.error('ERROR IN AUDIT:', err);
  }
}

auditArtist();
