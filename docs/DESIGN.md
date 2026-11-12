# Selah design system

Calm, editorial, unmistakably a product, not a chat demo. One typeface (Poppins), four colours,
flat surfaces, clear hierarchy. No glows, gradients, blinking cursors or "suggested prompt" pills.

## 1. Foundation

### Palette

| Token | Day (light) | Night (dark) | Use |
|---|---|---|---|
| `bg` | `#F9F2E7` Cream | `#102040` Midnight | page background |
| `surface` | `#FFFCF7` | `#17294A` | cards, composer |
| `surface-2` | `#F1E7D6` | `#2C4368` Slate | pressed states, user messages, inputs |
| `ink` | `#102040` Midnight | `#F9F2E7` Cream | primary text |
| `muted` | `#5F6F88` | Cream at 68% | secondary text |
| `line` | Midnight at 10% | Cream at 10% | hairlines, borders |
| `accent` | `#E0C07A` Gold | `#E0C07A` Gold | primary buttons, active states, scripture rule |
| `accent-ink` | `#102040` | `#102040` | text on gold |
| `emphasis` | `#2C4368` Slate | `#E0C07A` Gold | references, links, eyebrow labels (gold text fails contrast on cream, so Day uses Slate) |
| `accent-soft` | `#F0E0C1` | Gold at 14% | selected tiles, highlights |
| `care` | `#A34A3B` | `#E79B88` | crisis help only (semantic) |

Theme follows the device (`prefers-color-scheme`). Service mode is always Night (projectors, dim halls).

### Typography: Poppins

| Role | Weight | Size / line height | Notes |
|---|---|---|---|
| Display (H1) | 600 | 44/52 desktop, 30/38 mobile | tracking −0.02em |
| H2 | 600 | 24/32 | teaching titles |
| H3 | 600 | 17/24 | tile titles |
| Body | 400 | 16/26 | |
| Scripture | 400 | 19/32 (Service: up to 56/72, weight 500) | verse numbers 600, 11px, gold |
| Small | 400 | 14/22 | reasons, helper text |
| Eyebrow | 500 | 12/16, uppercase, tracking 0.08em | section labels |
| Button | 500 | 15/20 | |

### Elevation and shape

- **Level 0:** page (`bg`).
- **Level 1:** cards: `surface` + 1px `line`; Day adds `0 1px 2px rgb(16 32 64 / 6%)`.
- **Level 2:** floating (composer, sticky bars): `0 12px 32px -12px rgb(16 32 64 / 22%)`; Night lifts with `surface` instead of shadow.
- Radii: 10px controls, 14px buttons and tiles, 20px cards, 24px composer. Fully round only for icon buttons and the Talk orb.
- Blur only on sticky bars (`backdrop-blur`). No gradients.

## 2. Home: the anchor

- **Layout:** single centred column (max 720px). Greeting eyebrow ("Good evening"), H1 "What's on your heart?", one-line subhead.
- **Composer (primary CTA):** a Level 2 card. Multi-line field, then a control row: segmented control **Teaching / Verses**, a style menu (Teaching only), mic button, and the gold primary button ("Receive a word" / "Find verses"). After the first answer it docks to the bottom as a compact bar.
- **Proof row** under the composer: "Exact scripture · KJV, BSB, Louis Segond · Free voice", small and muted.

## 3. Below the anchor

1. **Start where you are.** *Friction: "I don't know how to put it into words."* A 3-column grid (2 on mobile) of topic tiles (Anxious, Waiting, Weary, Grieving, Starting over, Thankful): line icon, title, one-line example. Tapping sends the example in the current mode. A wide tile, "Remember part of a verse?", switches to Verses and focuses the field.
2. **More ways to use Selah.** *Friction: "Is this just a chatbot?"* Two feature cards: **Talk** (voice conversation with a pastor) and **Service** (live verse display during a sermon), each with a one-line promise and an arrow.
3. **Answer view.** *Friction: "Can I trust this?"* The question sits on the right in a quiet `surface-2` block. A teaching appears as an editorial section: eyebrow (style), H2 title, the anchor scripture with a 3px gold rule, the waveform player, then actions (Transcript, Keys, Copy) and a "More scriptures" disclosure. Loading is a skeleton with a status line ("Finding scripture" → "Writing your word").

## 4. Talk and Service

- **Talk:** one centre stage: status line, a 112px orb (Idle: `surface-2` with mic; Listening: gold ring that scales with your voice; Thinking: slate with a turning arc; Speaking: gold with moving bars), the conversation below, a small text field.
- **Service:** Night, full bleed. Gold reference eyebrow, scripture in Cream at display size, a slim control bar (language, Bible, Auto/Hold, Quotes, Fullscreen, Listen), recent verses as text buttons, a quiet transcript line.

## 5. Interaction

- 150ms ease-out on colour, 200ms on transform. Buttons lift 1px on hover and press to 98%. Focus: 2px gold ring, 2px offset.
- Segmented control: the active pill slides. Tiles: border shifts to `emphasis` on hover.
- New answers fade up 8px over 250ms. Skeletons shimmer. All motion is off with `prefers-reduced-motion`.

## 6. Responsive

- **≥ 768px:** top bar with wordmark, centre navigation (Word · Talk · Service), Bible menu on the right.
- **< 768px:** slim top bar (wordmark + Bible menu) and a **bottom tab bar** (Word, Talk, Service) with safe-area padding. The composer goes full width and its controls wrap into two rows. Tiles go to 2 columns. H1 shrinks to 30px. Side gutters 16px.
