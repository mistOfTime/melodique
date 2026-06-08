/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // iTunes / Apple Music
      { protocol: "https", hostname: "*.mzstatic.com" },
      { protocol: "https", hostname: "is1-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is2-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is3-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is4-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is5-ssl.mzstatic.com" },
      // MusicBrainz Cover Art Archive
      { protocol: "https", hostname: "coverartarchive.org" },
      { protocol: "https", hostname: "archive.org" },
      // Placeholder images
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "i.scdn.co" },
      // Any other CDN
      { protocol: "https", hostname: "**" },
    ],
  },
};

module.exports = nextConfig;
