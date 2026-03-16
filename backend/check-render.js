import fetch from 'node-fetch';

async function run() {
  try {
    console.log('Testing live Render backend...');
    const res = await fetch('https://clarity-backend-bqzx.onrender.com/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
         trackId: '123',
         artistId: '123',
         trackName: 'Test',
         artistName: 'Test',
         accessToken: 'dummy'
      })
    });
    console.log('Status code:', res.status);
    console.log('Response body:', await res.text());
  } catch(e) { 
    console.error('Fetch error:', e); 
  }
}
run();
