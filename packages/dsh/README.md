# @dsh-code-review/dsh

Cordis bundle for DeepSeek Harness: sidebar panel, `/review` command, review tools, reviewer worker and feedback delivery.

Install with `plugin_manager install_bundle` pointing at this directory. Configure the inserted `code-review` row in the profile patch:

```yaml
- id: code-review
  config:
    daemonUrl: http://127.0.0.1:3100
    token: '<32+ byte bearer token>'
    worker: true
    reviewerBackend: worker
    repoHint: /absolute/repo
    # Optional:
    # publicUrl: https://reviews.example.lan   # browser-facing UI origin
    # reviewerTimeoutMs: 600000
```

`token` is a secret. It is used only by the Host half and is never sent to the Client or rendered. The Client calls same-origin `/api/code-review/*`, which the Host proxies to the daemon with a bearer token; `idempotency-key` and `x-review-actor` are forwarded, any client `authorization` is replaced.

The reviewer subagent is read-only: tools are restricted to `read`, `read_image`, `grep`, `glob`, `review_status` and `review_feedback`; shell, write, network, delegation and review-mutating tools are not visible. It must return a `schemaVersion: 1` report; timeouts cancel the agent and fail the job retryably.

Tools: `review_start`, `review_status`, `review_refresh`, `review_feedback`. Command: `/review <title>`.
