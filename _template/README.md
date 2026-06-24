# Tool Template

A self-contained starter for building a new GSIC tool that matches the shared format used by the Foundation Impact Investing Starter Kit and the Nonprofit Capital Access Hub.

## What's here

`index.html` is a single, dependency-free file containing the shared shell: a sticky full-width header, a 260px sidebar navigation column, and a full-width content frame. It uses the shared brand color variables and the Familjen Grotesk font, and renders the header name in uppercase automatically via the `.kicker` style.

## How to start a new tool

1. Copy this `_template/` folder to a new folder named for your tool, for example `my-new-tool/`.
2. 2. In `index.html`, set the page title and the `.kicker` header text to your tool's name (type it in normal case; it displays uppercase).
   3. 3. Replace the placeholder section blocks with your content and update the sidebar buttons (each button's `data-target` must match a section `id`).
      4. 4. Commit. Because each tool lives at its own path, it publishes as a standalone page and can be embedded as an iframe on its own.
        
         5. ## Publishing
        
         6. This repo publishes via GitHub Pages at `https://gasocialimpact.github.io/resources/<folder>/`. Each tool is independently embeddable at its folder path, and the root landing page links to all of them as a roll-up.
        
         7. ## Layout notes
        
         8. - The body is viewport-locked so the tool fills its iframe without an outer scrollbar; only the content frame scrolls.
            - - The content frame intentionally has no max-width, so content stretches to the full width of the 1500px page container.
              - 
