const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function run() {
    console.log("Testing Gemini with Google Search tool...");
    
    const requestBody = {
        contents: [{
            role: "user",
            parts: [{ text: "Search the web for the musician 'Felix Ruber' and their song 'Overcharged Fury'. Tell me exactly what you find about their existence as a real human artist, and if they appear to be an AI-generated music project." }]
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
    if (data.candidates && data.candidates[0]) {
        console.log("Gemini Response:\n", data.candidates[0].content.parts[0].text);
        if (data.candidates[0].groundingMetadata) {
            console.log("Grounding info used.");
        }
    } else {
        console.log("Error:", JSON.stringify(data, null, 2));
    }
}

run().catch(console.error);
