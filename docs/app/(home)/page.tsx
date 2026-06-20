import Link from 'next/link';
import { home } from 'collections/server';
import { getMDXComponents } from '@/components/mdx';
import { appName, docsRoute, gitConfig } from '@/lib/shared';

const codeSnippet = home.find((entry) => entry.info.path === 'code.mdx');
const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

export default function HomePage() {
  const Snippet = codeSnippet?.body;

  return (
    <main className="flex flex-1 flex-col">
      <section className="border-fd-border border-b">
        <div className="mx-auto flex max-w-4xl flex-col items-start px-8 pt-20 pb-16 sm:pt-28 sm:pb-20">
          <h1 className="text-fd-foreground text-5xl font-semibold tracking-tight sm:text-6xl">
            {appName}
          </h1>
          <p className="text-fd-muted-foreground mt-4 max-w-lg text-lg leading-relaxed">
            Call any native library from Bun, Deno, or Node with one schema —
            your own shared libraries or built-in OS bindings for libc, CoreFoundation,
            kernel32, and more.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              href={`${docsRoute}/getting-started`}
              className="bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-colors"
            >
              Get started
            </Link>
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="text-fd-muted-foreground hover:text-fd-foreground text-sm transition-colors"
            >
              GitHub →
            </a>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-4xl px-8 py-16 sm:py-20">
          {Snippet ? (
            <div className="prose">
              <Snippet components={getMDXComponents()} />
            </div>
          ) : null}
          <p className="text-fd-muted-foreground mt-6 text-sm leading-relaxed">
            Same source on Bun, Deno, and Node — the right FFI backend loads via{' '}
            <code className="font-mono">package.json</code> exports conditions.{' '}
            See{' '}
            <Link href={`${docsRoute}/schema`} className="underline underline-offset-2">
              Schema &amp; types
            </Link>{' '}
            for interactive type hovers, or{' '}
            <Link href={`${docsRoute}/system-libraries`} className="underline underline-offset-2">
              System libraries
            </Link>{' '}
            for shipped OS bindings.
          </p>
        </div>
      </section>
    </main>
  );
}
