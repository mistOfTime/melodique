# 🎵 Melodique — Editorial Aesthetic Music Player

A full Spotify-alternative music web app built with **Next.js 14**, **TypeScript**, and **Tailwind CSS**.

## Features

- 🎨 **Editorial aesthetic UI** — dark ink palette, serif display fonts, colored glow effects
- 🎵 **12 built-in songs** with full metadata, album art, genres
- 📖 **Synchronized lyrics** — real-time scrolling lyrics panel
- ⏭️ **Unlimited skips** — no restrictions, skip freely
- 🔀 **Shuffle & Repeat** (none / all / one)
- 📀 **4 full albums** with individual album pages
- 📋 **4 editorial playlists**
- 🔍 **Search** by title, artist, album, genre
- 📚 **Library** with song/album/playlist tabs
- 📻 **Radio** mode with randomised queue
- ❤️ **Like songs** from the player bar
- 🔊 **Volume control**
- 🖱️ **Clickable progress bar** (seek)
- 📱 **Responsive layout**
- ⚡ **Offline** — no internet required (uses placeholder images from picsum.photos for covers)

---

## Getting Started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000)

---

## Adding Real Music Files

1. Put your `.mp3` files in the `public/audio/` folder
2. In `lib/data.ts`, update each song's `audioSrc` field:

```ts
audioSrc: "/audio/your-song.mp3",
```

3. In `lib/playerContext.tsx`, the `<audio>` element is already wired up — just uncomment the `src` attribute in the audio element if you add it.

Currently the player **simulates playback** with a 1-second tick, advancing through the song duration from the data file. Lyrics sync perfectly with this simulation.

---

## Using Real Album Covers

Replace the `cover` field in `lib/data.ts` with your local image path:

```ts
cover: "/images/my-album.jpg",
```

And put the image in `public/images/`.

---

## Spotify API Integration (Optional)

If you want to connect to the **Spotify Web API**:

### Step 1 — Create a Spotify App
1. Go to [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Set a Redirect URI (e.g. `http://localhost:3000/api/auth/callback`)
4. Copy your **Client ID** and **Client Secret**

### Step 2 — Add credentials to `.env.local`
```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
```

### Step 3 — Install next-auth or use Authorization Code Flow

```bash
npm install next-auth
```

The Spotify API supports:
- `GET /me/tracks` — liked songs
- `GET /v1/browse/featured-playlists` — featured playlists
- `GET /v1/search` — search tracks
- `GET /v1/audio-features/{id}` — audio analysis
- Real-time lyrics via Musixmatch API or `lyrics.ovh` (free)

> **Note:** Spotify's API **does not provide audio streaming** to third-party apps without licensing. For offline/local music, the built-in simulation is the recommended approach.

---

## Free Lyrics APIs

For real synced lyrics, use:

| Service | URL | Notes |
|---------|-----|-------|
| lyrics.ovh | `https://api.lyrics.ovh/v1/{artist}/{title}` | Free, no key needed |
| Musixmatch | `https://api.musixmatch.com` | Free tier available |
| lrclib.net | `https://lrclib.net/api/get` | Free synced LRC lyrics |

### Example — fetching synced lyrics from lrclib
```ts
const res = await fetch(
  `https://lrclib.net/api/get?artist_name=${artist}&track_name=${title}`
);
const data = await res.json();
// data.syncedLyrics contains LRC format timestamps
```

---

## Project Structure

```
melodique/
├── app/
│   ├── layout.tsx          # Root layout with sidebar + player
│   ├── page.tsx            # Home page (hero + playlists + songs)
│   ├── search/page.tsx     # Search page
│   ├── library/page.tsx    # Library (songs/albums/playlists)
│   ├── albums/page.tsx     # All albums
│   ├── albums/[id]/page.tsx # Album detail
│   ├── playlist/[id]/page.tsx # Playlist detail
│   ├── liked/page.tsx      # Liked songs
│   └── radio/page.tsx      # Radio / shuffle mode
├── components/
│   ├── Sidebar.tsx         # Left navigation
│   ├── Player.tsx          # Bottom player bar
│   ├── LyricsPanel.tsx     # Right lyrics panel
│   ├── SongRow.tsx         # Song list row
│   ├── AlbumCard.tsx       # Album card
│   └── PlaylistCard.tsx    # Playlist card
└── lib/
    ├── data.ts             # Songs, albums, playlists data
    └── playerContext.tsx   # Global player state
```

---

## Design System

| Token | Value | Use |
|-------|-------|-----|
| `ink` | `#0a0a0f` | App background |
| `ink-1` | `#111118` | Sidebar, player bar |
| `ink-2` | `#1a1a24` | Hover states |
| `ink-3` | `#242430` | Borders, cards |
| `mist` | `#e8e4f0` | Primary text |
| `mist-3` | `#6b6480` | Secondary text |
| `violet` | `#8b5cf6` | Synthwave accent |
| `rose` | `#f43f5e` | Indie Soul accent |
| `amber` | `#f59e0b` | Lo-Fi accent |
| `emerald` | `#10b981` | Art Pop accent |
