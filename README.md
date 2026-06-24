# GSIC Tools

Interactive, embeddable web tools for Georgia's social impact and impact investing ecosystem, maintained by the Georgia Social Impact Collaborative (GSIC).

Each tool is a self-contained static page that can be opened on its own or embedded as an iframe on the GSIC website. A roll-up landing page collects them in one place. The site is published with GitHub Pages.

## Live site

- Landing page (roll-up): https://gasocialimpact.github.io/resources/
- Nonprofit Capital Access Hub: https://gasocialimpact.github.io/resources/atlanta-nonprofit-ecosystem-hub/
- Foundation Impact Investing Starter Kit: https://gasocialimpact.github.io/resources/foundation-toolkit/
- Innovation Library: https://gasocialimpact.github.io/resources/innovation-library/

## Repository structure

```
/
├── index.html                       # Roll-up landing page linking to each tool
├── atlanta-nonprofit-ecosystem-hub/ # Nonprofit Capital Access Hub
├── foundation-toolkit/              # Foundation Impact Investing Starter Kit
├── innovation-library/              # Innovation Library (keeps its own format)
├── _template/                       # Reusable starter for building new tools
└── README.md
```

Folder paths are intentionally stable because they are the source of live iframe embeds. Renaming a folder would break the embeds on the GSIC website, so display names are changed in each tool's markup rather than by moving folders.

## Tools

- **Nonprofit Capital Access Hub** — Resources, analysis, and a self-assessment for nonprofits and funders navigating capital access.
- **Foundation Impact Investing Starter Kit** — Guidance, calculators, case studies, and evaluation tools for foundations beginning impact investing.
- **Innovation Library** — A self-guided learning journey for the impact investing ecosystem, presented in its own distinct format.

## Adding a new tool

Copy the `_template/` folder to a new, descriptively named directory, then edit its `index.html`. Once committed to `main`, GitHub Pages serves it at `https://gasocialimpact.github.io/resources/<your-folder>/`, and it can be linked from the landing page or embedded directly.

## Technology

Each tool is pure HTML, CSS, and JavaScript with no build step, which keeps the pages portable and easy to embed. Hosting is handled by GitHub Pages.

## Archive

Older, non-active tools and components have been moved to a separate private archive repository for reference and are not published here.

---
Maintained by the Georgia Social Impact Collaborative.
