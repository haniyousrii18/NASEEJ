# Hero images

The landing hero is now a coded illustration (`components/HeroScene.tsx`, styled in `styles/landing.css`), so nothing in this folder is imported at build time and these files are not shipped:

- `hero-ar-light.jpg`, `hero-ar-dark.jpg`, `hero-en-light.jpg`, `hero-en-dark.jpg`

They are kept as the supplied source crops (one per language and theme). To use photographs again, render an `<img>` in `HeroVisual.tsx` and import them with `import.meta.glob`.

Notes if photographs are used:
- The monitors in these pictures still show small dashboard text. Keep screens out of frame, or make sure any text describes only what Naseej really does (no diagnostic or AI claims).
- You must own or be licensed to use the images. They were supplied by the project owner and appear to be AI-generated.
