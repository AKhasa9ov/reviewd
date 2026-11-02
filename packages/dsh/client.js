/* DSH Client half: sidebar entry + Code Review main panel. */
window.__ModuleLoader__.load({
  id: '@sir_yami/reviewd',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PANEL_ID = 'code-review';

    function Icon({ size = 18 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('rect', {
          x: 2,
          y: 4,
          width: 20,
          height: 16,
          rx: 4,
          stroke: 'currentColor',
          strokeWidth: 1.6,
        }),
        h('path', {
          d: 'M6 9h9M6 13h12M6 17h6',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
        h('circle', {
          cx: 18,
          cy: 16,
          r: 4.5,
          fill: 'var(--dsw-alias-state-success-primary, #22c55e)',
        }),
        h('path', {
          d: 'm16.3 16 1.2 1.2 2.2-2.6',
          stroke: '#fff',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    async function request(path, init) {
      const response = await fetch('/api/code-review' + path, {
        headers: { 'content-type': 'application/json' },
        ...init,
      });
      const text = await response.text();
      let body;
      try {
        body = text === '' ? null : JSON.parse(text);
      } catch {
        body = null;
      }
      if (!response.ok) {
        const error = new Error(
          body && body.error && body.error.message
            ? body.error.message
            : 'Request failed (' + response.status + ')',
        );
        error.status = response.status;
        error.code = body && body.error ? body.error.code : undefined;
        throw error;
      }
      return body;
    }

    function normalizedBase(value) {
      return typeof value === 'string' ? value.replace(/\/+$/, '') : '';
    }

    /**
     * The UI may live on the DSH origin (`info.uiBase`), a public URL, or the daemon
     * itself. Normalizing the trailing slash keeps links from doubling it.
     */
    function reviewUrl(base, id) {
      const prefix = normalizedBase(base);
      return prefix === '' ? '' : prefix + '/review/' + encodeURIComponent(id);
    }

    function useStyles() {
      return h(
        'style',
        null,
        `
        .cr-panel{display:flex;flex-direction:column;gap:16px;padding:24px;box-sizing:border-box;height:100%;overflow:auto;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit)}
        .cr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
        .cr-title{margin:0;font-size:20px;line-height:28px;font-weight:600}
        .cr-muted{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;margin:4px 0 0}
        .cr-button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:var(--dsw-radius-md,12px);padding:8px 14px;font:inherit;font-size:13px;cursor:pointer;min-height:36px}
        .cr-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
        .cr-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
        .cr-button.primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground)}
        .cr-button:disabled{opacity:.55;cursor:default}
        .cr-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
        .cr-row{display:flex;align-items:center;gap:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,16px);padding:12px 14px;background:var(--dsw-alias-bg-layer-1)}
        .cr-row-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}
        .cr-row-title{font-size:14px;line-height:20px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cr-row-meta{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);display:flex;gap:8px;flex-wrap:wrap}
        .cr-badge{font-size:11px;line-height:16px;padding:1px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
        .cr-state{padding:24px;border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,16px);color:var(--dsw-alias-label-secondary);font-size:13px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
        .cr-error{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
        .cr-form{display:flex;flex-direction:column;gap:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,16px);padding:16px;background:var(--dsw-alias-bg-layer-1);max-width:640px}
        .cr-field{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}
        .cr-input{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);padding:9px 11px;font:inherit;font-size:13px;min-height:36px}
        .cr-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
        .cr-link{color:var(--dsw-alias-brand-primary);text-decoration:none;font-size:13px}
        .cr-link:hover{text-decoration:underline}
        @media (max-width:640px){.cr-panel{padding:16px}.cr-row{align-items:flex-start;flex-direction:column}.cr-actions{justify-content:stretch}}
      `,
      );
    }

    function Panel() {
      const [state, setState] = React.useState({ status: 'loading', reviews: [], error: null });
      const [creating, setCreating] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [title, setTitle] = React.useState('Code review');
      const [repo, setRepo] = React.useState('');
      const [createdUrl, setCreatedUrl] = React.useState(null);
      const [uiBase, setUiBase] = React.useState('');
      const headingRef = React.useRef(null);

      const load = React.useCallback(async () => {
        setState((current) => ({ ...current, status: 'loading', error: null }));
        try {
          const [page, info] = await Promise.all([request('/reviews?limit=50'), request('/info')]);
          const source = info || {};
          setUiBase(
            normalizedBase(
              typeof source.uiBase === 'string' && source.uiBase !== ''
                ? source.uiBase
                : typeof source.publicUrl === 'string' && source.publicUrl !== ''
                  ? source.publicUrl
                  : typeof source.daemonUrl === 'string'
                    ? source.daemonUrl
                    : '',
            ),
          );
          setState({ status: 'ready', reviews: page.items || [], error: null });
        } catch (error) {
          setState({ status: 'error', reviews: [], error });
        }
      }, []);

      React.useEffect(() => {
        load();
      }, [load]);

      const submit = async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          const body = {
            repoRoot: repo.trim(),
            title: title.trim() || 'Code review',
            scope: { kind: 'worktree', baseRef: 'main' },
            reviewer: { backend: 'worker' },
          };
          const result = await request('/reviews', { method: 'POST', body: JSON.stringify(body) });
          const createdId =
            result && result.review && result.review.review ? result.review.review.id : null;
          const hosted = typeof createdId === 'string' ? reviewUrl(uiBase, createdId) : '';
          setCreatedUrl(hosted !== '' ? hosted : (result && result.url) || null);
          setCreating(false);
          setRepo('');
          await load();
        } catch (error) {
          setState({ status: 'error', reviews: [], error });
        } finally {
          setBusy(false);
        }
      };

      const closeForm = () => {
        if (busy) return;
        setCreating(false);
        setCreatedUrl(null);
        headingRef.current?.focus?.();
      };

      return h(
        'section',
        { className: 'cr-panel', 'data-testid': 'code-review-panel', 'aria-label': 'Code Review' },
        useStyles(),
        h(
          'div',
          { className: 'cr-head' },
          h(
            'div',
            null,
            h('h1', { className: 'cr-title', ref: headingRef, tabIndex: -1 }, 'Code Review'),
            h(
              'p',
              { className: 'cr-muted' },
              'Review changes and send feedback to the session that started the review.',
            ),
          ),
          h(
            'button',
            {
              className: 'cr-button primary',
              type: 'button',
              onClick: () => setCreating((value) => !value),
              'aria-expanded': creating,
            },
            creating ? 'Close' : 'New review',
          ),
        ),
        createdUrl
          ? h(
              'div',
              { className: 'cr-state' },
              'Review started. ',
              h(
                'a',
                { className: 'cr-link', href: createdUrl, target: '_blank', rel: 'noreferrer' },
                'Open in review UI',
              ),
            )
          : null,
        creating
          ? h(
              'form',
              {
                className: 'cr-form',
                onSubmit: submit,
                onKeyDown: (event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closeForm();
                  }
                },
              },
              h(
                'label',
                { className: 'cr-field' },
                'Title',
                h('input', {
                  className: 'cr-input',
                  value: title,
                  onChange: (event) => setTitle(event.target.value),
                  maxLength: 200,
                  autoFocus: true,
                }),
              ),
              h(
                'label',
                { className: 'cr-field' },
                'Repository path (absolute)',
                h('input', {
                  className: 'cr-input',
                  value: repo,
                  onChange: (event) => setRepo(event.target.value),
                  placeholder: '/home/me/project',
                  required: true,
                }),
              ),
              h(
                'div',
                { className: 'cr-actions' },
                h(
                  'button',
                  { className: 'cr-button', type: 'button', onClick: closeForm, disabled: busy },
                  'Cancel',
                ),
                h(
                  'button',
                  {
                    className: 'cr-button primary',
                    type: 'submit',
                    disabled: busy || repo.trim() === '',
                  },
                  busy ? 'Starting…' : 'Start review',
                ),
              ),
            )
          : null,
        state.status === 'loading'
          ? h('div', { className: 'cr-state', role: 'status' }, 'Loading reviews…')
          : null,
        state.status === 'error'
          ? h(
              'div',
              { className: 'cr-state cr-error', role: 'alert' },
              h(
                'span',
                null,
                state.error && (state.error.status === 401 || state.error.status === 503)
                  ? 'The review daemon is not configured or rejected the token.'
                  : 'Could not load reviews: ' +
                      (state.error ? state.error.message : 'unknown error'),
              ),
              h('button', { className: 'cr-button', type: 'button', onClick: load }, 'Retry'),
            )
          : null,
        state.status === 'ready' && state.reviews.length === 0
          ? h('div', { className: 'cr-state' }, 'No reviews yet. Start one for this workspace.')
          : null,
        state.status === 'ready' && state.reviews.length > 0
          ? h(
              'ul',
              { className: 'cr-list' },
              state.reviews.map((review) =>
                h(
                  'li',
                  { className: 'cr-row', key: review.id },
                  h(
                    'div',
                    { className: 'cr-row-main' },
                    h('span', { className: 'cr-row-title' }, review.title || review.id),
                    h(
                      'span',
                      { className: 'cr-row-meta' },
                      h('span', null, review.id),
                      h('span', null, (review.roundCount || 0) + ' rounds'),
                      h('span', null, (review.openCommentCount || 0) + ' open comments'),
                    ),
                  ),
                  h('span', { className: 'cr-badge' }, review.status || 'open'),
                  h(
                    'a',
                    {
                      className: 'cr-link',
                      href: reviewUrl(uiBase, review.id),
                      target: '_blank',
                      rel: 'noreferrer',
                    },
                    'Open',
                  ),
                ),
              ),
            )
          : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 12,
              label: () => 'Code Review',
            },
            Icon,
          ),
        );
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
            },
            Panel,
          ),
        );
      },
    };
  },
});
