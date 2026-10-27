# Learning notebook illustrations

Created on 2026-10-27 using the built-in `image_gen.imagegen` tool (not the API/CLI fallback). No crawled stock images were used. All four requests used `transparent_background: true`. Final assets live in `public/report-art/` and retain alpha transparency. They are WebP delivery versions of generated PNGs; Sharp was used only for resizing and encoding (quality 88, alpha quality 100), without compositing or altering artwork.

| File | Width | Placement |
| --- | --- | --- |
| `study-desk.webp` | 720 px | Notebook header |
| `growing-books.webp` | 360 px | Progress section |
| `pencil-note.webp` | 360 px | Teacher feedback |
| `well-done.webp` | 240 px | Page footer |

The complete generation prompt for each asset is the shared prompt below followed by `Subject: ` and its corresponding subject. Original generated PNGs remain in the generator's output directory; the project consumes only the local optimized files above.

## Shared prompt

```text
Use case: illustration-story. Asset type: transparent PNG illustration for a Korean middle/high-school learning report, printed small on A4. Style: refined editorial gouache and cut-paper collage, softly textured matte paper, soft rounded dimensional forms, warm cream, muted cornflower blue, sage green and apricot accents, hand-crafted and quietly charming, suitable for teenagers, not childish, not a flat vector icon, no glossy 3D. Isolated composition with generous transparent margin, real alpha transparent background. No text, letters, digits, logos, borders or watermark.
```

## Subjects

**study-desk**

```text
A small friendly cream-colored bear thoughtfully reading an open blue mathematics workbook at a little wooden study desk, a pencil and two stacked books and a tiny green plant. Landscape composition, bear on right side, full objects visible. An illustrated scene, not an app icon.
```

**growing-books**

```text
A small stack of two blue and cream textbooks with an open book on top, a fresh sage-green sprout growing between its pages, two tiny warm golden sparkles. Elegant learning growth metaphor, balanced compact composition.
```

**pencil-note**

```text
An open cream notebook with gently curling pages, a blue wooden pencil resting diagonally, a small apricot paper tab and a sage-green leaf nearby. No readable markings on pages. Wide quiet stationery still life.
```

**well-done**

```text
A small friendly cream-colored bear holding a golden star close to its chest with a shy pleased smile, one tiny blue book beside its feet. Full body, tasteful editorial sticker-like illustration without sticker border.
```

## Template behavior

The six presets are learning notebook, quick summary, growth timeline, grade briefing, learning planner, and teacher letter. Each additional theme now uses its own generated header image and distinct palette. Notebook artwork is exclusive to the notebook theme. See report-theme-art.md for the five new assets and their complete generation prompts. Each preset has its own layout and recommended use. Theme and illustration visibility are saved with each template. Older saved templates without these fields continue to use the clean layout. Each block can optionally be emphasized, independently of full-width placement. Illustrations are decorative (`alt=""`), while records, labels and chart values remain real selectable text/SVG. Image export waits for artwork decoding before capture.
