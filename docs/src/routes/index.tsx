import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { useMDXComponents } from '@/components/mdx';
import HomepageCode from '@/components/homepage-code.mdx';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="flex flex-1 flex-col">
        <section className="border-fd-border border-b">
          <div className="mx-auto flex max-w-4xl flex-col items-start px-8 pt-20 pb-16 sm:pt-28 sm:pb-20">
            <h1 className="text-fd-foreground text-5xl font-semibold tracking-tight sm:text-6xl">
              unffi
            </h1>
            <p className="text-fd-muted-foreground mt-4 max-w-lg text-lg leading-relaxed">
              Call any native library from Bun, Deno, or Node with one schema.
              Works with C, Rust, Go, Zig — anything that exports a C ABI.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <Link
                to="/docs/$"
                params={{ _splat: 'getting-started' }}
                className="bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-colors"
              >
                Get started
              </Link>
              <a
                href="https://github.com/rajaniraiyn/unffi"
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
            <div className="prose">
              <HomepageCode components={useMDXComponents()} />
            </div>
            <p className="text-fd-muted-foreground mt-6 text-sm leading-relaxed">
              Same source on Bun, Deno, and Node — the right FFI backend loads via{' '}
              <code className="font-mono">package.json</code> exports conditions.{' '}
              See <Link to="/docs/$" params={{ _splat: 'schema' }} className="underline underline-offset-2">Schema & types</Link> for interactive type hovers.
            </p>
          </div>
        </section>
      </main>
    </HomeLayout>
  );
}
