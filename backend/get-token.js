require('dotenv').config();
const express = require('express');
const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));
const app = express();
const PORT = 8888;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

app.get('/login', (req, res) => {
  const scope = 'user-read-private user-read-email user-read-playback-state';
  const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${SPOTIFY_CLIENT_ID}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  if (!code) {
    return res.send('Error: No code provided');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
    },
    body: new URLSearchParams({
      code: code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    })
  });

  const data = await response.json();
  if (data.access_token) {
    const fs = require('fs');
    fs.appendFileSync('.env', `\nTESTING_ACCESS_TOKEN=${data.access_token}\n`);
    res.send('<h1>Success!</h1><p>Your Spotify Token has been successfully injected into the local .env file. You can close this window and tell Antigravity it is ready!</p>');
    process.exit(0);
  } else {
    res.send('Error getting token: ' + JSON.stringify(data));
  }
});

app.listen(PORT, () => {
  console.log(`\n\n=== SPOTIFY AUTHENTICATOR ===`);
  console.log(`Please hold Ctrl and click this link to authenticate:`);
  console.log(`http://127.0.0.1:${PORT}/login\n\n`);
  
  // Try to open browser automatically
  const { exec } = require('child_process');
  exec(`start http://127.0.0.1:${PORT}/login`);
});
