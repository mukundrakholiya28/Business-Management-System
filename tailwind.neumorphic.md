# Neumorphic Design System — Tailwind CSS Configuration

## Overview
This document defines the Tailwind CSS utility configuration and custom classes
needed to produce a **Soft UI / Neumorphic** look across the entire application.

---

## 1. Extended `tailwind.config.js` Tokens

```js
// tailwind.config.js
const config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /* ─── Base palette ─── */
      colors: {
        surface:  "#e0e5ec",   // main bg
        surfaceD: "#d1d9e6",   // deeper surface
        surfaceL: "#f0f5fc",   // lighter surface
        accent:   "#6db5a0",   // soft teal (primary accent)
        accentH:  "#5a9e89",   // accent hover
        danger:   "#e07474",   // soft red
        warning:  "#e0b474",   // soft amber
        info:     "#74a8e0",   // soft blue
      },

      /* ─── Neumorphic shadows ─── */
      boxShadow: {
        "neu-flat":
          "6px 6px 12px #b8bec7, -6px -6px 12px #ffffff",
        "neu-raised":
          "8px 8px 16px #b8bec7, -8px -8px 16px #ffffff",
        "neu-pressed":
          "inset 4px 4px 8px #b8bec7, inset -4px -4px 8px #ffffff",
        "neu-subtle":
          "3px 3px 6px #b8bec7, -3px -3px 6px #ffffff",
        "neu-button":
          "5px 5px 10px #b8bec7, -5px -5px 10px #ffffff",
        "neu-button-active":
          "inset 3px 3px 6px #b8bec7, inset -3px -3px 6px #ffffff",
        "neu-input":
          "inset 2px 2px 5px #b8bec7, inset -2px -2px 5px #ffffff",
      },

      /* ─── Border radius ─── */
      borderRadius: {
        "neu":   "16px",
        "neu-lg": "20px",
        "neu-xl": "24px",
      },

      /* ─── Font family ─── */
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## 2. Global CSS Utility Classes  (`globals.css`)

```css
@import "tailwindcss";

/* ─── Custom Neumorphic Utilities ─── */
@layer utilities {

  /* Raised card */
  .neu-card {
    @apply bg-surface rounded-neu-xl p-6;
    box-shadow: 8px 8px 16px #b8bec7, -8px -8px 16px #ffffff;
  }

  /* Flat element */
  .neu-flat {
    @apply bg-surface rounded-neu;
    box-shadow: 6px 6px 12px #b8bec7, -6px -6px 12px #ffffff;
  }

  /* Pressed/inset state */
  .neu-pressed {
    @apply bg-surface rounded-neu;
    box-shadow: inset 4px 4px 8px #b8bec7, inset -4px -4px 8px #ffffff;
  }

  /* Primary button */
  .neu-btn {
    @apply bg-surface rounded-neu px-6 py-3 font-semibold text-gray-700
           cursor-pointer select-none transition-all duration-200;
    box-shadow: 5px 5px 10px #b8bec7, -5px -5px 10px #ffffff;
  }
  .neu-btn:hover {
    box-shadow: 3px 3px 6px #b8bec7, -3px -3px 6px #ffffff;
  }
  .neu-btn:active,
  .neu-btn.active {
    box-shadow: inset 3px 3px 6px #b8bec7, inset -3px -3px 6px #ffffff;
  }

  /* Accent button */
  .neu-btn-accent {
    @apply neu-btn bg-accent text-white;
  }
  .neu-btn-accent:hover {
    @apply bg-accentH;
    box-shadow: 3px 3px 6px #b8bec7, -3px -3px 6px #ffffff;
  }

  /* Input field */
  .neu-input {
    @apply bg-surface rounded-neu px-4 py-3 text-gray-700
           outline-none transition-all duration-200;
    box-shadow: inset 2px 2px 5px #b8bec7, inset -2px -2px 5px #ffffff;
  }
  .neu-input:focus {
    box-shadow: inset 3px 3px 7px #b8bec7, inset -3px -3px 7px #ffffff;
    @apply ring-2 ring-accent/30;
  }

  /* Circular avatar */
  .neu-avatar {
    @apply rounded-full bg-surface flex items-center justify-center;
    box-shadow: 4px 4px 8px #b8bec7, -4px -4px 8px #ffffff;
  }

  /* Badge */
  .neu-badge {
    @apply inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold;
    box-shadow: 2px 2px 4px #b8bec7, -2px -2px 4px #ffffff;
  }
}

/* ─── Typography Hierarchy ─── */
@layer base {
  body {
    @apply bg-surface text-gray-700 font-sans antialiased;
  }
  h1 { @apply text-3xl font-bold text-gray-800; }
  h2 { @apply text-2xl font-semibold text-gray-800; }
  h3 { @apply text-xl font-semibold text-gray-700; }
  h4 { @apply text-lg font-medium text-gray-600; }
}
```

---

## 3. Visual Reference

| Element     | Raised State                              | Pressed State                                  |
|-------------|-------------------------------------------|------------------------------------------------|
| **Card**    | `shadow-neu-raised` (light ↖, dark ↘)    | `shadow-neu-pressed` (inset both sides)       |
| **Button**  | `shadow-neu-button` → hover shrinks depth | `:active` → `shadow-neu-button-active` (inset)|
| **Input**   | Always inset `shadow-neu-input`           | `:focus` → deeper inset + accent ring          |

---

## 4. Accent Colour Usage

| Context               | Colour                      |
|------------------------|----------------------------|
| Primary action buttons | `bg-accent` (soft teal)    |
| Active nav / tabs      | `text-accent`              |
| Status badge — Paid    | `bg-accent/20 text-accent` |
| Status badge — Pending | `bg-warning/20 text-warning`|
| Status badge — Danger  | `bg-danger/20 text-danger` |

---

## 5. Spacing & Layout Rules

- **Cards:** `p-6` to `p-8`, gap between cards `gap-6`
- **Sections:** `py-8`, `px-6` on containers
- **Max width:** `max-w-7xl mx-auto` for page containers
- **Border radius:** Always `rounded-[16px]` to `rounded-[24px]` — **never sharp corners**
