/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  if (mode === "uat" && !process.env.VITE_BACKEND_API_URL?.trim()) {
    throw new Error("VITE_BACKEND_API_URL must be set for a UAT build.");
  }

  return {
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      // Local frontend uses the same Vercel Functions backend as UAT. Keeping
      // the request same-origin avoids CORS failures during local testing and
      // prevents the UI from falling back to the retired Supabase functions.
      "/api": {
        target: "https://podrozowka-uat-one.vercel.app",
        changeOrigin: true,
        secure: true,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Dopóki nie ma jeszcze testów w repo (Etap 3 wg dokumentu CI/CD),
    // Vitest domyślnie kończy się błędem przy braku plików testowych.
    // Bez tego Quality Gate blokowałby się jeszcze przed dojściem do builda.
    // Gdy pojawi się pierwszy realny test, ta flaga przestaje mieć znaczenie
    // (Vitest zacznie faktycznie egzekwować testy).
    passWithNoTests: true,

    // Komponenty React (@testing-library/react) potrzebują DOM-u.
    // Domyślne środowisko Vitest to "node" - bez tego każdy test dotykający
    // document/window wyleci z błędem niezależnie od poprawności testu.
    environment: "jsdom",

    // Rejestruje matchery @testing-library/jest-dom (np. toBeInTheDocument)
    // przed uruchomieniem testów. Wymaga pliku src/test/setup.ts (patrz niżej).
    setupFiles: ["./src/test/setup.ts"],

    globals: true,
  },
  };
});
