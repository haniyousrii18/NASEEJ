# Hero images

The landing-page hero uses these photographs at build time:

- `hero-ar.jpg` for the Arabic page
- `hero-en.jpg` for the English page

Any other `.webp`, `.jpg`, `.png` or `.avif` file in this folder is used as a fallback for both languages. Without any image the hero shows a designed fallback (line weave plus product cards with synthetic data).

Notes for replacing them:
- About 1000x1100, under 150 KB. The hero crops with `object-fit: cover`, anchored at 50% 30%, so keep faces in the upper-middle.
- Keep screens and monitors out of the frame, or make sure any text on them describes only what Naseej really does (no diagnostic or AI claims).
- You must own or be licensed to use the image. The current two were supplied by the project owner and appear to be AI-generated; if the page should present real photography, replace them.
