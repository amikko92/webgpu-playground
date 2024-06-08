import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                basicTriangle: resolve(
                    __dirname,
                    "src/basicTriangle/index.html"
                ),
            },
        },
    },
});
