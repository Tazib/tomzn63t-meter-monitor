import type { MetadataRoute } from "next";

// Lets phones "Add to Home Screen" / install the site so it opens full screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Energy Tracker",
    short_name: "Energy",
    description: "Live electricity use, bills and solar savings for your home.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f9fc",
    theme_color: "#f7f9fc",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
