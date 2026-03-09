import fetch from 'node-fetch';

async function run() {
  try {
    const response = await fetch('http://127.0.0.1:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackId: '1',
        artistId: '1',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        accessToken: 'fake_token'
      })
    });
    const data = await response.text();
    console.log('Status:', response.status);
    console.log('Body:', data);
  } catch (err) {
    console.error('Error fetching:', err);
  }
}

run();
