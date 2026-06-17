import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { transformerTwoslash } from 'fumadocs-twoslash';
import { createFileSystemTypesCache } from 'fumadocs-twoslash/cache-fs';
import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins';
import { remarkAutoTypeTable, createGenerator, createFileSystemGeneratorCache } from 'fumadocs-typescript';
import path from 'node:path';

const generator = createGenerator({
  cache: createFileSystemGeneratorCache('./.cache/fumadocs-typescript'),
});

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [[remarkAutoTypeTable, { generator }]],
    rehypeCodeOptions: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      langs: ['js', 'jsx', 'ts', 'tsx', 'sh', 'bash', 'c', 'rust', 'go', 'toml', 'json', 'css'],
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash({
          typesCache: createFileSystemTypesCache({dir: "./node_modules/.temp"}),
          twoslashOptions: {
            // Resolve node_modules from the docs/ workspace, not the monorepo root.
            // Without this, TypeScript can't find docs/node_modules/unffi.
            vfsRoot: path.resolve(import.meta.dirname),
            compilerOptions: {
              moduleResolution: 100, // Bundler — honours unffi's conditional exports map
              module: 99,            // ESNext — top-level await + await using
              target: 9,             // ES2022 — `using`/`await using` semantics
              // NOTE: do NOT set `lib` explicitly here. Setting it (even to
              // ESNext.Disposable) makes the inner TS compiler stop unwrapping
              // `await Promise<T>` for generic returns — `lib.symbols.add` then
              // shows as `any` instead of the inferred `(a,b) => number`.
              // Twoslash's default libs already cover Promise + Disposable.
            },
          },
        }),
      ],
    },
  },
});
