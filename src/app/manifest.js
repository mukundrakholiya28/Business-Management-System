export default function manifest() {
  return {
    name:             "Shree Royal Car — Workshop Manager",
    short_name:       "SRC Workshop",
    description:      "Offline-first business management for Shree Royal Car workshop.",
    start_url:        "/",
    display:          "standalone",
    orientation:      "portrait-primary",
    background_color: "#F4F5F7",
    theme_color:      "#1A1D27",
    categories:       ["business", "productivity"],
    icons: [
      {
        src:     "/logo.png",
        sizes:   "any",
        type:    "image/png",
        purpose: "any",
      },
      {
        src:     "/logo.png",
        sizes:   "192x192",
        type:    "image/png",
        purpose: "maskable",
      },
    ],
  };
}
