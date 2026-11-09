export default function manifest() {
  return {
    name:             "Cars — Business Management System",
    short_name:       "Cars",
    description:      "Offline-first business management for Cars.",
    start_url:        "/",
    display:          "standalone",
    orientation:      "portrait-primary",
    background_color: "#F4F5F7",
    theme_color:      "#1A1D27",
    categories:       ["business", "productivity"],
    icons: [
      {
        src:     "/favicon.ico",
        sizes:   "any",
        type:    "image/x-icon",
      },
    ],
  };
}
