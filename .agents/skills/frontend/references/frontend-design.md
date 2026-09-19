# Frontend Design Reference

Guide for creating distinctive, production-grade frontend interfaces that avoid generic "AI aesthetics."

## Design thinking process

Before writing code, commit to a bold aesthetic direction:

1. **Purpose**: What problem does this interface solve? Who uses it?
2. **Tone**: Pick an extreme and own it. Examples: brutally minimal, maximalist, retro-futuristic, organic/natural, luxury/refined, playful, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian.
3. **Constraints**: Technical requirements (framework, performance, accessibility).
4. **Differentiation**: What makes this unforgettable? One thing a user will remember.

Execute with intentionality. Bold maximalism and refined minimalism both work — the key is commitment, not intensity.

## Typography

- Choose fonts that are beautiful, unique, and characterful.
- Avoid generic choices: Arial, Inter, Roboto, system fonts.
- Pair a distinctive display font with a refined body font.
- Vary choices across designs: never converge on common pairs.

## Color and theme

- Commit to a cohesive aesthetic. Use CSS variables for consistency.
- Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- Vary between light and dark themes across different designs.

## Motion and animation

- Use animations for effects and micro-interactions with purpose.
- One well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.
- Use scroll-triggering and hover states that surprise.
- CSS-only solutions preferred for HTML. Motion library for React.
- Prioritize: `transform`, `opacity` (GPU-accelerated).
- Never `transition: all`.

## Spatial composition

- Unexpected layouts: asymmetry, overlap, diagonal flow, grid-breaking elements.
- Generous negative space OR controlled density — commit to one.
- Vary spatial rhythm between designs.

## Backgrounds and visual depth

- Create atmosphere and depth rather than defaulting to solid colors.
- Options: gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, grain overlays.
- Match effects to the aesthetic direction.

## Anti-patterns to avoid

- Purple gradients on white backgrounds
- Overused font families (Inter, Space Grotesk)
- Predictable card-based layouts
- Cookie-cutter components without context
- Generic "AI aesthetic" designs
- Same visual approach across multiple designs

## Implementation match

Match complexity to the vision:
- **Maximalist**: elaborate code with extensive animations and effects
- **Minimalist/refined**: restraint, precision, spacing, subtle details

Elegance comes from executing the vision well, not from having fewer lines of code.
