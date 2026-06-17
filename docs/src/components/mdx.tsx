import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';
import { Steps, Step } from 'fumadocs-ui/components/steps';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import * as Twoslash from 'fumadocs-twoslash/ui';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...Twoslash,
    Tabs,
    Tab,
    Steps,
    Step,
    TypeTable,
    Accordion,
    Accordions,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
