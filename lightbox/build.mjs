import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["lightbox.jsx"],
  bundle: true,
  format: "esm",
  outfile: "lightbox.js",
  jsx: "automatic",
  minify: true,
  target: "es2022",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  banner: {
    js: "/* Includes @ramka/react, GPL-3.0-only. license=\"gpl\" on Lightbox.Root. */",
  },
});
