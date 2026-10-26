// packages/dsh/src/api.ts
var ReviewApiError = class extends Error {
  code;
  status;
  constructor(code, status, message) {
    super(message);
    this.name = "ReviewApiError";
    this.code = code;
    this.status = status;
  }
};
function errorCode(status) {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 422 || status === 400) return "validation";
  if (status === 503) return "unavailable";
  if (status >= 500) return "daemon-error";
  return "request-failed";
}
var ReviewApi = class {
  base;
  token;
  fetchImpl;
  timeoutMs;
  constructor(config, options = {}) {
    this.base = config.daemonUrl;
    this.token = config.token;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? config.requestTimeoutMs;
  }
  async request(method, path, body, signal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          ...body === void 0 ? {} : { "content-type": "application/json" }
        },
        ...body === void 0 ? {} : { body: JSON.stringify(body) },
        signal: controller.signal
      });
      const text = await response.text();
      let payload;
      try {
        payload = text === "" ? null : JSON.parse(text);
      } catch {
        payload = { error: { code: "invalid-response", message: text.slice(0, 500) } };
      }
      if (!response.ok) {
        const envelope = typeof payload === "object" && payload !== null ? payload : {};
        const code = typeof envelope.error?.code === "string" ? envelope.error.code : errorCode(response.status);
        const message = typeof envelope.error?.message === "string" ? envelope.error.message : `daemon returned ${String(response.status)}`;
        throw new ReviewApiError(code, response.status, message);
      }
      return payload;
    } catch (error) {
      if (error instanceof ReviewApiError) throw error;
      if (signal?.aborted === true) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ReviewApiError("timeout", 0, "review daemon request timed out");
      }
      throw new ReviewApiError(
        "daemon-unavailable",
        0,
        error instanceof Error ? error.message : "review daemon unavailable"
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  get(path, signal) {
    return this.request("GET", path, void 0, signal);
  }
  post(path, body, signal) {
    return this.request("POST", path, body, signal);
  }
};

// packages/dsh/src/config.ts
var DEFAULT_CONFIG = {
  daemonUrl: "http://127.0.0.1:3100",
  token: "",
  worker: false,
  reviewerBackend: "worker",
  pollMs: 2e3,
  deliveryPollMs: 1e3,
  heartbeatMs: 2e4,
  requestTimeoutMs: 3e4,
  reviewerTimeoutMs: 10 * 60 * 1e3
};
function stringValue(value, fallback) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}
function positive(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
function normalizeConfig(raw) {
  const input = typeof raw === "object" && raw !== null ? raw : {};
  const backend = input.reviewerBackend === "command" || input.reviewerBackend === "none" ? input.reviewerBackend : "worker";
  const model = input.reviewerModel;
  return {
    daemonUrl: stringValue(input.daemonUrl, DEFAULT_CONFIG.daemonUrl).replace(/\/+$/, ""),
    ...typeof input.publicUrl === "string" && input.publicUrl.trim() !== "" ? { publicUrl: input.publicUrl.trim().replace(/\/+$/, "") } : {},
    token: typeof input.token === "string" ? input.token : "",
    worker: input.worker === true,
    ...typeof input.repoHint === "string" && input.repoHint.trim() !== "" ? { repoHint: input.repoHint.trim() } : {},
    reviewerBackend: backend,
    ...typeof input.sessionId === "string" && input.sessionId !== "" ? { sessionId: input.sessionId } : {},
    ...typeof input.cwd === "string" && input.cwd !== "" ? { cwd: input.cwd } : {},
    ...typeof input.reviewerPreset === "string" && input.reviewerPreset !== "" ? { reviewerPreset: input.reviewerPreset } : {},
    ...typeof model === "object" && model !== null ? {
      reviewerModel: Object.fromEntries(
        Object.entries(model).filter(
          (entry) => typeof entry[1] === "string" && entry[1] !== ""
        )
      )
    } : {},
    pollMs: positive(input.pollMs, DEFAULT_CONFIG.pollMs),
    deliveryPollMs: positive(input.deliveryPollMs, DEFAULT_CONFIG.deliveryPollMs),
    heartbeatMs: positive(input.heartbeatMs, DEFAULT_CONFIG.heartbeatMs),
    requestTimeoutMs: positive(input.requestTimeoutMs, DEFAULT_CONFIG.requestTimeoutMs),
    reviewerTimeoutMs: positive(input.reviewerTimeoutMs, DEFAULT_CONFIG.reviewerTimeoutMs)
  };
}
function configProblem(config) {
  if (config.daemonUrl === "") return "daemonUrl is not configured";
  if (!/^https?:\/\//.test(config.daemonUrl)) return "daemonUrl must be an http(s) URL";
  if (config.publicUrl !== void 0 && !/^https?:\/\//.test(config.publicUrl)) {
    return "publicUrl must be an http(s) URL";
  }
  if (config.token.length < 32) return "token must be at least 32 characters";
  return void 0;
}

// packages/dsh/src/command.ts
function createReviewCommand(ctx, config, api) {
  return ctx.commands.register({
    name: "review",
    description: "Start a code review for this workspace and return its review URL.",
    async handler(invocation) {
      const agent = invocation.agent;
      let repo = config.repoHint ?? config.cwd;
      if (repo === void 0 && ctx.workingDirectory !== void 0 && agent.session !== void 0) {
        try {
          repo = ctx.workingDirectory.get(agent.session);
        } catch {
          repo = void 0;
        }
      }
      repo ??= agent.session?.header?.cwd ?? process.cwd();
      const sessionId = agent.session?.id ?? config.sessionId;
      const title = invocation.rawInput.trim() === "" ? "Code review" : invocation.rawInput.trim();
      try {
        const created = await api.post(
          "/api/reviews",
          {
            repoRoot: repo,
            title,
            scope: { kind: "worktree", baseRef: "main" },
            reviewer: { backend: config.reviewerBackend },
            ...sessionId === void 0 ? {} : { initiator: { harness: "dsh", sessionId, cwd: repo } }
          },
          invocation.signal
        );
        const id = created.review.review.id;
        return {
          kind: "success",
          text: `Review ${id} started${created.url === void 0 ? "" : `: ${created.url}`}`
        };
      } catch (error) {
        return {
          kind: "error",
          text: `Cannot start review: ${error instanceof Error ? error.message : "unknown error"}`
        };
      }
    }
  });
}

// packages/dsh/src/proxy.ts
var PREFIX = "/api/code-review";
var MAX_BODY = 2 * 1024 * 1024;
function json(res, status, code, message) {
  const body = JSON.stringify({ error: { code, message } });
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(body)),
    "cache-control": "no-store"
  });
  res.end(body);
}
async function bodyOf(req) {
  if (req.method === "GET" || req.method === "HEAD") return void 0;
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY) throw new Error("request body too large");
    chunks.push(buffer);
  }
  return chunks.length === 0 ? void 0 : Buffer.concat(chunks);
}
function createProxyHandler(deps) {
  const fetchImpl = deps.fetch ?? fetch;
  return async function proxy(req, res) {
    try {
      const url = req.url ?? "/";
      const path = url.startsWith(PREFIX) ? url.slice(PREFIX.length) || "/" : "/";
      if (!path.startsWith("/")) {
        json(res, 400, "bad-path", "invalid proxy path");
        return;
      }
      if (path === "/info" && (req.method === "GET" || req.method === "HEAD")) {
        const body2 = JSON.stringify({
          daemonUrl: deps.config.daemonUrl,
          ...deps.config.publicUrl === void 0 ? {} : { publicUrl: deps.config.publicUrl }
        });
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "content-length": String(Buffer.byteLength(body2)),
          "cache-control": "no-store"
        });
        res.end(req.method === "HEAD" ? void 0 : body2);
        return;
      }
      if (deps.config.token === "") {
        json(res, 503, "not-configured", "review daemon token is not configured");
        return;
      }
      const body = await bodyOf(req);
      const headers = {
        authorization: `Bearer ${deps.config.token}`,
        accept: typeof req.headers.accept === "string" ? req.headers.accept : "application/json"
      };
      if (req.headers["content-type"] !== void 0) {
        const contentType2 = req.headers["content-type"];
        if (typeof contentType2 === "string") headers["content-type"] = contentType2;
      }
      if (req.headers["last-event-id"] !== void 0) {
        const lastEventId = req.headers["last-event-id"];
        if (typeof lastEventId === "string") headers["last-event-id"] = lastEventId;
      }
      for (const name2 of ["idempotency-key", "x-review-actor"]) {
        const value = req.headers[name2];
        if (typeof value === "string" && value !== "") headers[name2] = value;
      }
      const controller = new AbortController();
      res.on("close", () => controller.abort());
      const daemonPath = path === "/" ? "/api" : `/api${path}`;
      const response = await fetchImpl(`${deps.config.daemonUrl}${daemonPath}`, {
        method: req.method ?? "GET",
        headers,
        ...body === void 0 ? {} : { body },
        signal: controller.signal,
        redirect: "manual"
      });
      const contentType = response.headers.get("content-type") ?? "application/json";
      if (contentType.includes("text/event-stream") && response.body !== null) {
        res.writeHead(response.status, {
          "content-type": contentType,
          "cache-control": "no-cache",
          connection: "keep-alive"
        });
        for await (const chunk of response.body) {
          if (res.writableEnded) break;
          res.write(chunk);
        }
        res.end();
        return;
      }
      const text = await response.text();
      const outgoing = {
        "content-type": contentType,
        "content-length": String(Buffer.byteLength(text)),
        "cache-control": response.headers.get("cache-control") ?? "no-store"
      };
      const requestId = response.headers.get("x-request-id");
      if (requestId !== null) outgoing["x-request-id"] = requestId;
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter !== null) outgoing["retry-after"] = retryAfter;
      res.writeHead(response.status, outgoing);
      res.end(text);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const message = error instanceof Error ? error.message : "proxy failed";
      if (message === "request body too large") {
        json(res, 413, "body-too-large", "request body exceeds 2 MiB");
        return;
      }
      json(res, 502, "daemon-unavailable", `cannot reach review daemon: ${message}`);
    }
  };
}

// packages/dsh/src/tools.ts
var OUTPUT_SCHEMA = { type: "object", additionalProperties: true };
function textResult(value) {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}
function failure(error) {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "tool-error";
  const message = error instanceof Error ? error.message : "review tool failed";
  return { ok: false, error: { code, message } };
}
function tool(name2, description, parameters, run) {
  return {
    name: name2,
    description,
    parameters,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => textResult(value)
    },
    async execute(args, exec) {
      try {
        return await run(args, exec);
      } catch (error) {
        return failure(error);
      }
    }
  };
}
function repoFor(ctx, config, agent) {
  if (config.repoHint !== void 0) return config.repoHint;
  if (config.cwd !== void 0) return config.cwd;
  if (ctx.workingDirectory !== void 0 && agent?.session !== void 0) {
    try {
      return ctx.workingDirectory.get(agent.session);
    } catch {
    }
  }
  if (agent?.session?.header?.cwd !== void 0) return agent.session.header.cwd;
  return process.cwd();
}
function initiatorFor(config, agent, cwd) {
  const sessionId = agent?.session?.id ?? config.sessionId;
  if (sessionId === void 0) return void 0;
  return {
    harness: "dsh",
    sessionId,
    cwd,
    ...config.reviewerPreset === void 0 ? {} : { agentPreset: config.reviewerPreset }
  };
}
function scopeFrom(args, base) {
  if (typeof args.commit === "string") return { kind: "commit", commit: args.commit };
  if (typeof args.head === "string") return { kind: "range", baseRef: base, headRef: args.head };
  return { kind: "worktree", baseRef: base };
}
function createReviewTools(ctx, config, api) {
  return [
    ctx.tools.register(
      tool(
        "review_start",
        "Start a code review of the current workspace or a git range. Returns the review id and review URL.",
        {
          type: "object",
          properties: {
            title: { type: "string", description: "Short review title." },
            repo: {
              type: "string",
              description: "Absolute repository path; defaults to the session workspace."
            },
            base: { type: "string", description: "Base ref, default main." },
            head: { type: "string", description: "Head ref for a committed range." },
            commit: { type: "string", description: "Review one commit." },
            reviewer: {
              type: "object",
              properties: {
                backend: { type: "string", enum: ["worker", "command", "none"] }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false
        },
        async (args, exec) => {
          const repo = typeof args.repo === "string" && args.repo !== "" ? args.repo : repoFor(ctx, config, exec.agent);
          const base = typeof args.base === "string" && args.base !== "" ? args.base : "main";
          const initiator = initiatorFor(config, exec.agent, repo);
          const body = {
            repoRoot: repo,
            title: typeof args.title === "string" && args.title !== "" ? args.title : "Code review",
            scope: scopeFrom(args, base),
            reviewer: args.reviewer ?? { backend: config.reviewerBackend },
            ...initiator === void 0 ? {} : { initiator }
          };
          const created = await api.post(
            "/api/reviews",
            body,
            exec.signal
          );
          return {
            ok: true,
            reviewId: created.review.review.id,
            url: created.url ?? null,
            status: "open"
          };
        }
      )
    ),
    ctx.tools.register(
      tool(
        "review_status",
        "Read one review, including rounds, comments and agent status.",
        {
          type: "object",
          properties: { reviewId: { type: "string" } },
          required: ["reviewId"],
          additionalProperties: false
        },
        async (args, exec) => {
          if (typeof args.reviewId !== "string" || args.reviewId === "") {
            return { ok: false, error: { code: "validation", message: "reviewId is required" } };
          }
          const view = await api.get(
            `/api/reviews/${encodeURIComponent(args.reviewId)}`,
            exec.signal
          );
          const review = view.review;
          return {
            ok: true,
            reviewId: review.id,
            title: review.title,
            status: review.status,
            rounds: Array.isArray(review.rounds) ? review.rounds.length : 0,
            comments: Array.isArray(review.comments) ? review.comments.length : 0,
            agent: review.agent ?? null,
            report: view.report ?? null
          };
        }
      )
    ),
    ctx.tools.register(
      tool(
        "review_refresh",
        "Create the next review round from the current workspace state, re-anchor comments and queue reviewer verification.",
        {
          type: "object",
          properties: { reviewId: { type: "string" } },
          required: ["reviewId"],
          additionalProperties: false
        },
        async (args, exec) => {
          if (typeof args.reviewId !== "string" || args.reviewId === "") {
            return { ok: false, error: { code: "validation", message: "reviewId is required" } };
          }
          const view = await api.post(
            `/api/reviews/${encodeURIComponent(args.reviewId)}/refresh`,
            {},
            exec.signal
          );
          return {
            ok: true,
            reviewId: args.reviewId,
            rounds: Array.isArray(view.review.rounds) ? view.review.rounds.length : 0
          };
        }
      )
    ),
    ctx.tools.register(
      tool(
        "review_feedback",
        "Read the latest submitted feedback for a review without delivering it again.",
        {
          type: "object",
          properties: { reviewId: { type: "string" } },
          required: ["reviewId"],
          additionalProperties: false
        },
        async (args, exec) => {
          if (typeof args.reviewId !== "string" || args.reviewId === "") {
            return { ok: false, error: { code: "validation", message: "reviewId is required" } };
          }
          const view = await api.get(
            `/api/reviews/${encodeURIComponent(args.reviewId)}/feedback`,
            exec.signal
          );
          return {
            ok: true,
            reviewId: args.reviewId,
            markdown: view.feedback?.markdown ?? "",
            json: view.feedback?.json ?? null
          };
        }
      )
    )
  ];
}

// packages/dsh/src/delivery.ts
var MAX_FEEDBACK_CHARS = 1e5;
var MAX_DELIVERY_ATTEMPTS = 3;
function wait(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}
function contentFor(record) {
  const header = `Code review feedback \u2014 ${record.reviewId} round ${String(record.round)}

`;
  const markdown = record.feedback.markdown ?? "";
  return `${header}${markdown}`.slice(0, MAX_FEEDBACK_CHARS);
}
async function deliverOne(deps, record, signal) {
  const initiator = record.initiator;
  if (initiator?.sessionId === void 0 || initiator.sessionId === "") {
    return;
  }
  if (deps.sessionController === void 0) {
    deps.logger?.warn?.("code-review: delivery pending but sessionController is unavailable");
    return;
  }
  if (deps.sessionController.resolveAgent !== void 0) {
    const resolved = await deps.sessionController.resolveAgent(initiator.sessionId);
    if (resolved.agent === void 0 && resolved.error !== void 0) {
      throw new Error(`cannot resume session: ${resolved.error.code ?? "unknown"}`);
    }
  }
  await deps.sessionController.prompt({
    sessionId: initiator.sessionId,
    mode: "queue",
    content: [{ type: "text", text: contentFor(record) }],
    requestId: `cr:${record.deliveryKey}`
  });
  await deps.api.post(
    `/api/deliveries/${encodeURIComponent(record.id)}/ack`,
    { by: "dsh" },
    signal
  );
}
async function runDeliveryLoop(deps, signal) {
  const sleep = deps.sleep ?? wait;
  let backoff = 1e3;
  const attempts = /* @__PURE__ */ new Map();
  while (!signal.aborted) {
    try {
      const pending = await deps.api.get(
        "/api/deliveries/pending?harness=dsh",
        signal
      );
      for (const record of pending.deliveries ?? []) {
        if (signal.aborted) return;
        try {
          await deliverOne(deps, record, signal);
          attempts.delete(record.id);
          backoff = 1e3;
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          const count = (attempts.get(record.id) ?? 0) + 1;
          attempts.set(record.id, count);
          if (count >= MAX_DELIVERY_ATTEMPTS) {
            deps.logger?.warn?.(
              `code-review: delivery ${record.id} failed ${count} times; marking it failed: ${message}`
            );
            try {
              await deps.api.post(
                `/api/deliveries/${encodeURIComponent(record.id)}/fail`,
                { error: message },
                signal
              );
              attempts.delete(record.id);
            } catch (failError) {
              deps.logger?.warn?.(
                `code-review: cannot mark delivery ${record.id} failed: ${failError instanceof Error ? failError.message : "unknown"}`
              );
            }
            continue;
          }
          deps.logger?.warn?.(
            `code-review: delivery ${record.id} failed (attempt ${count}/${MAX_DELIVERY_ATTEMPTS}): ${message}`
          );
          await sleep(backoff, signal);
          backoff = Math.min(backoff * 2, 3e4);
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      deps.logger?.warn?.(
        `code-review: delivery poll failed: ${error instanceof Error ? error.message : "unknown"}`
      );
      await sleep(backoff, signal);
      backoff = Math.min(backoff * 2, 3e4);
      continue;
    }
    await sleep(deps.config.deliveryPollMs, signal);
  }
}

// packages/dsh/src/worker.ts
import { randomUUID } from "node:crypto";
function wait2(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}
function textOfContent(content) {
  if (!Array.isArray(content)) return "";
  return content.map(
    (part) => typeof part === "object" && part !== null && part.type === "text" ? String(part.text ?? "") : ""
  ).join("\n");
}
function extractReviewerReport(events) {
  let lastText = "";
  for (const event of events) {
    if (typeof event !== "object" || event === null) continue;
    const record = event;
    if (record.type !== "assistant/message") continue;
    const text = textOfContent(record.data?.message?.content);
    if (text.trim() !== "") lastText = text;
  }
  if (lastText === "") return void 0;
  const fenced = [...lastText.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].at(-1);
  const candidate = fenced?.[1] ?? lastText;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return void 0;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function userMessage(text) {
  return {
    id: `msg_${randomUUID()}`,
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "user" }
  };
}
async function runJob(deps, lease, signal) {
  const { job, bundle } = lease;
  if (deps.agents === void 0) {
    await deps.api.post(
      `/api/jobs/${encodeURIComponent(job.id)}/fail`,
      {
        attemptId: job.attemptId,
        code: "worker-unavailable",
        message: "agent service unavailable",
        retryable: true
      },
      signal
    );
    return;
  }
  let parent;
  if (deps.config.sessionId !== void 0 && deps.sessionController !== void 0) {
    const resolved = await deps.sessionController.resolveAgent(deps.config.sessionId);
    parent = resolved.agent;
  }
  const cwd = (typeof bundle.meta?.cwd === "string" && bundle.meta.cwd !== "" ? bundle.meta.cwd : void 0) ?? deps.config.cwd ?? deps.config.repoHint ?? process.cwd();
  const sessionId = `review_${randomUUID()}`;
  let handle;
  try {
    handle = await deps.agents.create({
      sessionId,
      ...parent === void 0 ? {} : { parentAgent: parent },
      meta: {
        cwd,
        origin: "subagent",
        delegationDepth: 1,
        ...deps.config.reviewerPreset === void 0 ? {} : { agentPreset: deps.config.reviewerPreset },
        reviewId: job.reviewId,
        round: job.round
      },
      ...deps.config.reviewerModel === void 0 ? {} : { agentOptions: deps.config.reviewerModel }
    });
  } catch (error) {
    await deps.api.post(
      `/api/jobs/${encodeURIComponent(job.id)}/fail`,
      {
        attemptId: job.attemptId,
        code: "agent-create-failed",
        message: error instanceof Error ? error.message : "cannot create reviewer agent",
        retryable: true
      },
      signal
    );
    return;
  }
  const agent = handle.agent;
  const release = agent.ctx?.tools?.restrict({
    // The reviewer is strictly read-only. An allowlist is safer than a deny
    // list: new mutating or network tools cannot silently become available,
    // and the tool service rejects names that are absent from this harness.
    allow: ["read", "read_image", "grep", "glob", "review_status", "review_feedback"]
  });
  const timeoutMs = deps.config.reviewerTimeoutMs;
  const timeoutError = new Error("reviewer timed out");
  let timeout;
  let cancelled = false;
  const cancel = (cause) => {
    if (cancelled) return;
    cancelled = true;
    agent.cancel(cause);
  };
  const onAbort = () => cancel({ kind: "disposed" });
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    agent.followup(userMessage(bundle.prompt));
    await Promise.race([
      agent.whenIdle(),
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => {
          cancel({ kind: "timeout" });
          reject(timeoutError);
        }, timeoutMs);
      })
    ]);
    const events = agent.snapshotEvents?.() ?? [];
    const report = extractReviewerReport(events);
    if (report === void 0) {
      await deps.api.post(
        `/api/jobs/${encodeURIComponent(job.id)}/fail`,
        {
          attemptId: job.attemptId,
          code: "invalid-output",
          message: "reviewer returned no JSON report",
          retryable: false
        },
        signal
      );
      return;
    }
    if (report.schemaVersion !== 1) {
      await deps.api.post(
        `/api/jobs/${encodeURIComponent(job.id)}/fail`,
        {
          attemptId: job.attemptId,
          code: "invalid-output",
          message: `reviewer report must use schemaVersion 1 (received ${String(report.schemaVersion)})`,
          retryable: false
        },
        signal
      );
      return;
    }
    const findings = Array.isArray(report.findings) ? report.findings : [];
    if (findings.length > 0) {
      await deps.api.post(
        `/api/jobs/${encodeURIComponent(job.id)}/findings`,
        {
          attemptId: job.attemptId,
          findings
        },
        signal
      );
    }
    await deps.api.post(
      `/api/jobs/${encodeURIComponent(job.id)}/report`,
      {
        attemptId: job.attemptId,
        report
      },
      signal
    );
    await deps.api.post(
      `/api/jobs/${encodeURIComponent(job.id)}/ack`,
      {
        attemptId: job.attemptId
      },
      signal
    );
  } catch (error) {
    const timedOut = error === timeoutError;
    await deps.api.post(
      `/api/jobs/${encodeURIComponent(job.id)}/fail`,
      {
        attemptId: job.attemptId,
        code: timedOut ? "reviewer-timeout" : "reviewer-failed",
        message: error instanceof Error ? error.message : "reviewer failed",
        retryable: true
      },
      signal
    ).catch(() => void 0);
  } finally {
    if (timeout !== void 0) clearTimeout(timeout);
    signal.removeEventListener("abort", onAbort);
    release?.();
    const disposal = handle.dispose?.();
    if (disposal !== void 0) await disposal.catch(() => void 0);
  }
}
async function runWorkerLoop(deps, signal) {
  if (deps.agents === void 0) {
    deps.logger?.warn?.("code-review: worker enabled but ctx.agents is unavailable");
    return;
  }
  const sleep = deps.sleep ?? wait2;
  const randomId = deps.randomId ?? (() => `wkr_${randomUUID()}`);
  const baseId = randomId();
  let workerId;
  let registrationDelayMs = 1e3;
  for (let attempt = 1; !signal.aborted; attempt += 1) {
    try {
      const registered = await deps.api.post(
        "/api/workers/register",
        {
          id: baseId,
          name: "dsh-code-review",
          harness: "dsh"
        },
        signal
      );
      workerId = registered.id;
      break;
    } catch (error) {
      if (signal.aborted) return;
      deps.logger?.warn?.(
        `code-review: worker registration failed (attempt ${attempt}, retrying in ${registrationDelayMs}ms): ${error instanceof Error ? error.message : "unknown"}`
      );
      await sleep(registrationDelayMs, signal);
      registrationDelayMs = Math.min(registrationDelayMs * 2, 3e4);
    }
  }
  if (workerId === void 0) return;
  const heartbeat = setInterval(() => {
    void deps.api.post(`/api/workers/${encodeURIComponent(workerId)}/heartbeat`, {}, signal).catch(() => void 0);
  }, deps.config.heartbeatMs);
  heartbeat.unref?.();
  try {
    while (!signal.aborted) {
      try {
        const lease = await deps.api.get(
          `/api/jobs/next?workerId=${encodeURIComponent(workerId)}&wait=25`,
          signal
        );
        if (lease === null) continue;
        await runJob(deps, lease, signal);
      } catch (error) {
        if (signal.aborted) return;
        deps.logger?.warn?.(
          `code-review: worker poll failed: ${error instanceof Error ? error.message : "unknown"}`
        );
        await sleep(deps.config.pollMs, signal);
      }
    }
  } finally {
    clearInterval(heartbeat);
  }
}

// packages/dsh/src/host.ts
var name = "code-review";
var inject = ["tools", "commands", "webServer", "connection"];
function withConnectionGate(connection, handler) {
  return async (req, res) => {
    const rejection = connection.requestRejection({ headers: req.headers });
    if (rejection !== void 0) {
      res.writeHead(rejection).end();
      return;
    }
    await handler(req, res);
  };
}
function service(ctx, key) {
  const value = ctx.get(key);
  return value === void 0 || value === null ? void 0 : value;
}
function startLoops(ctx, config, api) {
  const controller = new AbortController();
  const agents = service(ctx, "agents");
  const sessionController = service(ctx, "sessionController");
  if (config.worker) {
    const deps = {
      config,
      api,
      ...agents === void 0 ? {} : { agents },
      ...sessionController === void 0 ? {} : { sessionController },
      ...ctx.logger === void 0 ? {} : { logger: ctx.logger }
    };
    void runWorkerLoop(deps, controller.signal).catch((error) => {
      ctx.logger?.warn?.(
        `code-review: worker stopped: ${error instanceof Error ? error.message : "unknown"}`
      );
    });
  }
  if (sessionController !== void 0) {
    const deps = {
      config,
      api,
      sessionController,
      ...ctx.logger === void 0 ? {} : { logger: ctx.logger }
    };
    void runDeliveryLoop(deps, controller.signal).catch((error) => {
      ctx.logger?.warn?.(
        `code-review: delivery stopped: ${error instanceof Error ? error.message : "unknown"}`
      );
    });
  }
  return () => controller.abort();
}
function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);
  const problem = configProblem(config);
  if (problem !== void 0) {
    ctx.logger?.warn?.(`code-review: ${problem}; tools and panel will report not configured`);
  }
  const api = new ReviewApi(config);
  const proxy = createProxyHandler({ config });
  const gatedProxy = withConnectionGate(ctx.connection, proxy);
  ctx.effect(
    () => ctx.webServer.register({ kind: "prefix", path: "/api/code-review", handler: gatedProxy })
  );
  ctx.effect(() => {
    const disposers = createReviewTools(ctx, config, api);
    return () => {
      for (const dispose of disposers) dispose();
    };
  });
  ctx.effect(() => createReviewCommand({ ...ctx, commands: ctx.commands }, config, api));
  ctx.effect(() => startLoops(ctx, config, api));
}
export {
  apply,
  inject,
  name
};
