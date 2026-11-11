// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import { afterEach, describe, expect, it } from 'vitest';

const client = readFileSync(join(process.cwd(), 'packages', 'dsh', 'client.js'), 'utf8');

interface Definition {
  id: string;
  factory(require: (id: string) => unknown): {
    inject: string[];
    apply(ctx: unknown): void;
  };
}

function loadBundle(): Definition {
  const definitions: Definition[] = [];
  const window = {
    __ModuleLoader__: { load: (definition: Definition) => definitions.push(definition) },
    // The bundle evaluates router.tsx, whose module-level browser router subscribes to popstate.
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  runInNewContext(client, { window, document, console });
  const definition = definitions.at(-1);
  if (definition === undefined) throw new Error('client module was not registered');
  return definition;
}

function moduleRequire(id: string): unknown {
  if (id === 'react') return React;
  if (id === 'react-dom') return ReactDOM;
  if (id === 'react-dom/client') return ReactDOMClient;
  if (id === 'react/jsx-runtime') return ReactJSXRuntime;
  throw new Error(`unexpected require: ${id}`);
}

interface Mounted {
  registrations: Array<{ name: string; id?: string; key?: string }>;
  style: Element | null;
}

function mountBundle(): Mounted {
  const loaded = loadBundle().factory(moduleRequire);
  const registrations: Array<{ name: string; id?: string; key?: string }> = [];
  const ctx = {
    effect: (setup: () => () => void) => setup(),
    slots: {
      inject: (_name: string, callback: () => void) => callback(),
      register: (config: { name: string; id?: string; key?: string }) => {
        registrations.push(config);
        return () => undefined;
      },
    },
  };

  loaded.apply(ctx);

  return {
    registrations,
    style: document.head.querySelector('style[data-reviewd-native]'),
  };
}

describe('DSH client bundle', () => {
  afterEach(() => {
    for (const node of document.head.querySelectorAll('style[data-reviewd-native]')) node.remove();
  });

  it('registers the module under the package id', () => {
    expect(loadBundle().id).toBe('@sir_yami/reviewd');
  });

  it('registers the panel and the settings plugin tab', () => {
    const { registrations } = mountBundle();

    expect(registrations).toContainEqual(
      expect.objectContaining({ name: 'main', key: 'code-review' }),
    );
    expect(registrations).toContainEqual(
      expect.objectContaining({ name: 'sidebar.panellist', id: 'code-review' }),
    );
    expect(registrations).toContainEqual(
      expect.objectContaining({ name: 'settings.plugins.tab', id: 'code-review' }),
    );
    expect(document.head.querySelector('style[data-reviewd-native]')).not.toBeNull();
  });

  it('ships only scoped document selectors', () => {
    expect(client).toContain('.cr-native-scope');

    // The bundle embeds the stylesheet as an escaped JS string, so the raw text also matches
    // unrelated object shorthand (`body,`) in the bundled UI code. Assert on the stylesheet
    // text that `apply` actually injects, with the same unscoped-root-selector pattern.
    const { style } = mountBundle();
    expect(style).not.toBeNull();
    expect(style?.textContent ?? '').toContain('.cr-native-scope');
    expect(style?.textContent ?? '').not.toMatch(/(^|\n)\s*(html|body|:root|#root)\s*[{,]/);
  });
});
