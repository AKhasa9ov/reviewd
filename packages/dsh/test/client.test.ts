// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import * as React from 'react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The jsdom environment rewrites `import.meta.url`, so resolve the browser bundle from the repo root.
const client = readFileSync(join(process.cwd(), 'packages', 'dsh', 'client.js'), 'utf8');

function primaryButtonRule(): string {
  const match = /\.cr-button\.primary\{([^}]*)\}/.exec(client);
  if (match?.[1] === undefined) throw new Error('missing .cr-button.primary rule');
  return match[1];
}

interface ClientModule {
  factory(require: (id: string) => unknown): {
    apply(ctx: {
      slots: {
        inject(name: string, callback: () => void): void;
        register(
          config: { name: string; id?: string; key?: string },
          component: ComponentType,
        ): () => void;
      };
    }): void;
  };
}

/** Evaluate the browser client bundle with a stub module loader and return the main panel. */
function panelComponent(): ComponentType {
  const definitions: ClientModule[] = [];
  const loaderWindow = {
    __ModuleLoader__: {
      load(definition: ClientModule): void {
        definitions.push(definition);
      },
    },
  };
  // The bundle resolves `fetch` in its own VM context; forward to the test's stub dynamically.
  runInNewContext(client, {
    window: loaderWindow,
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
  });

  const definition = definitions.at(-1);
  if (definition === undefined) throw new Error('client module was not registered');
  const loaded = definition.factory((id) => {
    if (id === 'react') return React;
    throw new Error(`unexpected require: ${id}`);
  });

  let panel: ComponentType | undefined;
  loaded.apply({
    slots: {
      inject: (_name, callback) => callback(),
      register: (config, component) => {
        if (config.name === 'main') panel = component;
        return () => undefined;
      },
    },
  });
  if (panel === undefined) throw new Error('main panel was not registered');
  return panel;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

describe('DSH Code Review client styles', () => {
  it('keeps primary button text readable in both DSH themes', () => {
    const rule = primaryButtonRule();
    expect(rule).toContain('color:var(--dsw-alias-label-primary-foreground)');
    expect(rule).not.toContain('color:#fff');
  });
});

describe('DSH Code Review client links', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers info.uiBase for Open links and normalizes trailing slashes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/info')) {
        return jsonResponse({
          daemonUrl: 'http://127.0.0.1:9',
          publicUrl: 'https://public.example',
          uiBase: '/code-review/',
        });
      }
      return jsonResponse({
        items: [{ id: 'rev_1', title: 'One', roundCount: 0, openCommentCount: 0, status: 'open' }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(panelComponent()));

    const link = await screen.findByRole('link', { name: 'Open' });
    expect(link).toHaveAttribute('href', '/code-review/review/rev_1');
  });

  it('uses the host UI path for a newly created review', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/info')) {
        return jsonResponse({ daemonUrl: 'http://127.0.0.1:9', uiBase: '/code-review' });
      }
      if (init?.method === 'POST') {
        return jsonResponse({
          review: { review: { id: 'rev_2' } },
          url: 'http://127.0.0.1:5000/review/rev_2',
        });
      }
      return jsonResponse({ items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(React.createElement(panelComponent()));
    await screen.findByText('No reviews yet. Start one for this workspace.');

    await user.click(screen.getByRole('button', { name: 'New review' }));
    await user.type(screen.getByLabelText('Repository path (absolute)'), '/srv/repo');
    await user.click(screen.getByRole('button', { name: 'Start review' }));

    const link = await screen.findByRole('link', { name: 'Open in review UI' });
    expect(link).toHaveAttribute('href', '/code-review/review/rev_2');
  });
});
