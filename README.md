# GSIC Tools

Interactive, embeddable web tools for Georgia's social impact and impact investing ecosystem, maintained by the Georgia Social Impact Collaborative (GSIC).

Each tool is a self-contained static page that can be opened on its own or embedded as an iframe on the GSIC website. A roll-up landing page collects them in one place. The site is published with GitHub Pages.

## Live site

- Landing page (roll-up): https://gasocialimpact.github.io/resources/
- Nonprofit Capital Access Hub: https://gasocialimpact.github.io/resources/atlanta-nonprofit-ecosystem-hub/
- Foundation Impact Investing Starter Kit: https://gasocialimpact.github.io/resources/foundation-toolkit/
- Faith-Based Impact Investing Starter Kit: https://gasocialimpact.github.io/resources/faith-based-starter-kit/
- Innovation Library: https://gasocialimpact.github.io/resources/innovation-library/
- Impact Investing Field & Portfolio Framework: https://gasocialimpact.github.io/resources/impact-investing-field-framework/

### Standalone feature pages

Some features inside a tool also stand on their own so they can be embedded individually, for example on a single blog post.

- Georgia Foundation Impact Investor Case Studies: https://gasocialimpact.github.io/resources/foundation-toolkit/case-studies.html

Adding `?embed=1` to the case studies URL hides the footer, which is how the Starter Kit loads it. Leave the parameter off for a blog embed so the page keeps its link back to the full Starter Kit.

## Embedding a tool

Use a plain iframe plus one script tag. This works for any tool here, and for the Starter Kit itself.

```html
<style>
  .gsic-embed{ width:100%; height:1250px; border:0; display:block; }
</style>

<iframe class="gsic-embed"
        src="https://gasocialimpact.github.io/resources/foundation-toolkit/"
        title="Foundation Impact Investing Starter Kit"
        loading="lazy"></iframe>

<script src="https://gasocialimpact.github.io/resources/assets/gsic-frame.js" defer></script>
```

The height in that rule governs **desktop only**, where the tool is a fixed app shell that scrolls inside its frame — pick whatever suits the page, 1250px is a reasonable start. On a phone or tablet the script replaces it with the tool's real content height, so the frame has no scrollbar of its own and the host page does the scrolling. Leaving the desktop viewport puts the page's own height back exactly as it was. One script tag covers as many embeds as the page has.

Put the height in a `<style>` rule rather than the iframe's `style` attribute. Both work, but the rule is what the script hands back to when it releases the height, and it keeps working on an older cached copy of the script.

Three things to avoid, because each one causes the same symptom — a reader on a phone who cannot scroll to the content:

- **Do not set `scrolling="no"`.** It stops the frame from scrolling even when its content is taller than the frame, so anything below the fold is unreachable.
- **Do not size the frame with a percentage aspect-ratio box** (`padding-bottom:105%` and similar). A ratio that gives a reasonable height on a desktop gives a tiny one on a phone: at 375px wide, `padding-bottom:105%` is 394px tall — less than a phone screen for a tool that is several screens long.
- **Do not put a unitless value in a CSS height** (`height:1200`). CSS ignores it, so whatever else is sizing the box silently wins.

If the platform strips `<script>` entirely, no cross-origin iframe can self-size — that is a browser security boundary, not something the page can work around. Give the frame a viewport-relative height on small screens instead, so it is sized by the phone's screen rather than by its own width:

```html
<style>
  .gsic-embed{ width:100%; height:1250px; border:0; display:block; }
  @media (max-width: 900px){
    .gsic-embed{ height:85vh; min-height:600px; }
  }
</style>

<iframe class="gsic-embed"
        src="https://gasocialimpact.github.io/resources/foundation-toolkit/"
        title="Foundation Impact Investing Starter Kit"
        loading="lazy"></iframe>
```

The tool then scrolls inside the frame on a phone, which works but is less comfortable than the script version. Platforms that do allow the script include Squarespace code blocks, the WordPress Custom HTML block (on self-hosted or Business-plan sites), Ghost HTML cards, and Webflow embeds.

### The frame protocol

`assets/gsic-frame.js` is included by every tool page and by the Starter Kit shell, and is the same file a host page loads. It works out which roles apply: report its own height if it is inside a frame, size any same-origin frames it contains, or both at once, so the chain blog page → Starter Kit → tool page sizes end to end.

| Message | Direction | Meaning |
| --- | --- | --- |
| `{type: 'gsic:resize', height}` | child → host | Content height changed; size the frame to it. |
| `{type: 'gsic:scrollTo', offset}` | child → host | Scroll to `offset` pixels into the frame. |
| `{type: 'gsic:hello'}` | host → child | Report your height now. |
| `{type: 'gsic:viewport', top, height}` | host → child | The part of you that is currently on screen. |

Every message is tagged with `frame`, the value of the page's `<meta name="gsic-frame">`. The case studies page still reports as `foundation-case-studies`, so any host already listening for it keeps working.

`gsic:viewport` is what lets a page still open a dialog after it has been sized to its content. Such a page has no viewport of its own — it is as tall as its content and never scrolls — so `position:fixed` would anchor to the top of the whole document rather than to the screen. The visible band arrives as two CSS custom properties instead:

```css
.my-overlay{
  position:absolute; left:0; right:0;
  top:var(--gsic-vp-top, 0px);
  height:var(--gsic-vp-height, 100vh);
}
```

The fallbacks are the plain viewport, which is what the standalone page and a fixed-height embed want, so one rule is correct in every case. `foundation-toolkit/rfp-evaluation.html` uses this for its dialogs.

### Layout modes

Each tool renders in one of two layouts, chosen by a single media query that lives in `assets/gsic-frame.js` (as `FLOW_QUERY`) and in the Starter Kit's stylesheet:

```
(max-width: 900px), (hover: none)
```

Above it, on a desktop with a mouse, the Starter Kit is a fixed app shell: full-height sidebar, and the tool scrolls inside its frame.

Below it, or on any touch device at any width, it switches to **flow mode**: the page scrolls normally, each tool frame is sized to its content, and nothing is `position:fixed` or `position:sticky`. Nested scrolling is a touch problem rather than a width problem — a tablet at 1024px hits it exactly as a phone at 375px does — which is why `hover: none` is part of the query and not just a width.

If you add a tool, include `assets/gsic-frame.js` and it participates in both modes automatically.

### Saving a tool as PDF

`assets/gsic-pdf.js` puts a **Save as PDF** button on every tab and produces a single continuous page, laid out at a fixed desktop width whatever device it was saved from. Each button saves its own tab and nothing else. The open subtab, the values typed into a calculator, the answers saved in the worksheet — all of it is in the export, because the capture is taken from the live page.

The button lives with the content, not in the sticky header. In the toolkits each tab is its own page inside an iframe, so the page loads the script and the button places itself; the Nonprofit Capital Access Hub holds all six tabs in one document, so it opts out of that and builds a row per tab instead.

It does not use `window.print()`. That hands the job to the browser's paginator, which lays the page out at the *current* viewport width and slices it into sheets: saved from a phone, a 375px column chopped across a dozen pages with cards split down the middle. No print stylesheet fixes that, because the mobile layout is the one being printed.

Instead html2canvas renders the page into an offscreen clone whose `windowWidth` is set to the export width. Media queries in the clone evaluate against that, so the capture comes out in the desktop layout, and jsPDF puts it on one page as tall as it needs to be. US Letter width, so it still prints at true size.

Three things worth knowing if you touch this:

- **The capture is JPEG, not PNG.** jsPDF embeds a JPEG as-is but stores a PNG as raw uncompressed pixels. The same capture is 2MB as JPEG and 32MB as PNG, and takes 39ms to add instead of 736ms. That one choice is the difference between a half-second export and a 24-second one.
- **Scale is chosen against the browser's canvas ceilings**, which iOS enforces far more tightly than desktop Chrome. Going over does not throw — it silently yields a blank or truncated canvas — so the scale is picked to stay inside them rather than discovering the limit afterwards.
- **Textareas are swapped for divs during the capture.** html2canvas draws a textarea's contents as a single unwrapped line clipped to the box, so a long worksheet answer would come out as one line running off the edge with the rest missing. Growing the box does not help; the text still does not wrap.

Hooks: `data-gsic-pdf-hide` keeps an element out of the export, `data-gsic-pdf-expand` unclips one that scrolls its own content, and `data-gsic-pdf-root` names the element to capture when it is not the page's `.container`. The subtab bar (`.tab-bar`, `.phase-nav`) is dropped from the export on its own — its inactive tabs mean nothing once there is nothing to click — and the open subtab's name goes into the heading block instead.

A page opts out of the self-placing button with `<meta name="gsic-print" content="off">`, then either calls `GSICPdf.save(element, {fileName, title, subtitle})` on its own control — the worksheet and both calculator subtabs — or asks for a ready-made row with `GSICPdf.button(getTarget, getOpts)` and places it itself. Both arguments to `button()` are resolved at click time, which is how the Hub gives six tabs in one document a button each.

## Repository structure

```
/
├── index.html                       # Roll-up landing page linking to each tool
├── assets/                          # Shared scripts (iframe sizing, Save as PDF)
├── atlanta-nonprofit-ecosystem-hub/ # Nonprofit Capital Access Hub
├── foundation-toolkit/              # Foundation Impact Investing Starter Kit
├── faith-based-starter-kit/         # Faith-Based Impact Investing Starter Kit
├── innovation-library/              # Innovation Library (keeps its own format)
├── impact-investing-field-framework/ # Impact Investing Field & Portfolio Framework
├── _template/                       # Reusable starter for building new tools
└── README.md
```

Folder paths are intentionally stable because they are the source of live iframe embeds. Renaming a folder would break the embeds on the GSIC website, so display names are changed in each tool's markup rather than by moving folders.

## Tools

- **Nonprofit Capital Access Hub** — Resources, analysis, and a self-assessment for nonprofits and funders navigating capital access.
- **Foundation Impact Investing Starter Kit** — Guidance, calculators, case studies, and evaluation tools for foundations beginning impact investing.
- **Faith-Based Impact Investing Starter Kit** — Field-level grounding, an 8-phase implementation guide, and real stories of faith communities deploying capital for mission.
- **Innovation Library** — A self-guided learning journey for the impact investing ecosystem, presented in its own distinct format.
- **Impact Investing Field & Portfolio Framework** — An interactive map of the impact investing marketplace: three strategy families and their sub-strategies, the vehicles and recipients in each, and how the spectrum plays out by allocator type and impact sector. Uses top-level tab navigation to give the wide matrix and grids full width.

## Adding a new tool

Copy the `_template/` folder to a new, descriptively named directory, then edit its `index.html`. Once committed to `main`, GitHub Pages serves it at `https://gasocialimpact.github.io/resources/<your-folder>/`, and it can be linked from the landing page or embedded directly.

The template already includes both shared scripts and the flow-mode stylesheet, so a new tool embeds and reads on a phone correctly from the start. Change the `<meta name="gsic-frame">` value to your tool's own name.

## Technology

Each tool is pure HTML, CSS, and JavaScript with no build step, which keeps the pages portable and easy to embed. Hosting is handled by GitHub Pages.

## Archive

Older, non-active tools and components have been moved to a separate private archive repository for reference and are not published here.

Maintained by the Georgia Social Impact Collaborative.
