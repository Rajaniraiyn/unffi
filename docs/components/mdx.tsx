import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Popup, PopupContent, PopupTrigger } from 'fumadocs-twoslash/ui';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Callout } from 'fumadocs-ui/components/callout';
import { Steps, Step } from 'fumadocs-ui/components/steps';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { File, Folder, Files } from 'fumadocs-ui/components/files';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Tab,
    Tabs,
    Callout,
    Steps,
    Step,
    Accordion,
    Accordions,
    File,
    Folder,
    Files,
    Popup,
    PopupContent,
    PopupTrigger,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
