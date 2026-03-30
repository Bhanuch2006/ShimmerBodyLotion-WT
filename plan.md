# UI Redesign Plan

## Goal
Refine the current redesign into a cleaner, more intentional interface that follows the user's latest feedback:

- Replace the left sidebar with a floating transparent navbar at roughly 50% opacity.
- Rename navigation to:
  - Dashboard
  - Submit Task
  - Connected Devices
  - Submitted Tasks
  - Theme Switch
- Remove the scrollable sidebar behavior entirely.
- Rebuild the landing/dashboard layout using the softer editorial board structure from the second reference image.
- Keep the girly theme heart background and push it closer to the third reference image.
- Rework the dashboard around sticky-note and paper-card motifs inspired by the fourth reference image.
- Make the upload/email composer feel much closer to the cute messenger inspo.
- Reduce clutter, reduce oversized sections, and improve motion so the app feels lighter and more polished.
- Apply the requested palettes:
  - Gothic Noir: `#000000`, `#D1D0D0`, `#988686`, `#5C4E4E`
  - Cherry Blossom: `#F2C7C7`, `#FFFFFF`, `#D5F3D8`, `#FFB7C5`

## Design Direction

### 1. App Shell
- Convert the navigation into a centered floating navbar under the title bar.
- Use translucent glass styling with about 50% opacity and soft blur.
- Keep the wand/glitter identity, but make the shell cleaner and less tall.
- Move theme switching into the navbar as the fifth item instead of a separate chunky panel.

### 2. Dashboard / Landing Page
- Redesign the dashboard as a composed board instead of stacked large cards.
- Use an asymmetrical multi-panel layout inspired by the second reference image.
- Introduce sticky-note cards, pinned scraps, mini memo cards, and smaller stat surfaces.
- Make the page feel editorial and airy rather than blocky.
- Keep jobs as cloud motifs, but shrink and simplify their presentation.

### 3. Submit Task Page
- Rebuild the upload area into a more faithful messenger/mailbox composition:
  - files visibly pinned at the top
  - message box clearly below
  - cute helper notes arranged around the composer
- Reduce the current size of the panels and make the whole composition feel tighter.
- Use softer details from the first inspo and match the second image's layout discipline.

### 4. Connected Devices / Submitted Tasks
- Simplify the cards and spacing so these pages do not feel oversized or crowded.
- Use smaller, more elegant card modules with clearer hierarchy.
- Add subtle motion:
  - floating clouds for jobs
  - tiny drift for sticky notes
  - gentle loader and hover states
- Completed jobs should visually drift/fade so they feel less heavy.

### 5. Themes
- Girly Pop:
  - Use Cherry Blossom palette as the base.
  - Keep heart-pattern background.
  - Shift the hearts toward the tiny sketched style from the third reference.
  - Add sticky-note/paper textures inspired by the fourth reference.
- Dark Theme:
  - Rebuild around the Gothic Noir palette.
  - Keep it elegant and moody instead of neon-heavy.
  - Use smoky glass, muted contrast, and soft silver text.

## Implementation Plan

### Phase 1: Shell and Navigation
- Refactor `Sidebar.jsx` into a floating top navbar layout.
- Rename nav labels exactly as requested.
- Remove sidebar-only structures and scrolling behavior.
- Update `App.jsx` and shared layout styles to support the new shell.

### Phase 2: Shared Visual System
- Rework `index.css` theme tokens to match the two requested palettes.
- Reduce visual bulk by tightening spacing, card heights, and section padding.
- Add new utility styles for sticky notes, paper scraps, floating clouds, and compact panels.
- Rebalance motion so it is noticeable but soft.

### Phase 3: Dashboard Redesign
- Recompose `Dashboard.jsx` into a lighter board-style landing page.
- Use sticky-note clusters, compact metric notes, and smaller cloud job widgets.
- Make the main page the clearest expression of the reference imagery.

### Phase 4: Submit Task Redesign
- Refine `SubmitJob.jsx` to feel closer to the cute messenger reference.
- Improve file shelf, message area, side notes, and upload affordances.
- Make the page visually tighter and easier to scan.

### Phase 5: Remaining Pages
- Simplify `Jobs.jsx`, `Workers.jsx`, and `ConnectDevice.jsx`.
- Bring them into the same compact, elegant visual language.
- Ensure the theme switch placement still feels natural after the shell change.

### Phase 6: Verification
- Run a production build after edits.
- Check responsiveness at smaller widths.
- Sanity-check that the floating navbar does not collide with page content.
- Confirm both themes still feel distinct and intentional.

## Files Likely To Change
- `src/App.jsx`
- `src/components/Sidebar.jsx`
- `src/pages/Dashboard.jsx`
- `src/pages/SubmitJob.jsx`
- `src/pages/Jobs.jsx`
- `src/pages/Workers.jsx`
- `src/pages/ConnectDevice.jsx`
- `src/index.css`

## Success Criteria
- No scrollable sidebar remains.
- Navbar is floating, translucent, and compact.
- Dashboard feels like a curated board with sticky-note inspiration.
- Submit Task page clearly matches the "files on top, message below" messenger idea.
- Both themes use the requested palettes and feel cleaner than the current version.
- The interface looks less cluttered, more attractive, and more alive.
