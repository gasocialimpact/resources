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

Paste this into a blog post to embed it. The script keeps the iframe exactly as tall as its content, so there is never an inner scrollbar and the height never has to be guessed. It also scrolls the reader back up to the selector buttons when they switch foundations.

```html
<iframe src="https://gasocialimpact.github.io/resources/foundation-toolkit/case-studies.html"
        title="Georgia Foundation Impact Investor Case Studies"
        height="900" style="border:0; width:100%; display:block" loading="lazy"></iframe>
<script>
(function(){
  var ORIGIN = 'https://gasocialimpact.github.io';
  function frameFor(win){
    var frames = document.getElementsByTagName('iframe');
    for(var i = 0; i < frames.length; i++){
      if(frames[i].contentWindow === win) return frames[i];
    }
  }
  window.addEventListener('message', function(e){
    if(e.origin !== ORIGIN) return;
    var d = e.data;
    if(!d || d.frame !== 'foundation-case-studies') return;
    var frame = frameFor(e.source);
    if(!frame) return;
    if(d.type === 'gsic:resize' && d.height){
      frame.style.height = d.height + 'px';
    }
    if(d.type === 'gsic:scrollTo'){
      var top = frame.getBoundingClientRect().top + window.pageYOffset + (d.offset || 0);
      window.scrollTo({top: top, behavior: 'smooth'});
    }
  });
  // Ask for the height, in case the page reported it before this script ran.
  function hello(){
    var frames = document.getElementsByTagName('iframe');
    for(var i = 0; i < frames.length; i++){
      try{ frames[i].contentWindow.postMessage({type:'gsic:hello'}, ORIGIN); }catch(err){}
    }
  }
  window.addEventListener('load', hello);
  hello();
})();
</script>
```

The snippet finds its iframe by matching the message sender, so it still works if the platform strips the `id` attribute, and it handles more than one embed on a page. The `height="900"` is only what shows for the moment before the script takes over.

If the blog platform strips `<script>` entirely, no cross-origin iframe can self-size — that is a browser security boundary, not something the page can work around. In that case the iframe falls back to scrolling internally at whatever fixed `height` you set. Platforms that do allow the script include Squarespace code blocks, the WordPress Custom HTML block (on self-hosted or Business-plan sites), Ghost HTML cards, and Webflow embeds.

Adding `?embed=1` to the URL hides the footer, which is how the Starter Kit loads it. Leave the parameter off for a blog embed so the page keeps its link back to the full Starter Kit.

Messages the page posts to its host, all tagged `frame: 'foundation-case-studies'`:

| Message | Meaning |
| --- | --- |
| `{type: 'gsic:resize', height}` | Content height changed; size the iframe to it. |
| `{type: 'gsic:scrollTo', offset}` | The reader switched foundations; scroll to `offset` pixels into the iframe. |

## Repository structure

```
/
├── index.html                       # Roll-up landing page linking to each tool
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

## Technology

Each tool is pure HTML, CSS, and JavaScript with no build step, which keeps the pages portable and easy to embed. Hosting is handled by GitHub Pages.

## Archive

Older, non-active tools and components have been moved to a separate private archive repository for reference and are not published here.

Maintained by the Georgia Social Impact Collaborative.
