const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

async function run() {
    console.log("Fetching Token...");
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
        },
        body: 'grant_type=client_credentials'
    });
    const data = await response.json();
    const accessToken = data.access_token;
    
    if (!accessToken) {
       console.log("No token:", data); return;
    }

    const aiTrackIds = ["7FGQ8AVxJHpCnOfmKqmRhk", "4hdXBcYMMQtOrA7l8Ph9iA", "2OLLAyKFh6o550MtOXDmtB"];

    for (const trackId of aiTrackIds) {
        const tRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const tData = await tRes.json();
        
        if (!tData.album) {
           console.log("Failed track:", trackId, tData);
           continue;
        }

        const albumId = tData.album.id;
        
        const aRes = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const aData = await aRes.json();
        
        console.log(`\n=================`);
        console.log(`Track: ${tData.name} by ${tData.artists[0].name}`);
        console.log(`Label: ${aData.label}`);
        console.log(`Copyrights:`, JSON.stringify(aData.copyrights));
        console.log(`ISRC:`, tData.external_ids ? tData.external_ids.isrc : 'None');
    }
}

run().catch(console.error);
