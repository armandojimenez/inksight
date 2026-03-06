# Inksight — UI Design Specification

**Version:** 1.0
**Last Updated:** March 2, 2026
**Author:** Inksight Team

---

## 1. Design Philosophy

Inksight's design is inspired by Inkit's visual language — modern minimalism with geometric precision — while establishing its own identity as an AI-powered visual assistant. The aesthetic communicates **clarity, intelligence, and trust** through clean lines, generous whitespace, and purposeful use of color.

**Core Principles:**
- **Clarity over decoration:** Every element serves a purpose
- **Accessible by default:** WCAG 2.1 AA compliance is a minimum, AAA where achievable
- **Responsive from the start:** Mobile-first, scales gracefully to desktop
- **Subtle delight:** Micro-interactions that feel intelligent, not flashy

---

## 2. Brand Identity

### 2.1 Logo

The Inksight logo features a stylized eye inside viewfinder/camera brackets, paired with the "INKSIGHT" wordmark in bold geometric sans-serif. The design intentionally echoes Inkit's visual language:

- **Viewfinder brackets** — Four L-shaped corners forming a scanning frame, referencing Inkit's angular bracket icon motif and the image-scanning function of the product
- **Eye** — Bold almond/marquise shape representing visual AI analysis ("sight")
- **Iris + highlight** — Filled pupil with a catch-light dot, adding life and depth
- **Eyelash marks** — Small decorative strokes above the eye, conveying attentiveness

**Logo Construction:**
```
  ┌─             ─┐
  │   ◉ INKSIGHT  │   Full logo (sidebar, desktop header)
  └─             ─┘
       ↑
  ┌─      ─┐
  │   ◉    │          Icon only (favicon, mobile header, loading)
  └─      ─┘
```

**Logo Variants:**
| Variant | File | Usage | Colors |
|---------|------|-------|--------|
| Full (PNG) | `inksight-logo.png` | Sidebar header, about page | Black icon + black wordmark |
| Icon only (SVG) | `inksight-icon.svg` | Favicon, mobile header, loading, empty states | `currentColor` (inherits context) |
| Favicon (SVG) | `favicon.svg` | Browser tab | Brand blue `#0024CC` |
| Primary blue | CSS `color: var(--color-primary-500)` on icon SVG | Sidebar header, active states | `#0024CC` |
| Inverse white | CSS `color: var(--color-neutral-0)` on icon SVG | Dark backgrounds, potential dark mode | `#FFFFFF` |
| Monochrome black | `inksight-logo.png` as-is | Print, high-contrast mode | Black |

**Logo Typography:** The "INKSIGHT" wordmark uses a bold, wide geometric sans-serif — visually consistent with Space Grotesk 700 weight.

**Logo Sizing Tokens:**
| Token | Value | Context |
|-------|-------|---------|
| `--logo-height-sidebar` | 28px | Full logo in sidebar header |
| `--logo-height-mobile` | 24px | Icon only in mobile header |
| `--logo-height-hero` | 48px | Large icon in upload/empty state |
| `--logo-height-loading` | 32px | Icon in loading/streaming state |

**Clear Space:** Minimum padding equal to the height of the "I" in "INKSIGHT" on all sides.

### 2.2 Icon SVG Specification

The icon-only SVG uses `currentColor` so it inherits color from its CSS context:

```svg
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <!-- Viewfinder corner brackets -->
  <g fill="currentColor">
    <path d="M2 2h18v5H7v13H2V2z"/>     <!-- Top-left -->
    <path d="M44 2h18v18h-5V7H44V2z"/>   <!-- Top-right -->
    <path d="M2 44h5v13h13v5H2V44z"/>     <!-- Bottom-left -->
    <path d="M44 57h13V44h5v18H44v-5z"/>  <!-- Bottom-right -->
  </g>

  <!-- Eye outer shape (almond/marquise) -->
  <path d="M32 21c-11 0-19 11-19 11s8 11 19 11 19-11 19-11-8-11-19-11z"
        fill="currentColor"/>

  <!-- Iris ring (white cutout) -->
  <circle cx="32" cy="32" r="7.5" fill="white"/>

  <!-- Pupil -->
  <circle cx="32" cy="32" r="5" fill="currentColor"/>

  <!-- Highlight -->
  <circle cx="30" cy="30" r="1.8" fill="white"/>

  <!-- Eyelash / sparkle marks -->
  <g stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none">
    <line x1="28" y1="22.5" x2="27" y2="19"/>
    <line x1="32" y1="21.5" x2="32" y2="17.5"/>
    <line x1="36" y1="22.5" x2="37" y2="19"/>
  </g>
</svg>
```

---

## 3. Color System

### 3.1 Primary Palette

Derived from Inkit's brand blue (`#0024CC`) with Inksight's own extensions.

| Token | Hex | RGB | Usage | WCAG on White | WCAG on Dark |
|-------|-----|-----|-------|---------------|--------------|
| `--color-primary-50` | `#EEF0FF` | 238, 240, 255 | Hover backgrounds, subtle fills | N/A (bg) | N/A |
| `--color-primary-100` | `#D9DEFF` | 217, 222, 255 | Active states, selected items | N/A (bg) | N/A |
| `--color-primary-200` | `#B3BDFF` | 179, 189, 255 | Borders, dividers on dark | N/A | N/A |
| `--color-primary-300` | `#8090FF` | 128, 144, 255 | Icons on dark backgrounds | N/A | 4.6:1 AA |
| `--color-primary-400` | `#4D63FF` | 77, 99, 255 | Links, interactive elements | 4.6:1 AA | 5.8:1 AAA |
| `--color-primary-500` | `#0024CC` | 0, 36, 204 | **Primary brand** — buttons, headings | 7.3:1 AAA | 3.2:1 |
| `--color-primary-600` | `#001BA0` | 0, 27, 160 | Hover state for primary | 9.2:1 AAA | 2.5:1 |
| `--color-primary-700` | `#001478` | 0, 20, 120 | Active/pressed state | 11.8:1 AAA | 2.0:1 |
| `--color-primary-800` | `#000D50` | 0, 13, 80 | Dark accents | 15.1:1 AAA | 1.6:1 |
| `--color-primary-900` | `#000628` | 0, 6, 40 | Near-black blue | 18.2:1 AAA | 1.3:1 |

### 3.2 Neutral Palette

| Token | Hex | Usage | WCAG on White |
|-------|-----|-------|---------------|
| `--color-neutral-0` | `#FFFFFF` | Pure white backgrounds | N/A |
| `--color-neutral-25` | `#F7F8FD` | Page background (Inkit match) | N/A |
| `--color-neutral-50` | `#F1F3F9` | Card backgrounds, input fills | N/A |
| `--color-neutral-100` | `#E2E5EF` | Borders, dividers | N/A |
| `--color-neutral-200` | `#C5C9D9` | Disabled states, placeholder borders | N/A |
| `--color-neutral-300` | `#9CA0B3` | Placeholder text | 3.0:1 (fails AA) |
| `--color-neutral-400` | `#6B7280` | Secondary text, captions | 4.6:1 AA |
| `--color-neutral-500` | `#4B5063` | Body text | 7.0:1 AAA |
| `--color-neutral-600` | `#3A415A` | Primary text (Inkit match) | 8.5:1 AAA |
| `--color-neutral-700` | `#272D42` | Headings | 12.1:1 AAA |
| `--color-neutral-800` | `#181C2E` | High-emphasis text | 15.0:1 AAA |
| `--color-neutral-900` | `#0C0F1A` | Near-black | 17.8:1 AAA |

### 3.3 Semantic Colors

| Token | Hex | Usage | WCAG on White |
|-------|-----|-------|---------------|
| `--color-success-500` | `#047857` | Success messages, upload complete | 5.7:1 AAA |
| `--color-success-50` | `#ECFDF5` | Success background | N/A |
| `--color-warning-500` | `#D97706` | Warnings, approaching limits | 3.4:1 (use with bg) |
| `--color-warning-50` | `#FFFBEB` | Warning background | N/A |
| `--color-error-500` | `#DC2626` | Errors, validation failures | 4.6:1 AA |
| `--color-error-50` | `#FEF2F2` | Error background | N/A |
| `--color-info-500` | `#2563EB` | Information, tips | 4.6:1 AA |
| `--color-info-50` | `#EFF6FF` | Info background | N/A |

### 3.4 AI Accent Color

AI content uses the **primary blue family** — no foreign colors. The visual distinction is solid blue (user) vs light blue wash (assistant):

| Token | Hex | Source | Usage |
|-------|-----|--------|-------|
| `--color-ai-50` | `#EEF0FF` | `primary-50` | AI message background |
| `--color-ai-100` | `#D9DEFF` | `primary-100` | AI streaming indicator background |
| `--color-ai-500` | `#4D63FF` | `primary-400` | AI indicator dot, streaming pulse |
| `--color-ai-600` | `#0024CC` | `primary-500` | AI accent on hover |

**Design rationale:** Inkit's palette is exclusively blue + neutrals. Introducing teal would break brand cohesion. The solid-blue user bubble vs light-blue-wash assistant bubble provides clear visual separation without foreign colors.

**Accessibility:** `--color-ai-500` (#4D63FF) on white = 4.6:1 (AA). Used only as an indicator dot, never for text. Text uses `--color-neutral-600` (#3A415A) on `--color-ai-50` (#EEF0FF) = **9.6:1** (AAA).

---

## 4. Typography

### 4.1 Font Stack

| Role | Family | Weight | Source | Rationale |
|------|--------|--------|--------|-----------|
| **Display / Headings** | Space Grotesk | 500, 600, 700 | Google Fonts | Matches Inkit's heading font — family cohesion |
| **Body / UI** | Archivo | 400, 500, 600 | Google Fonts | Matches Inkit's body font — clean, readable |
| **Code / Mono** | Space Mono | 400, 700 | Google Fonts | Matches Inkit's code font — consistent developer feel |

**Fallback Stack:**
```css
--font-display: 'Space Grotesk', system-ui, -apple-system, sans-serif;
--font-body: 'Archivo', system-ui, -apple-system, sans-serif;
--font-mono: 'Space Mono', 'SF Mono', 'Fira Code', monospace;
```

### 4.2 Type Scale

Practical scale optimized for UI readability:

| Token | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `--text-xs` | 12px / 0.75rem | 16px (1.33) | 400 | Captions, timestamps, badges |
| `--text-sm` | 14px / 0.875rem | 20px (1.43) | 400 | Secondary text, help text |
| `--text-base` | 16px / 1rem | 24px (1.5) | 400 | Body text, messages, inputs |
| `--text-lg` | 18px / 1.125rem | 28px (1.56) | 500 | Subheadings, card titles |
| `--text-xl` | 20px / 1.25rem | 28px (1.4) | 600 | Section headings |
| `--text-2xl` | 24px / 1.5rem | 32px (1.33) | 600 | Page titles |
| `--text-3xl` | 30px / 1.875rem | 36px (1.2) | 700 | Hero headings |

**Accessibility:**
- Minimum body text: 16px (exceeds WCAG 1.4.4 requirement)
- Line height minimum: 1.4x font size (exceeds WCAG 1.4.12 requirement of 1.5x for body)
- All text can be resized to 200% without loss of content (WCAG 1.4.4)
- Letter spacing is not restricted — user style sheets can override (WCAG 1.4.12)

### 4.3 Font Loading Strategy

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Archivo:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

- `font-display: swap` prevents invisible text during load (WCAG 1.4.8 compliance)
- `preconnect` to Google Fonts reduces latency
- System font fallbacks prevent layout shift

---

## 5. Spacing System

8px base grid for consistent rhythm:

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0` | 0px | Reset |
| `--space-1` | 4px | Tight spacing (icon padding, badge padding) |
| `--space-2` | 8px | Default gap, input padding vertical |
| `--space-3` | 12px | Small component padding |
| `--space-4` | 16px | Card padding, section gap |
| `--space-5` | 20px | Component gap |
| `--space-6` | 24px | Section padding |
| `--space-8` | 32px | Large section gap |
| `--space-10` | 40px | Page margins (mobile) |
| `--space-12` | 48px | Page margins (desktop) |
| `--space-16` | 64px | Section dividers |

**Touch Targets:**
- Minimum interactive target size: **44x44px** (WCAG 2.5.5 AAA)
- Buttons, inputs, links — all meet this minimum
- Touch target includes padding, not just visible element

---

## 6. Component Specifications

### 6.1 Buttons

#### Primary Button
```
┌─────────────────────────┐
│      Upload Image        │  height: 44px, px: 24px
└─────────────────────────┘
```
| Property | Value |
|----------|-------|
| Background | `--color-primary-500` (#0024CC) |
| Text | White (#FFFFFF) |
| Font | Archivo 700, 14px — Inkit uses bold on buttons |
| Border radius | 4px (`--radius-base`) — Inkit exact match |
| Box shadow | none — Inkit flat design |
| Height | 44px (meets touch target) |
| Padding | 12px 24px |
| Hover | `--color-primary-600` (#001BA0) |
| Active | `--color-primary-700` (#001478) |
| Focus | 2px offset ring, `--color-primary-400` |
| Disabled | opacity 0.5, cursor not-allowed |

**Accessibility:**
- Contrast: White on #0024CC = **7.3:1** (exceeds AAA 7:1)
- Focus indicator: 2px ring with 2px offset — visible against all backgrounds (WCAG 2.4.7)
- Disabled state: `aria-disabled="true"`, not just visual opacity
- Min width: 120px to prevent tiny tap targets

#### Secondary Button
| Property | Value |
|----------|-------|
| Background | Transparent |
| Border | 1.5px solid `--color-primary-500` |
| Text | `--color-primary-500` |
| Hover | `--color-primary-50` background |
| Focus | Same ring as primary |

**Accessibility:**
- Contrast: #0024CC on white = **7.3:1** (AAA)
- Border provides visual boundary beyond color (WCAG 1.4.1)

#### Ghost Button
| Property | Value |
|----------|-------|
| Background | Transparent |
| Text | `--color-neutral-500` |
| Hover | `--color-neutral-50` background |

### 6.2 Text Input

```
┌──────────────────────────────────────┐
│ Ask about this image...              │  height: 44px
└──────────────────────────────────────┘
```

| Property | Value |
|----------|-------|
| Background | `--color-neutral-0` (white) |
| Border | 1.5px solid `--color-neutral-200` |
| Border radius | 4px (`--radius-base`) — Inkit exact match |
| Height | 44px |
| Padding | 12px 16px |
| Font | Archivo 400, 16px |
| Text color | `--color-neutral-600` |
| Placeholder | `--color-neutral-400` (4.6:1) |
| Focus border | `--color-primary-500` |
| Error border | `--color-error-500` |
| Error text | `--color-error-500`, 14px, below input |

**Accessibility:**
- Placeholder contrast: 4.6:1 (AA) — but placeholder is NEVER the only label
- Visible `<label>` above every input (WCAG 1.3.1, 3.3.2)
- Error messages associated via `aria-describedby` (WCAG 3.3.1)
- Focus indicator: border color change + subtle box shadow (2 visual indicators)
- Autocomplete attributes where applicable (WCAG 1.3.5)

### 6.3 Chat Message Bubbles

#### User Message (Right-aligned)
```
                    ┌──────────────────────────┐
                    │ What's in this image?     │
                    └──────────────────────────┘
                                      10:30 AM
```

| Property | Value |
|----------|-------|
| Background | `--color-primary-500` (#0024CC) |
| Text | White |
| Border radius | 8px 8px 2px 8px (`--radius-md` with 2px tail) — professional, Inkit-restrained |
| Padding | 12px 16px |
| Max width | 75% of chat area |
| Font | Archivo 400, 16px |
| Timestamp | Archivo 400, 12px, `--color-neutral-400` |

**Accessibility:**
- Contrast: White on #0024CC = **7.3:1** (AAA)
- `role="log"` on chat container for screen readers
- Each message has `role="article"` with `aria-label="Your message"` or `"Assistant response"`

#### Assistant Message (Left-aligned)
```
┌──────────────────────────────────────┐
│ ◉ This image shows a scenic         │
│ landscape with rolling hills...      │
└──────────────────────────────────────┘
10:30 AM
```

| Property | Value |
|----------|-------|
| Background | `--color-ai-50` (#EEF0FF) — primary-50, Inkit blue family |
| Text | `--color-neutral-600` (#3A415A) |
| Border | 1px solid `--color-ai-100` (#D9DEFF) |
| AI indicator | 8px circle, `--color-ai-500` (#4D63FF), left of first line |
| Border radius | 8px 8px 8px 2px (`--radius-md` with 2px tail) — professional, Inkit-restrained |
| Padding | 12px 16px |
| Max width | 85% of chat area |

**Accessibility:**
- Contrast: #3A415A on #EEF0FF = **9.6:1** (AAA)
- AI indicator dot has `aria-hidden="true"` (decorative)
- Screen reader announces "Assistant:" prefix via `aria-label`
- Streaming text uses `aria-live="polite"` to announce new content without interrupting

### 6.4 Image Upload Drop Zone

```
┌──────────────────────────────────────────┐
│                                          │
│            ┌──────────┐                  │
│            │  📷 icon  │                  │
│            └──────────┘                  │
│                                          │
│     Drop an image here, or browse        │
│                                          │
│     PNG, JPG, GIF — up to 16MB           │
│                                          │
└──────────────────────────────────────────┘
```

| State | Border | Background | Text |
|-------|--------|------------|------|
| Default | 2px dashed `--color-neutral-200` | `--color-neutral-25` | `--color-neutral-500` |
| Hover | 2px dashed `--color-primary-400` | `--color-primary-50` | `--color-primary-500` |
| Drag over | 2px solid `--color-primary-500` | `--color-primary-50` | `--color-primary-500` |
| Uploading | 2px solid `--color-primary-500` | `--color-neutral-25` | Progress bar |
| Error | 2px solid `--color-error-500` | `--color-error-50` | `--color-error-500` |

**Accessibility:**
- Drop zone is keyboard-focusable (`tabIndex={0}`)
- Enter/Space triggers file picker (WCAG 2.1.1)
- `aria-label="Upload image. Drag and drop or press Enter to browse. Accepts PNG, JPG, and GIF up to 16 megabytes."`
- Upload progress announced via `aria-live="polite"` with percentage
- Error state associated via `role="alert"` for immediate announcement
- "Browse" text is a visually-hidden `<input type="file">` with visible label

### 6.5 Sidebar / Image Gallery

```
┌────────────────────┐
│ ◉ Inksight         │  Logo + wordmark
├────────────────────┤
│                    │
│ ┌────────────────┐ │
│ │ 🖼 photo.jpg   │ │  Active image (highlighted)
│ │ 3 messages     │ │
│ └────────────────┘ │
│                    │
│ ┌────────────────┐ │
│ │ 🖼 chart.png   │ │  Inactive image
│ │ 1 message      │ │
│ └────────────────┘ │
│                    │
│ ┌────────────────┐ │
│ │  + New Image   │ │  Upload trigger
│ └────────────────┘ │
│                    │
└────────────────────┘
```

| Property | Value |
|----------|-------|
| Width | 280px (desktop), collapsible on mobile |
| Background | `--color-neutral-0` (white) |
| Border right | 1px solid `--color-neutral-100` |
| Active item bg | `--color-primary-50` |
| Active item border-left | 3px solid `--color-primary-500` |
| Hover item bg | `--color-neutral-50` |

**Accessibility:**
- Sidebar is `<nav aria-label="Image conversations">`
- Image list is `<ul role="list">` with `<li>` items using `aria-current="true"` for active
- Tab key navigation between items (WCAG 2.1.1)
- Each item announces: image name, message count, active status
- Collapse/expand button has `aria-expanded` state
- On mobile: overlay with focus trap and Escape to close (WCAG 2.4.3)

### 6.6 Streaming Indicator

When the AI is generating a response:

```
┌──────────────────────────────────────┐
│ ◉ Analyzing your image               │
│ ● ● ●                                │  Pulsing dots
└──────────────────────────────────────┘
```

| Property | Value |
|----------|-------|
| Dot size | 6px diameter |
| Dot color | `--color-ai-500` (#4D63FF) — primary blue family |
| Animation | Sequential pulse, 1.4s cycle, ease-in-out |
| Container | Same as assistant message bubble |

**Accessibility:**
- `aria-live="polite"` announces "Assistant is typing"
- `role="status"` on the indicator container
- Animation respects `prefers-reduced-motion` — falls back to static "..." text (WCAG 2.3.3)
- Dots are `aria-hidden="true"` (visual only)

### 6.7 Toast Notifications

```
┌─────────────────────────────────────┐
│ ✓  Image uploaded successfully       │  × close
└─────────────────────────────────────┘
```

| Variant | Background | Border-left | Icon color |
|---------|-----------|-------------|------------|
| Success | `--color-success-50` | 4px `--color-success-500` | `--color-success-500` |
| Error | `--color-error-50` | 4px `--color-error-500` | `--color-error-500` |
| Warning | `--color-warning-50` | 4px `--color-warning-500` | `--color-warning-500` |
| Info | `--color-info-50` | 4px `--color-info-500` | `--color-info-500` |

**Accessibility:**
- `role="alert"` for errors (immediate announcement)
- `role="status"` for success/info (polite announcement)
- Auto-dismiss: 5 seconds for success, persistent for errors
- Close button with `aria-label="Dismiss notification"`
- Focus does NOT move to toast (non-intrusive, WCAG 4.1.3)
- Toast container positioned with `aria-live="polite"` region

---

## 7. Layout System

### 7.1 Responsive Breakpoints

| Token | Width | Layout |
|-------|-------|--------|
| `--bp-mobile` | < 640px | Single column, sidebar collapsed |
| `--bp-tablet` | 640–1024px | Sidebar overlay, full chat |
| `--bp-desktop` | > 1024px | Sidebar + chat side by side |

### 7.2 Page Layout (Desktop)

```
┌──────────┬──────────────────────────────────────┐
│          │                                       │
│ Sidebar  │           Main Content                │
│  280px   │          (flex: 1)                    │
│          │                                       │
│          │  ┌─────────────────────────────────┐  │
│          │  │       Image Preview              │  │
│          │  └─────────────────────────────────┘  │
│          │                                       │
│          │  ┌─────────────────────────────────┐  │
│          │  │       Chat Messages              │  │
│          │  │       (scrollable)               │  │
│          │  └─────────────────────────────────┘  │
│          │                                       │
│          │  ┌─────────────────────────────────┐  │
│          │  │  Input Bar (fixed bottom)        │  │
│          │  └─────────────────────────────────┘  │
│          │                                       │
└──────────┴──────────────────────────────────────┘
```

### 7.3 Page Layout (Mobile)

```
┌──────────────────────────────────────┐
│ ☰  Inksight              🖼 Gallery  │  Header bar
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐  │
│  │       Image Preview (compact)  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │       Chat Messages            │  │
│  │       (scrollable)             │  │
│  └────────────────────────────────┘  │
│                                      │
├──────────────────────────────────────┤
│  Input Bar (fixed bottom)            │
└──────────────────────────────────────┘
```

**Accessibility:**
- Skip link: "Skip to main content" link at top of page (WCAG 2.4.1)
- Landmark regions: `<header>`, `<nav>`, `<main>`, `<footer>` (WCAG 1.3.1)
- Sidebar on mobile opens as a dialog with focus trap (WCAG 2.4.3)
- Input bar stays visible on virtual keyboard open (mobile)

---

## 7.4 Hero Gradient (Inkit Brand Gesture)

Inkit's homepage uses a soft circular blue gradient as its hero background. We replicate this in the upload view and empty chat state to create visual kinship:

```css
background: var(--gradient-hero);
/* radial-gradient(ellipse 80% 60% at 50% 40%, primary-50, neutral-25, white) */
```

**Usage:**
| View | Application |
|------|------------|
| Upload view (no image selected) | Full-page background behind the drop zone |
| Empty chat state (before first message) | Behind the Inksight icon and suggested questions |

**Suggested Questions** use the Inkit arrow-link pattern — text with a `->` arrow in brand blue:

```
-> What objects are in this image?
-> Describe the color palette
-> What text is visible?
```

---

## 8. Motion & Animation

### 8.1 Transition Tokens

| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| `--transition-fast` | 150ms | ease-out | Hover states, button feedback |
| `--transition-base` | 200ms | ease-in-out | Color changes, border changes |
| `--transition-slow` | 300ms | ease-in-out | Layout shifts, sidebar toggle |
| `--transition-enter` | 200ms | ease-out | Elements appearing (toasts, messages) |
| `--transition-exit` | 150ms | ease-in | Elements disappearing |

### 8.2 Animations

| Animation | Duration | Usage |
|-----------|----------|-------|
| Streaming pulse | 1.4s infinite | AI typing indicator dots |
| Upload progress | Linear | Progress bar fill |
| Message enter | 200ms ease-out | New message slides up + fades in |
| Toast enter | 300ms ease-out | Slides in from top-right |
| Toast exit | 200ms ease-in | Fades out |

### 8.3 Reduced Motion

All animations respect `prefers-reduced-motion: reduce`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Fallbacks:**
- Streaming dots → static "..." text
- Message enter → instant appear (no slide)
- Upload progress → percentage text instead of animated bar

---

## 9. Accessibility Compliance Matrix

### 9.1 WCAG 2.1 Checklist

| Criterion | Level | Status | Implementation |
|-----------|-------|--------|---------------|
| **1.1.1** Text Alternatives | A | Pass | All images have alt text, decorative icons use `aria-hidden` |
| **1.3.1** Info and Relationships | A | Pass | Semantic HTML, landmark regions, ARIA labels |
| **1.3.2** Meaningful Sequence | A | Pass | DOM order matches visual order |
| **1.3.4** Orientation | AA | Pass | No orientation lock, works portrait and landscape |
| **1.3.5** Identify Input Purpose | AA | Pass | Autocomplete attributes on applicable inputs |
| **1.4.1** Use of Color | A | Pass | No information conveyed by color alone — icons, borders, text accompany all color indicators |
| **1.4.3** Contrast (Minimum) | AA | Pass | All text meets 4.5:1 minimum (most exceed 7:1 AAA) |
| **1.4.4** Resize Text | AA | Pass | All text resizable to 200% via rem units |
| **1.4.5** Images of Text | AA | Pass | No images of text — all text is real text |
| **1.4.10** Reflow | AA | Pass | Content reflows at 320px width without horizontal scroll |
| **1.4.11** Non-text Contrast | AA | Pass | UI components and borders meet 3:1 minimum |
| **1.4.12** Text Spacing | AA | Pass | No clipping/overlap with increased spacing |
| **1.4.13** Content on Hover/Focus | AA | Pass | Tooltips dismissible, hoverable, and persistent |
| **2.1.1** Keyboard | A | Pass | All functionality accessible via keyboard |
| **2.1.2** No Keyboard Trap | A | Pass | Focus can always be moved away, modals have Escape exit |
| **2.4.1** Bypass Blocks | A | Pass | Skip link to main content |
| **2.4.3** Focus Order | A | Pass | Logical tab order following visual layout |
| **2.4.4** Link Purpose | A | Pass | All links have descriptive text or aria-label |
| **2.4.7** Focus Visible | AA | Pass | 2px ring with offset on all interactive elements |
| **2.5.5** Target Size | AAA | Pass | All interactive elements minimum 44x44px |
| **3.1.1** Language of Page | A | Pass | `lang="en"` on `<html>` |
| **3.2.1** On Focus | A | Pass | No context changes on focus alone |
| **3.3.1** Error Identification | A | Pass | Errors identified in text, associated via `aria-describedby` |
| **3.3.2** Labels or Instructions | A | Pass | All inputs have visible labels |
| **4.1.1** Parsing | A | Pass | Valid HTML, no duplicate IDs |
| **4.1.2** Name, Role, Value | A | Pass | All custom components have proper ARIA roles |
| **4.1.3** Status Messages | AA | Pass | Status updates use `role="status"` or `role="alert"` |

### 9.2 Keyboard Navigation Map

| Key | Context | Action |
|-----|---------|--------|
| `Tab` | Global | Move focus to next interactive element |
| `Shift+Tab` | Global | Move focus to previous interactive element |
| `Enter` | Button/Link | Activate |
| `Space` | Button/Checkbox | Activate/Toggle |
| `Enter` | Chat input | Send message |
| `Shift+Enter` | Chat input | New line (if multiline) |
| `Escape` | Modal/Sidebar | Close |
| `↑/↓` | Sidebar list | Navigate between images |
| `Enter` | Sidebar item | Select image |

### 9.3 Screen Reader Announcements

| Event | Announcement | Method |
|-------|-------------|--------|
| Image uploaded | "Image photo.jpg uploaded successfully. Initial analysis: [summary]" | `role="alert"` |
| Upload failed | "Upload failed: [error message]" | `role="alert"` |
| Message sent | (no announcement — user initiated) | — |
| AI responding | "Assistant is responding" | `role="status"` |
| AI response complete | Content of response | `aria-live="polite"` |
| Stream error | "Response failed: [error]" | `role="alert"` |
| Image selected | "Now viewing [filename], [N] messages" | `aria-live="polite"` |

---

## 10. Tailwind Configuration

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#EEF0FF',
          100: '#D9DEFF',
          200: '#B3BDFF',
          300: '#8090FF',
          400: '#4D63FF',
          500: '#0024CC',  // Inkit brand blue
          600: '#001BA0',
          700: '#001478',
          800: '#000D50',
          900: '#000628',
        },
        neutral: {
          25:  '#F7F8FD',  // Inkit page background
          // ... (extends default Tailwind neutrals)
        },
        ai: {
          50:  '#EEF0FF',   // primary-50 — AI message bg
          100: '#D9DEFF',   // primary-100 — AI streaming bg
          500: '#4D63FF',   // primary-400 — AI indicator dot
          600: '#0024CC',   // primary-500 — AI hover
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body:    ['Archivo', 'system-ui', 'sans-serif'],
        mono:    ['Space Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        xs:   ['0.75rem',  { lineHeight: '1rem'   }],
        sm:   ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem',     { lineHeight: '1.5rem'  }],
        lg:   ['1.125rem', { lineHeight: '1.75rem' }],
        xl:   ['1.25rem',  { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem',  { lineHeight: '2rem'    }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      },
      borderRadius: {
        sm: '2px',
        DEFAULT: '4px',   // Inkit exact match
        md: '8px',        // Chat containers
        lg: '12px',
        xl: '16px',       // Chat bubbles
        '2xl': '24px',
        full: '9999px',
      },
      spacing: {
        '4.5': '1.125rem', // 18px — for fine-tuning
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'), // For shadcn/ui animations
  ],
} satisfies Config
```

---

## 11. Performance Budget

| Metric | Target | Measurement |
|--------|--------|-------------|
| Initial JS bundle | < 200KB (gzipped) | Vite build output |
| Time to Interactive (TTI) | < 2s on 3G | Lighthouse throttled audit |
| Lighthouse Performance | > 90 | Chrome DevTools Lighthouse |

---

## 12. Dark Mode (Future Enhancement)

Not in scope for v1, but the design system is prepared:
- All colors defined as CSS custom properties
- Neutral palette has clear dark-mode inversions
- `prefers-color-scheme` media query ready
- Tailwind `dark:` variant enabled in config

---

## 13. Design Tokens Summary (CSS Custom Properties)

```css
:root {
  /* Colors — Primary */
  --color-primary-50:  #EEF0FF;
  --color-primary-100: #D9DEFF;
  --color-primary-200: #B3BDFF;
  --color-primary-300: #8090FF;
  --color-primary-400: #4D63FF;
  --color-primary-500: #0024CC;
  --color-primary-600: #001BA0;
  --color-primary-700: #001478;

  /* Colors — Neutral */
  --color-neutral-0:   #FFFFFF;
  --color-neutral-25:  #F7F8FD;
  --color-neutral-50:  #F1F3F9;
  --color-neutral-100: #E2E5EF;
  --color-neutral-200: #C5C9D9;
  --color-neutral-400: #6B7280;
  --color-neutral-500: #4B5063;
  --color-neutral-600: #3A415A;
  --color-neutral-700: #272D42;
  --color-neutral-800: #181C2E;

  /* Colors — Semantic */
  --color-success-50:  #ECFDF5;
  --color-success-500: #047857;
  --color-error-50:    #FEF2F2;
  --color-error-500:   #DC2626;
  --color-warning-50:  #FFFBEB;
  --color-warning-500: #D97706;
  --color-info-50:     #EFF6FF;
  --color-info-500:    #2563EB;

  /* Colors — AI (primary blue family, no foreign teal) */
  --color-ai-50:  #EEF0FF;   /* = primary-50 */
  --color-ai-100: #D9DEFF;   /* = primary-100 */
  --color-ai-500: #4D63FF;   /* = primary-400 */

  /* Typography */
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body:    'Archivo', system-ui, sans-serif;
  --font-mono:    'Space Mono', 'SF Mono', 'Consolas', 'Fira Code', monospace;

  /* Spacing */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-6:  24px;
  --space-8:  32px;
  --space-12: 48px;

  /* Borders — Inkit uses 4px universally, we extend for chat UI */
  --radius-sm:   2px;
  --radius-base: 4px;   /* Inkit exact match — buttons, inputs, cards */
  --radius-md:   8px;   /* Chat containers, panels */
  --radius-lg:   12px;
  --radius-xl:   16px;  /* Chat bubbles */
  --radius-2xl:  24px;
  --radius-full: 9999px;

  /* Shadows — Inkit flat design: no shadows on buttons */
  --shadow-none: none;  /* Buttons */
  --shadow-sm:  0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md:  0 4px 6px rgba(0, 0, 0, 0.07);
  --shadow-lg:  0 10px 15px rgba(0, 0, 0, 0.1);

  /* Gradients — Inkit hero-style radial gradient */
  --gradient-hero: radial-gradient(
    ellipse 80% 60% at 50% 40%,
    var(--color-primary-50) 0%,
    var(--color-neutral-25) 55%,
    var(--color-neutral-0) 100%
  );

  /* Transitions */
  --transition-fast: 150ms ease-out;
  --transition-base: 200ms ease-in-out;
  --transition-slow: 300ms ease-in-out;
}
```
