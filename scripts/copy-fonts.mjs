import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("node_modules/@fontsource/stix-two-text/files");
const destination = resolve("public/fonts");
mkdirSync(destination, { recursive: true });

for (const file of [
  "stix-two-text-latin-400-normal.woff2",
  "stix-two-text-latin-700-normal.woff2",
]) {
  copyFileSync(resolve(source, file), resolve(destination, file.replace("stix-two-text-latin-400-normal.woff2", "STIXTwoText-Regular.woff2").replace("stix-two-text-latin-700-normal.woff2", "STIXTwoText-Bold.woff2")));
}
