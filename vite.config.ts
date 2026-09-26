import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Rolldown accepts a function rather than Rollup's object form.
        manualChunks(id) {
          const moduleId = id.replaceAll("\\", "/");
          const inPackage = (name: string) => moduleId.includes(`/node_modules/${name}/`);
          if (["react", "react-dom", "react-router", "react-router-dom"].some(inPackage)) {
            return "react";
          }
          if ([
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-slot",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
          ].some(inPackage)) {
            return "ui";
          }
          if (inPackage("@tanstack/react-query")) {
            return "utils";
          }
        },
      },
    },
    // Adjust chunk size warning threshold
    chunkSizeWarningLimit: 1000,
  },
}));
