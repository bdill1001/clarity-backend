# Clarity Backend Worker

This is the background polling server for the Clarity Tracker app. Because mobile operating systems severely limit background execution frequency (e.g., iOS restricts background fetches to ~15-minute intervals), a true "Real-Time Detection" feature for continuously playing music requires a server-side polling architecture.

This simple Express worker:
1. Connects to a Supabase database to securely manage user Spotify Refresh Tokens.
2. Continuously polls the Spotify API every 30 seconds for all registered users.
3. Automatically identifies when a user starts playing a *new* track.
4. Forwards that track metadata to an Google Gemini model for structural and semantic analysis (Likelihood of being AI-generated).
5. Instantly sends an Expo Push Notification to the user's phone if an AI track is detected.

## Requirements

1. **Supabase**: A free Supabase project to store the user tokens securely.
2. **Gemini API Key**: To power the AI analysis. Get one for free at Google AI Studio.
3. **Spotify Developer App**: You will need the `Client ID` and `Client Secret` from your Spotify Dashboard.
4. **Node.js Hosting**: A platform that supports long-running persistent Node.js processes (e.g., **Render**, **Railway**, or **Fly.io**). *Note: Vercel Serverless Functions and Cron Jobs are not suitable for this 30-second polling frequency on a free tier.*

---

## Setup Instructions

### 1. Database Setup (Supabase)
1. Create a new project at [Supabase](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Copy the contents of `database.sql` from this folder and run it to create the `users` table and set up policies.
4. Go to **Project Settings -> API** and copy your `Project URL` and your `service_role` secret key.

### 2. Deployment (e.g., Render)
1. Push this code to a GitHub repository.
2. Go to [Render](https://render.com) and create a **New Web Service**.
3. Connect your repository.
4. Set the Root Directory to `backend` (if you deployed the whole monorepo).
5. Set the Start Command to `node server.js`.
6. Add the following **Environment Variables**:
   * `SUPABASE_URL`: Your Supabase Project URL.
   * `SUPABASE_SERVICE_KEY`: Your Supabase Service Role Secret Key *(DO NOT use the public anon key)*.
   * `GEMINI_API_KEY`: Your Gemini API Key from [Google AI Studio](https://aistudio.google.com/app/apikey).
   * `SPOTIFY_CLIENT_ID`: From your Spotify Developer Dashboard.
   * `SPOTIFY_CLIENT_SECRET`: From your Spotify Developer Dashboard.

### 3. Usage
Once deployed, the worker will automatically start cycling every 30 seconds.

The frontend mobile app will authenticate users via Spotify OAuth as normal, capture the Access and Refresh tokens on the client side, and then post them to your deployed worker's `/api/register` endpoint. The worker takes care of the rest indefinitely!
