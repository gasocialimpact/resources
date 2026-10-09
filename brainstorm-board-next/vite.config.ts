import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built app works from any GitHub Pages subfolder.
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
});
