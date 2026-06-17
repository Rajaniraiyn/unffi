import {
  defineCollections,
  defineConfig,
  defineDocs,
} from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { transformerTwoslash } from 'fumadocs-twoslash';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// Snippet collection for one-off MDX (e.g. homepage code sample).
// Loaded directly by app/(home)/page.tsx — not routed.
export const home = defineCollections({
  type: 'doc',
  dir: 'content/home',
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      transformers: [transformerTwoslash()],
    },
  },
});
