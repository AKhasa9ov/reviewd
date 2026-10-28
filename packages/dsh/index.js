var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};

// packages/server/src/daemon/auth.ts
var auth_exports = {};
__export(auth_exports, {
  COOKIE_NAME: () => COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS: () => SESSION_MAX_AGE_SECONDS,
  assertToken: () => assertToken,
  bearerToken: () => bearerToken,
  clearCookie: () => clearCookie,
  cookieSession: () => cookieSession,
  createSession: () => createSession,
  isSameOriginMutation: () => isSameOriginMutation,
  parseCookies: () => parseCookies,
  randomId: () => randomId,
  sessionCookie: () => sessionCookie,
  tokenMatches: () => tokenMatches,
  verifySession: () => verifySession
});
import { createHmac, randomBytes as randomBytes3, timingSafeEqual } from "node:crypto";
function assertToken(token) {
  if (typeof token !== "string" || Buffer.byteLength(token, "utf8") < 32) {
    throw new Error("CODE_REVIEW_TOKEN must be at least 32 bytes");
  }
}
function digest(value) {
  return createHmac("sha256", "review-token-compare-v1").update(value, "utf8").digest();
}
function tokenMatches(expected, provided) {
  return timingSafeEqual(digest(expected), digest(provided));
}
function parseCookies(header) {
  const cookies = {};
  if (header === void 0) return cookies;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name2 = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name2 !== "" && !(name2 in cookies)) cookies[name2] = value;
  }
  return cookies;
}
function sign(secret, value) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}
function createSession(secret, now = Date.now()) {
  const issuedAt = String(now);
  return `v1.${issuedAt}.${sign(secret, `v1.${issuedAt}`)}`;
}
function verifySession(secret, value, now = Date.now()) {
  if (value === void 0) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false;
  if (now - issuedAt > SESSION_MAX_AGE_MS || issuedAt - now > 6e4) return false;
  const expected = sign(secret, `v1.${parts[1]}`);
  const provided = parts[2] ?? "";
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
function sessionCookie(secret, options) {
  const parts = [
    `${COOKIE_NAME}=${createSession(secret, options.now)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string") return void 0;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim();
}
function cookieSession(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME];
}
function expectedOrigin(req, publicUrl) {
  try {
    return new URL(publicUrl).origin;
  } catch {
    const host = req.headers.host;
    return host === void 0 ? "" : `http://${host}`;
  }
}
function isSameOriginMutation(req, publicUrl, auth) {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin !== "") {
    return origin === expectedOrigin(req, publicUrl);
  }
  const fetchSite = req.headers["sec-fetch-site"];
  if (typeof fetchSite === "string" && fetchSite !== "") {
    return fetchSite === "same-origin" || fetchSite === "none";
  }
  return auth === "bearer";
}
function randomId(prefix) {
  return `${prefix}_${randomBytes3(12).toString("base64url")}`;
}
var COOKIE_NAME, SESSION_MAX_AGE_SECONDS, SESSION_MAX_AGE_MS;
var init_auth = __esm({
  "packages/server/src/daemon/auth.ts"() {
    "use strict";
    COOKIE_NAME = "cr_session";
    SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
    SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1e3;
  }
});

// packages/dsh/src/api.ts
var ReviewApiError = class extends Error {
  code;
  status;
  constructor(code, status2, message) {
    super(message);
    this.name = "ReviewApiError";
    this.code = code;
    this.status = status2;
  }
};
function errorCode(status2) {
  if (status2 === 401 || status2 === 403) return "unauthorized";
  if (status2 === 404) return "not-found";
  if (status2 === 409) return "conflict";
  if (status2 === 422 || status2 === 400) return "validation";
  if (status2 === 503) return "unavailable";
  if (status2 >= 500) return "daemon-error";
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
var DeferredReviewApi = class {
  constructor(ready) {
    this.ready = ready;
    void ready.catch(() => void 0);
  }
  ready;
  async get(path, signal) {
    return (await this.ready).get(path, signal);
  }
  async post(path, body, signal) {
    return (await this.ready).post(path, body, signal);
  }
};

// packages/dsh/src/config.ts
var DEFAULT_CONFIG = {
  embedded: false,
  uiBase: "/code-review",
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
    embedded: input.embedded === true,
    uiBase: stringValue(input.uiBase, DEFAULT_CONFIG.uiBase).replace(/\/+$/, ""),
    ...typeof input.storeDir === "string" && input.storeDir.trim() !== "" ? { storeDir: input.storeDir.trim() } : {},
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
  if (config.embedded) return void 0;
  if (config.daemonUrl === "") return "daemonUrl is not configured";
  if (!/^https?:\/\//.test(config.daemonUrl)) return "daemonUrl must be an http(s) URL";
  if (config.publicUrl !== void 0 && !/^https?:\/\//.test(config.publicUrl)) {
    return "publicUrl must be an http(s) URL";
  }
  if (config.token.length < 32) return "token must be at least 32 characters";
  return void 0;
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
function reviewUrlFor(config, reviewId, fallback) {
  const path = `/review/${encodeURIComponent(reviewId)}`;
  if (config.embedded) {
    const base = config.uiBase === "/" ? "" : config.uiBase.replace(/\/+$/, "");
    return `${base}${path}`;
  }
  if (config.publicUrl !== void 0) return `${config.publicUrl.replace(/\/+$/, "")}${path}`;
  return fallback ?? null;
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
            url: reviewUrlFor(config, created.review.review.id, created.url),
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
        const url = reviewUrlFor(config, id, created.url);
        return {
          kind: "success",
          text: `Review ${id} started${url === null ? "" : `: ${url}`}`
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

// packages/dsh/src/embedded.ts
import { randomBytes as randomBytes9 } from "node:crypto";
import { homedir as homedir2 } from "node:os";
import { join as join6 } from "node:path";

// packages/server/src/daemon/server.ts
import { createServer } from "node:http";
import { join as join5 } from "node:path";

// packages/core/src/paths.ts
import { lstat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
var PathEscapeError = class extends Error {
  constructor(relative4) {
    super(`path escapes repository root: ${relative4}`);
    this.relative = relative4;
    this.name = "PathEscapeError";
  }
  relative;
};
function safeJoin(root, relative4) {
  if (relative4.includes("\0")) throw new PathEscapeError(relative4);
  const absolute = resolve(root, relative4);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new PathEscapeError(relative4);
  }
  return absolute;
}
function splitNulPaths(output) {
  const paths = output.split("\0");
  if (!output.endsWith("\0")) paths.pop();
  return paths.filter((path) => path.length > 0);
}
async function hasSymlinkParent(root, relativePath) {
  const absolute = safeJoin(root, relativePath);
  const rel = relative(root, absolute);
  if (rel === "") return false;
  let current = root;
  const parts = rel.split(sep);
  for (const part of parts.slice(0, -1)) {
    current = resolve(current, part);
    const info = await lstat(current).catch(() => null);
    if (info === null) return false;
    if (info.isSymbolicLink()) return true;
    if (!info.isDirectory()) return false;
  }
  return false;
}

// packages/core/src/diff/snapshot.ts
import { lstat as lstat4 } from "node:fs/promises";

// packages/core/src/git/content.ts
import { createHash } from "node:crypto";
import { lstat as lstat2, readFile, readlink } from "node:fs/promises";

// packages/core/src/git/run.ts
import { spawn } from "node:child_process";
var GitError = class extends Error {
  constructor(code, message, stderr = "") {
    super(message);
    this.code = code;
    this.stderr = stderr;
    this.name = "GitError";
  }
  code;
  stderr;
};
var DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
var DEFAULT_MAX_STDERR_BYTES = 1024 * 1024;
async function runGit(cwd, args, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
  if (options.signal?.aborted === true) {
    throw new GitError("git-failed", "git command aborted");
  }
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_EXTERNAL_DIFF: "",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    LC_ALL: "C",
    ...options.env
  });
  const gitArgs = [
    "--no-pager",
    "-c",
    "core.quotePath=false",
    "-c",
    "core.pager=cat",
    "-c",
    "diff.external=",
    "-c",
    "diff.noprefix=false",
    "-c",
    "diff.mnemonicPrefix=false",
    "-c",
    "diff.submodule=short",
    ...args
  ];
  return await new Promise((resolve5, reject2) => {
    const child = spawn("git", gitArgs, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      signal: options.signal,
      env
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject2(error);
    };
    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        fail(new GitError("git-missing", "git executable not found"));
      } else {
        fail(new GitError("git-failed", error.message));
      }
    });
    child.stdout.on("data", (chunk) => {
      if (settled) return;
      const remaining = maxBytes - bytes;
      if (chunk.length > remaining) {
        if (remaining > 0) {
          stdout.push(chunk.subarray(0, remaining));
          bytes += remaining;
        }
        if (options.truncateOnOverflow === true) {
          child.kill("SIGKILL");
          settled = true;
          const buffer = Buffer.concat(stdout);
          resolve5({
            stdout: buffer.toString("utf8"),
            stdoutBytes: buffer,
            stderr: Buffer.concat(stderr).toString("utf8"),
            code: 1,
            truncated: true
          });
          return;
        }
        child.kill("SIGKILL");
        fail(new GitError("git-failed", `git output exceeded ${maxBytes} bytes`));
        return;
      }
      stdout.push(chunk);
      bytes += chunk.length;
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxStderrBytes) {
        child.kill("SIGKILL");
        fail(new GitError("git-failed", `git stderr exceeded ${maxStderrBytes} bytes`));
        return;
      }
      stderr.push(chunk);
    });
    child.on("close", (code) => {
      if (settled) return;
      const buffer = Buffer.concat(stdout);
      const result = {
        stdout: buffer.toString("utf8"),
        stdoutBytes: buffer,
        stderr: Buffer.concat(stderr).toString("utf8"),
        code: code ?? 1,
        truncated: false
      };
      if (result.code !== 0 && options.allowFailure !== true) {
        settled = true;
        reject2(
          new GitError(
            "git-failed",
            `git ${args.join(" ")} failed (${result.code}): ${result.stderr.trim()}`,
            result.stderr
          )
        );
        return;
      }
      settled = true;
      resolve5(result);
    });
  });
}

// packages/core/src/git/content.ts
var DEFAULT_MAX_BYTES2 = 8 * 1024 * 1024;
var EMPTY = {
  lines: null,
  binary: false,
  oversized: false,
  symlink: false,
  hash: "",
  bytes: 0
};
function hashOf(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
function splitText(text) {
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
function decode(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}
function readBuffer(buffer, maxLines, symlink) {
  if (buffer.includes(0)) {
    return { ...EMPTY, binary: true, hash: hashOf(buffer), bytes: buffer.length };
  }
  const text = decode(buffer);
  if (text === null) {
    return {
      ...EMPTY,
      binary: true,
      encoding: "unknown",
      hash: hashOf(buffer),
      bytes: buffer.length
    };
  }
  const lines = splitText(text);
  if (lines.length > maxLines) return { ...EMPTY, oversized: true };
  return {
    lines,
    binary: false,
    oversized: false,
    symlink,
    hash: hashOf(buffer),
    bytes: buffer.length
  };
}
async function readBlob(repoRoot, revision, path, maxLines, maxBytes = DEFAULT_MAX_BYTES2) {
  let buffer;
  if (revision === null) {
    const absolute = safeJoin(repoRoot, path);
    if (await hasSymlinkParent(repoRoot, path)) {
      return { ...EMPTY, symlink: true };
    }
    let info;
    try {
      info = await lstat2(absolute);
    } catch {
      return { ...EMPTY, reason: "unreadable" };
    }
    if (info.isSymbolicLink()) {
      let target;
      try {
        target = await readlink(absolute, { encoding: "buffer" });
      } catch {
        return { ...EMPTY, symlink: true, reason: "unreadable" };
      }
      if (target.length > maxBytes) return { ...EMPTY, symlink: true, oversized: true };
      return readBuffer(target, maxLines, true);
    }
    if (!info.isFile()) return EMPTY;
    if (info.size > maxBytes) {
      return { ...EMPTY, oversized: true };
    }
    try {
      buffer = await readFile(absolute);
    } catch {
      return { ...EMPTY, reason: "unreadable" };
    }
  } else {
    let result;
    try {
      result = await runGit(repoRoot, ["show", `${revision}:${path}`], {
        allowFailure: true,
        maxBytes
      });
    } catch (error) {
      if (error instanceof GitError && error.message.includes("exceeded")) {
        return { ...EMPTY, oversized: true };
      }
      throw error;
    }
    if (result.code !== 0) return EMPTY;
    if (result.stdoutBytes.length > maxBytes) return { ...EMPTY, oversized: true };
    buffer = result.stdoutBytes;
  }
  return readBuffer(buffer, maxLines, false);
}

// packages/core/src/git/scope.ts
import { createHash as createHash2 } from "node:crypto";
import { constants } from "node:fs";
import { lstat as lstat3, open, readlink as readlink2, realpath as realpath2 } from "node:fs/promises";
import { isAbsolute, relative as relative2, sep as sep2 } from "node:path";

// packages/core/src/git/repo.ts
import { realpath, stat } from "node:fs/promises";
async function resolveRepoRoot(input) {
  const absolute = await realpath(input).catch(() => {
    throw new GitError("not-a-repo", `path does not exist: ${input}`);
  });
  const info = await stat(absolute).catch(() => {
    throw new GitError("not-a-repo", `path does not exist: ${input}`);
  });
  if (!info.isDirectory()) {
    throw new GitError("not-a-repo", `not a directory: ${input}`);
  }
  const result = await runGit(absolute, ["rev-parse", "--show-toplevel"], {
    allowFailure: true
  });
  if (result.code !== 0) {
    throw new GitError("not-a-repo", `not a git repository: ${input}`, result.stderr);
  }
  return await realpath(result.stdout.trim());
}

// packages/core/src/git/scope.ts
var EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
async function resolveScope(input) {
  const root = await resolveRepoRoot(input.repoRoot);
  const signal = input.signal;
  if (input.scope.kind === "range") {
    const headSha2 = await resolveCommitRef(root, input.scope.headRef, signal);
    const baseSha = input.scope.twoDot === true ? await resolveCommitRef(root, input.scope.baseRef, signal) : (await runGit(root, [
      "merge-base",
      await resolveCommitRef(root, input.scope.baseRef, signal),
      headSha2
    ])).stdout.trim();
    return {
      kind: "range",
      repoRoot: root,
      baseRef: input.scope.baseRef,
      headRef: input.scope.headRef,
      baseSha,
      headSha: headSha2,
      label: `${input.scope.baseRef}${input.scope.twoDot === true ? ".." : "..."}${input.scope.headRef}`,
      worktreeDigest: headSha2
    };
  }
  if (input.scope.kind === "worktree") {
    const baseSha = await resolveCommitRef(root, input.scope.baseRef, signal);
    const digest2 = await worktreeDigestState(root, baseSha, signal);
    const resolved = {
      kind: "worktree",
      repoRoot: root,
      baseRef: input.scope.baseRef,
      baseSha,
      headSha: null,
      label: `${input.scope.baseRef} (worktree)`,
      worktreeDigest: digest2.hash
    };
    if (digest2.truncated) resolved.worktreeDigestTruncated = true;
    return resolved;
  }
  if (input.scope.kind === "commits") {
    const shas = input.scope.shas;
    if (!Array.isArray(shas) || shas.length === 0) {
      throw new GitError("git-failed", "a commit scope needs at least one commit");
    }
    if (shas.length > MAX_SELECTED_COMMITS) {
      throw new GitError(
        "git-failed",
        `a commit scope accepts at most ${MAX_SELECTED_COMMITS} commits`
      );
    }
    const resolved = [];
    const seen = /* @__PURE__ */ new Set();
    for (const sha of shas) {
      if (typeof sha !== "string" || sha.trim() === "") {
        throw new GitError("git-failed", "every selected commit must be a commit ref");
      }
      const resolvedSha = await resolveCommitRef(root, sha.trim(), signal);
      if (seen.has(resolvedSha)) continue;
      seen.add(resolvedSha);
      resolved.push(resolvedSha);
    }
    for (let index = 1; index < resolved.length; index += 1) {
      const previous = resolved[index - 1] ?? "";
      const current = resolved[index] ?? "";
      const ancestor = await runGit(root, ["merge-base", "--is-ancestor", previous, current], {
        allowFailure: true,
        signal
      });
      if (ancestor.code !== 0) {
        throw new GitError(
          "git-failed",
          "selected commits must be ordered oldest to newest along one ancestry path"
        );
      }
    }
    const oldest = resolved[0] ?? "";
    const headSha2 = resolved[resolved.length - 1] ?? oldest;
    const baseSha = await resolveParentBase(root, oldest, signal);
    return {
      kind: "commits",
      repoRoot: root,
      baseSha,
      headSha: headSha2,
      label: resolved.length === 1 ? `commit ${headSha2.slice(0, 8)}` : `${resolved.length} commits: ${oldest.slice(0, 8)}..${headSha2.slice(0, 8)}`,
      worktreeDigest: headSha2,
      shas: resolved
    };
  }
  const headSha = await resolveCommitRef(root, input.scope.sha, signal);
  return {
    kind: "commit",
    repoRoot: root,
    baseSha: await resolveParentBase(root, headSha, signal),
    headSha,
    label: headSha.slice(0, 12),
    worktreeDigest: headSha
  };
}
var MAX_SELECTED_COMMITS = 200;
async function resolveCommitRef(repoRoot, ref, signal) {
  const result = await runGit(
    repoRoot,
    ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`],
    { signal }
  );
  return result.stdout.trim();
}
async function resolveParentBase(repoRoot, headSha, signal) {
  const parentSha = await firstParentSha(repoRoot, headSha, signal);
  if (parentSha === null) return EMPTY_TREE_SHA;
  const available = await runGit(repoRoot, ["cat-file", "-e", `${parentSha}^{commit}`], {
    allowFailure: true,
    signal
  });
  if (available.code !== 0) {
    throw new GitError(
      "git-failed",
      `commit ${headSha} has a parent that is not available; fetch/unshallow the repository`
    );
  }
  return parentSha;
}
async function firstParentSha(repoRoot, headSha, signal) {
  const listed = await runGit(repoRoot, ["rev-list", "--parents", "-n", "1", headSha], { signal });
  const fields = listed.stdout.trim().split(/\s+/).filter((field) => field !== "");
  if (fields.length > 1) return fields[1] ?? null;
  const object2 = await runGit(repoRoot, ["cat-file", "-p", headSha], { signal });
  const match = /^parent ([0-9a-f]{40})$/m.exec(object2.stdout);
  return match?.[1] ?? null;
}
function compareBytePaths(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
function abortedError() {
  return new GitError("git-failed", "git command aborted");
}
function isAborted(signal) {
  return signal?.aborted === true;
}
var DIGEST_DOMAIN = Buffer.from("dsh-worktree-digest-v2\0", "utf8");
var RECORD_DOMAIN = Buffer.from("dsh-untracked-record-v2\0", "utf8");
var TAG_STATUS = 1;
var TAG_DIFF = 2;
var TAG_UNTRACKED = 3;
var FIELD_TYPE = 1;
var FIELD_PATH = 2;
var FIELD_CONTENT = 3;
var TYPE_FILE = 1;
var TYPE_SYMLINK = 2;
var TYPE_UNREADABLE = 3;
var UNREADABLE = Buffer.from("unreadable", "utf8");
function updateFramedHeader(hash, tag, length) {
  const header = Buffer.alloc(9);
  header.writeUInt8(tag, 0);
  header.writeBigUInt64BE(BigInt(length), 1);
  hash.update(header);
}
function updateFramed(hash, tag, data) {
  updateFramedHeader(hash, tag, data.length);
  hash.update(data);
}
function newRecord() {
  return createHash2("sha256").update(RECORD_DOMAIN);
}
function recordPrefix(type, pathBytes) {
  const record = newRecord();
  updateFramed(record, FIELD_TYPE, Buffer.from([type]));
  updateFramed(record, FIELD_PATH, pathBytes);
  return record;
}
function unreadableRecord(pathBytes) {
  const record = recordPrefix(TYPE_UNREADABLE, pathBytes);
  updateFramed(record, FIELD_CONTENT, UNREADABLE);
  return record.digest();
}
function symlinkRecord(pathBytes, target) {
  const record = recordPrefix(TYPE_SYMLINK, pathBytes);
  updateFramed(record, FIELD_CONTENT, target);
  return record.digest();
}
function fileRecord(pathBytes, size) {
  const record = recordPrefix(TYPE_FILE, pathBytes);
  updateFramedHeader(record, FIELD_CONTENT, size);
  return record;
}
async function openedPath(handle2, absolute) {
  try {
    return await readlink2(`/proc/self/fd/${handle2.fd}`);
  } catch {
    return await realpath2(absolute);
  }
}
async function untrackedRecord(repoRoot, realRoot, path, signal) {
  if (isAborted(signal)) throw abortedError();
  const absolute = safeJoin(repoRoot, path);
  const pathBytes = Buffer.from(path, "utf8");
  if (await hasSymlinkParent(repoRoot, path)) return unreadableRecord(pathBytes);
  let info;
  try {
    info = await lstat3(absolute);
  } catch {
    return unreadableRecord(pathBytes);
  }
  if (isAborted(signal)) throw abortedError();
  if (info.isSymbolicLink()) {
    try {
      const target = await readlink2(absolute, { encoding: "buffer" });
      if (isAborted(signal)) throw abortedError();
      return symlinkRecord(pathBytes, target);
    } catch {
      if (isAborted(signal)) throw abortedError();
      return unreadableRecord(pathBytes);
    }
  }
  let handle2;
  try {
    handle2 = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat5 = await handle2.stat();
    if (!stat5.isFile()) return unreadableRecord(pathBytes);
    const opened = await openedPath(handle2, absolute);
    if (!isAbsolute(opened)) return unreadableRecord(pathBytes);
    const rel = relative2(realRoot, opened);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep2}`) || isAbsolute(rel)) {
      return unreadableRecord(pathBytes);
    }
    const record = fileRecord(pathBytes, stat5.size);
    if (stat5.size > 0) {
      let read = 0;
      const stream = handle2.createReadStream({
        start: 0,
        end: stat5.size - 1,
        autoClose: false,
        signal
      });
      for await (const chunk of stream) {
        record.update(chunk);
        read += chunk.length;
      }
      if (read !== stat5.size) return unreadableRecord(pathBytes);
    }
    return record.digest();
  } catch {
    if (isAborted(signal)) throw abortedError();
    return unreadableRecord(pathBytes);
  } finally {
    if (handle2 !== void 0) await handle2.close().catch(() => void 0);
  }
}
async function worktreeDigestState(repoRoot, baseSha, signal) {
  const status2 = await runGit(
    repoRoot,
    ["status", "--porcelain=v2", "-z", "--untracked-files=all"],
    { signal, maxBytes: 8 * 1024 * 1024, truncateOnOverflow: true }
  );
  const diff = await runGit(
    repoRoot,
    [
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--binary",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      baseSha,
      "--"
    ],
    { signal, maxBytes: 8 * 1024 * 1024, truncateOnOverflow: true }
  );
  const untracked = await runGit(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"], {
    signal,
    maxBytes: 8 * 1024 * 1024,
    truncateOnOverflow: true
  });
  const hash = createHash2("sha256").update(DIGEST_DOMAIN);
  updateFramed(hash, TAG_STATUS, status2.stdoutBytes);
  updateFramed(hash, TAG_DIFF, diff.stdoutBytes);
  const realRoot = await realpath2(repoRoot);
  const paths = splitNulPaths(untracked.stdout).sort(compareBytePaths);
  for (const path of paths) {
    updateFramed(hash, TAG_UNTRACKED, await untrackedRecord(repoRoot, realRoot, path, signal));
  }
  return {
    hash: hash.digest("hex"),
    truncated: status2.truncated === true || diff.truncated === true || untracked.truncated === true
  };
}

// packages/core/src/diff/parse.ts
var FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/;
var HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/;
var INDEX_LINE = /^index [0-9a-f]+\.\.[0-9a-f]+ (\d{6})$/;
function parseDiffHeader(line, lineNumber = 1) {
  const match = FILE_HEADER.exec(line);
  const separatorCount = line.split(" b/").length - 1;
  if (match === null || separatorCount !== 1) {
    throw new DiffParseError(
      `Malformed or ambiguous diff file header at line ${lineNumber}: expected exactly one " b/" separator between a/<path> and b/<path>`,
      lineNumber
    );
  }
  return { oldPath: match[1], newPath: match[2] };
}
var DiffParseError = class extends Error {
  line;
  constructor(message, line) {
    super(message);
    this.name = "DiffParseError";
    this.line = line;
  }
};
function parseUnifiedDiff(diff) {
  const files = [];
  let current = null;
  let hunk = null;
  let oldNo = 0;
  let newNo = 0;
  const finish = () => {
    if (current === null) return;
    if (hunk !== null) current.hunks.push(hunk);
    const hunks = current.hunks.filter((candidate) => candidate.lines.length > 0);
    let status2 = current.status;
    if (current.oldIsNull && !current.newIsNull) status2 = "added";
    else if (!current.oldIsNull && current.newIsNull) status2 = "deleted";
    else if (current.oldPath !== void 0 && current.oldPath !== current.path) status2 = "renamed";
    const parsed = {
      path: current.path,
      status: status2,
      binary: current.binary,
      hunks,
      added: current.added,
      deleted: current.deleted
    };
    if (current.oldPath !== void 0 && current.oldPath !== current.path) {
      parsed.oldPath = current.oldPath;
    }
    if (current.oldMode !== void 0) parsed.oldMode = current.oldMode;
    if (current.newMode !== void 0) parsed.newMode = current.newMode;
    if (current.indexMode !== void 0) parsed.indexMode = current.indexMode;
    files.push(parsed);
    current = null;
    hunk = null;
  };
  for (const [index, line] of diff.split("\n").entries()) {
    if (line.startsWith("diff --git ")) {
      finish();
      const { oldPath, newPath } = parseDiffHeader(line, index + 1);
      current = {
        path: newPath,
        ...oldPath !== newPath ? { oldPath } : {},
        status: "modified",
        binary: false,
        hunks: [],
        added: 0,
        deleted: 0,
        oldIsNull: false,
        newIsNull: false
      };
      continue;
    }
    if (current === null) continue;
    if (line.startsWith("@@ ")) {
      if (hunk !== null) current.hunks.push(hunk);
      const match = HUNK_HEADER.exec(line);
      if (match === null) {
        hunk = null;
        continue;
      }
      const oldStart = Number(match[1]);
      const oldLines = match[2] === void 0 ? 1 : Number(match[2]);
      const newStart = Number(match[3]);
      const newLines = match[4] === void 0 ? 1 : Number(match[4]);
      hunk = {
        oldStart,
        oldLines,
        newStart,
        newLines,
        header: match[5] ?? "",
        lines: []
      };
      oldNo = oldStart;
      newNo = newStart;
      continue;
    }
    if (hunk === null) {
      if (line.startsWith("new file mode ")) {
        current.status = "added";
        current.newMode = line.slice("new file mode ".length);
        continue;
      }
      if (line.startsWith("deleted file mode ")) {
        current.status = "deleted";
        current.oldMode = line.slice("deleted file mode ".length);
        continue;
      }
      if (line.startsWith("old mode ")) {
        current.oldMode = line.slice("old mode ".length);
        continue;
      }
      if (line.startsWith("new mode ")) {
        current.newMode = line.slice("new mode ".length);
        continue;
      }
      if (line.startsWith("index ")) {
        const match = INDEX_LINE.exec(line);
        if (match?.[1] !== void 0) current.indexMode = match[1];
        continue;
      }
      if (line.startsWith("rename from ")) {
        current.oldPath = line.slice("rename from ".length);
        current.status = "renamed";
        continue;
      }
      if (line.startsWith("rename to ")) {
        current.path = line.slice("rename to ".length);
        current.status = "renamed";
        continue;
      }
      if (line.startsWith("--- ")) {
        const value = line.slice(4);
        if (value === "/dev/null") {
          current.oldIsNull = true;
          current.status = "added";
        } else {
          current.oldPath = stripPrefix(value);
        }
        continue;
      }
      if (line.startsWith("+++ ")) {
        const value = line.slice(4);
        if (value === "/dev/null") {
          current.newIsNull = true;
          current.status = "deleted";
        } else {
          current.path = stripPrefix(value);
        }
        continue;
      }
      if (line.startsWith("Binary files ") || line === "GIT binary patch") {
        current.binary = true;
        continue;
      }
      continue;
    }
    if (line.startsWith("\\ No newline")) continue;
    if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) {
      const kind = line[0] === "+" ? "add" : line[0] === "-" ? "del" : "context";
      const text = line.slice(1);
      hunk.lines.push({
        kind,
        oldNo: kind === "add" ? null : oldNo,
        newNo: kind === "del" ? null : newNo,
        text
      });
      if (kind === "add") {
        current.added += 1;
        newNo += 1;
      } else if (kind === "del") {
        current.deleted += 1;
        oldNo += 1;
      } else {
        oldNo += 1;
        newNo += 1;
      }
    }
  }
  finish();
  return files;
}
function stripDiffPrefix(path) {
  return path.startsWith("a/") || path.startsWith("b/") ? path.slice(2) : path;
}
var stripPrefix = stripDiffPrefix;

// packages/core/src/diff/glob.ts
function globToRegExp(glob) {
  let pattern = glob.trim();
  if (pattern.endsWith("/")) pattern += "**";
  const anchored = pattern.includes("/");
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? "";
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (character === "?") {
      source += "[^/]";
      continue;
    }
    source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(anchored ? `^${source}$` : `(?:^|.*/)${source}$`);
}
function isIgnored(path, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}

// packages/core/src/diff/snapshot.ts
var DEFAULTS = {
  includeUntracked: true,
  includeContent: true,
  maxDiffBytes: 2 * 1024 * 1024,
  maxFileLines: 2e4,
  maxContentBytes: 1024 * 1024,
  maxTotalContentBytes: 64 * 1024 * 1024,
  maxFiles: 500
};
function fitsContent(budget, bytes) {
  if (!budget.includeContent) return false;
  if (budget.exhausted || budget.usedBytes + bytes > budget.maxTotalBytes) {
    if (!budget.warned) {
      budget.warnings.push("content-budget-truncated");
      budget.warned = true;
    }
    budget.exhausted = true;
    return false;
  }
  budget.usedBytes += bytes;
  return true;
}
function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
function warnUnreadable(warnings, path) {
  const warning = `unreadable:${path}`;
  if (!warnings.includes(warning)) warnings.push(warning);
}
function diffArgs(scope, raw = false) {
  const common = ["diff", "--no-color", "--no-ext-diff", "--no-textconv"];
  if (raw) common.push("--raw", "-z");
  else common.push("--unified=3");
  common.push("--find-renames=50%", "--src-prefix=a/", "--dst-prefix=b/");
  if (scope.kind === "worktree") return [...common, scope.baseSha, "--"];
  return [...common, `${scope.baseSha}..${scope.headSha}`, "--"];
}
function truncateAtFileBoundary(text, maxBytes) {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return { text, truncated: false };
  }
  const cut = Buffer.from(text, "utf8").subarray(0, maxBytes).toString("utf8");
  const boundary = cut.lastIndexOf("\ndiff --git ");
  if (boundary > 0) {
    const synthetic = syntheticFileFromCut(cut.slice(boundary + 1));
    return {
      text: cut.slice(0, boundary + 1),
      truncated: true,
      ...synthetic === void 0 ? {} : { synthetic }
    };
  }
  if (cut.startsWith("diff --git ")) {
    const synthetic = syntheticFileFromCut(cut);
    return { text: "", truncated: true, ...synthetic === void 0 ? {} : { synthetic } };
  }
  return { text: "", truncated: true };
}
function syntheticFileFromCut(cut) {
  const firstLineEnd = cut.indexOf("\n");
  const headerLine = firstLineEnd < 0 ? cut : cut.slice(0, firstLineEnd);
  if (!headerLine.startsWith("diff --git ")) return void 0;
  const header = parseDiffHeader(headerLine, 1);
  let oldPath = header.oldPath;
  let newPath = header.newPath;
  let status2 = "modified";
  let oldIsNull = false;
  let newIsNull = false;
  for (const line of cut.split("\n").slice(1)) {
    if (line.startsWith("@@ ") || line === "GIT binary patch") break;
    if (line.startsWith("new file mode ")) status2 = "added";
    else if (line.startsWith("deleted file mode ")) status2 = "deleted";
    else if (line.startsWith("rename from ")) {
      oldPath = line.slice("rename from ".length);
      status2 = "renamed";
    } else if (line.startsWith("rename to ")) {
      newPath = line.slice("rename to ".length);
      status2 = "renamed";
    } else if (line.startsWith("--- ")) {
      const value = line.slice(4);
      if (value === "/dev/null") oldIsNull = true;
      else oldPath = stripDiffPrefix(value);
    } else if (line.startsWith("+++ ")) {
      const value = line.slice(4);
      if (value === "/dev/null") newIsNull = true;
      else newPath = stripDiffPrefix(value);
    }
  }
  if (oldIsNull) status2 = "added";
  if (newIsNull) status2 = "deleted";
  const path = newIsNull ? oldPath : newPath;
  const file = {
    path,
    status: status2,
    binary: false,
    hunks: [],
    added: 0,
    deleted: 0,
    synthetic: true
  };
  if (oldPath !== path) file.oldPath = oldPath;
  return file;
}
function candidateKey(entry) {
  return `${entry.path}\0${entry.oldPath ?? ""}`;
}
function rawStatus(letter, oldMode, newMode) {
  if (letter === "R") return "renamed";
  if (oldMode === "160000" || newMode === "160000") return "submodule";
  if (letter === "A") return "added";
  if (letter === "D") return "deleted";
  return "modified";
}
function parseRawDiff(raw) {
  const tokens = raw.split("\0");
  const entries = [];
  for (let index = 0; index < tokens.length; ) {
    const header = tokens[index++];
    if (header === void 0 || !header.startsWith(":")) continue;
    const fields = header.slice(1).split(" ");
    const oldMode = fields[0] ?? "";
    const newMode = fields[1] ?? "";
    const letter = (fields[4] ?? "M").charAt(0);
    let oldPath;
    let path = tokens[index++] ?? "";
    if (letter === "R" || letter === "C") {
      oldPath = path;
      path = tokens[index++] ?? "";
    }
    if (path === "") continue;
    const entry = {
      path,
      status: rawStatus(letter, oldMode, newMode),
      binary: false,
      hunks: [],
      added: 0,
      deleted: 0,
      backfill: true
    };
    if (oldPath !== void 0) entry.oldPath = oldPath;
    entries.push(entry);
  }
  return entries;
}
async function listRawChanges(scope, signal) {
  const result = await runGit(scope.repoRoot, diffArgs(scope, true), { signal });
  return parseRawDiff(result.stdout);
}
async function listUntracked(repoRoot, signal) {
  const result = await runGit(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"], {
    signal,
    maxBytes: 8 * 1024 * 1024,
    truncateOnOverflow: true
  });
  return {
    paths: splitNulPaths(result.stdout),
    truncated: result.truncated === true
  };
}
async function headModes(repoRoot, headSha, signal) {
  let result;
  try {
    result = await runGit(
      repoRoot,
      headSha === null ? ["ls-files", "-s", "-z"] : ["ls-tree", "-r", "-z", headSha],
      { allowFailure: true, signal, maxBytes: 8 * 1024 * 1024 }
    );
  } catch (error) {
    if (signal?.aborted === true) throw error;
    return { modes: /* @__PURE__ */ new Map(), available: false };
  }
  if (result.code !== 0) return { modes: /* @__PURE__ */ new Map(), available: false };
  const modes = /* @__PURE__ */ new Map();
  for (const entry of result.stdout.split("\0")) {
    const tab = entry.indexOf("	");
    if (tab < 0) continue;
    const mode = entry.slice(0, tab).split(" ")[0];
    const path = entry.slice(tab + 1);
    if (mode !== void 0 && path !== "") modes.set(path, mode);
  }
  return { modes, available: true };
}
async function untrackedFile(repoRoot, path, maxFileLines, maxContentBytes, includeContent, ignored, budget, warnings) {
  const absolute = safeJoin(repoRoot, path);
  if (await hasSymlinkParent(repoRoot, path)) return null;
  const info = await lstat4(absolute).catch(() => null);
  if (info === null) {
    warnUnreadable(warnings, path);
    return {
      path,
      status: "untracked",
      binary: false,
      oversized: false,
      added: 0,
      deleted: 0,
      hunks: [],
      contentHash: null,
      reason: "unreadable"
    };
  }
  if (info.isSymbolicLink() || !info.isFile()) return null;
  const read = await readBlob(repoRoot, null, path, maxFileLines, maxContentBytes);
  if (read.reason === "unreadable") {
    warnUnreadable(warnings, path);
    return {
      path,
      status: "untracked",
      binary: false,
      oversized: false,
      added: 0,
      deleted: 0,
      hunks: [],
      contentHash: null,
      reason: "unreadable"
    };
  }
  if (ignored) {
    if (read.lines === null && !read.binary && !read.oversized) return null;
    return {
      path,
      status: "untracked",
      binary: read.binary,
      oversized: read.oversized,
      ignored: true,
      added: read.lines?.length ?? 0,
      deleted: 0,
      hunks: [],
      contentHash: null
    };
  }
  if (read.lines === null) {
    if (!read.binary && !read.oversized) return null;
    const binaryLike = {
      path,
      status: "untracked",
      binary: read.binary,
      oversized: read.oversized,
      added: 0,
      deleted: 0,
      hunks: [],
      contentHash: includeContent && !read.oversized ? read.hash : null
    };
    if (read.encoding !== void 0) binaryLike.encoding = read.encoding;
    return binaryLike;
  }
  const truncated = includeContent && !fitsContent(budget, read.bytes);
  const hunk = {
    oldStart: 0,
    oldLines: 0,
    newStart: 1,
    newLines: read.lines.length,
    header: "",
    lines: read.lines.map((text, index) => ({
      kind: "add",
      oldNo: null,
      newNo: index + 1,
      text
    }))
  };
  const file = {
    path,
    status: "untracked",
    binary: false,
    oversized: false,
    added: read.lines.length,
    deleted: 0,
    hunks: truncated || read.lines.length === 0 ? [] : [hunk],
    contentHash: includeContent && !truncated ? read.hash : null
  };
  if (truncated) file.truncated = true;
  if (includeContent && !truncated) file.newLines = read.lines;
  return file;
}
async function buildSnapshot(options) {
  const includeContent = options.includeContent ?? DEFAULTS.includeContent;
  const includeUntracked = options.includeUntracked ?? DEFAULTS.includeUntracked;
  const maxDiffBytes = options.maxDiffBytes ?? DEFAULTS.maxDiffBytes;
  const maxFileLines = options.maxFileLines ?? DEFAULTS.maxFileLines;
  const maxContentBytes = options.maxContentBytes ?? DEFAULTS.maxContentBytes;
  const maxTotalContentBytes = options.maxTotalContentBytes ?? DEFAULTS.maxTotalContentBytes;
  const maxFiles = options.maxFiles ?? DEFAULTS.maxFiles;
  const ignore = options.ignore ?? [];
  const scope = await resolveScope({
    repoRoot: options.repoRoot,
    scope: options.scope,
    signal: options.signal
  });
  const warnings = [];
  if (scope.worktreeDigestTruncated === true) warnings.push("worktree-digest-truncated");
  const diff = await runGit(scope.repoRoot, diffArgs(scope), {
    signal: options.signal,
    maxBytes: Math.max(maxDiffBytes * 8, 16 * 1024 * 1024),
    truncateOnOverflow: true
  });
  const diffTruncated = diff.truncated === true;
  if (diffTruncated) warnings.push("diff-truncated");
  const limited = truncateAtFileBoundary(diff.stdout, maxDiffBytes);
  if (limited.truncated && !diffTruncated) warnings.push("diff-truncated");
  if (limited.synthetic !== void 0) {
    warnings.push(`diff-file-truncated:${limited.synthetic.path}`);
  }
  const candidates = [
    ...limited.synthetic === void 0 ? [] : [limited.synthetic],
    ...parseUnifiedDiff(limited.text)
  ].sort((left, right) => comparePaths(left.path, right.path));
  let truncated = diffTruncated || limited.truncated;
  if (truncated) {
    const seen = new Set(candidates.map((entry) => candidateKey(entry)));
    const byKey = new Map(candidates.map((entry) => [candidateKey(entry), entry]));
    for (const entry of await listRawChanges(scope, options.signal)) {
      const key = candidateKey(entry);
      const warning = `diff-file-skipped:${entry.path}`;
      if (seen.has(key)) {
        const existing = byKey.get(key);
        if (existing?.synthetic === true) {
          existing.skipped = true;
          if (!warnings.includes(warning)) warnings.push(warning);
        }
        continue;
      }
      seen.add(key);
      byKey.set(key, entry);
      candidates.push(entry);
      if (!warnings.includes(warning)) warnings.push(warning);
    }
    candidates.sort((left, right) => comparePaths(left.path, right.path));
  }
  let selected = candidates;
  const reviewableCandidates = candidates.filter((entry) => !isIgnored(entry.path, ignore));
  if (reviewableCandidates.length > maxFiles) {
    const kept = new Set(reviewableCandidates.slice(0, maxFiles));
    selected = candidates.filter((entry) => isIgnored(entry.path, ignore) || kept.has(entry));
    truncated = true;
    warnings.push("files-truncated");
  }
  const modeListing = await headModes(scope.repoRoot, scope.headSha, options.signal);
  if (!modeListing.available) warnings.push("submodule-modes-unavailable");
  const budget = {
    includeContent,
    maxTotalBytes: maxTotalContentBytes,
    usedBytes: 0,
    exhausted: false,
    warned: false,
    warnings
  };
  const files = [];
  for (const entry of selected) {
    if (entry.backfill === true) {
      const skipped = {
        path: entry.path,
        status: entry.status,
        binary: false,
        oversized: false,
        added: 0,
        deleted: 0,
        hunks: [],
        contentHash: null,
        truncated: true,
        reason: "diff-truncated"
      };
      if (entry.oldPath !== void 0) skipped.oldPath = entry.oldPath;
      if (isIgnored(entry.path, ignore)) skipped.ignored = true;
      files.push(skipped);
      continue;
    }
    if (entry.synthetic === true) {
      const synthetic = {
        path: entry.path,
        status: entry.status,
        binary: false,
        oversized: true,
        added: 0,
        deleted: 0,
        hunks: [],
        contentHash: null
      };
      if (entry.oldPath !== void 0) synthetic.oldPath = entry.oldPath;
      if (entry.skipped === true) {
        synthetic.truncated = true;
        synthetic.reason = "diff-truncated";
      }
      if (isIgnored(entry.path, ignore)) {
        synthetic.ignored = true;
        synthetic.oversized = false;
      }
      files.push(synthetic);
      continue;
    }
    if (isIgnored(entry.path, ignore)) {
      const ignored = {
        path: entry.path,
        status: entry.status,
        binary: entry.binary,
        oversized: false,
        ignored: true,
        added: entry.added,
        deleted: entry.deleted,
        hunks: [],
        contentHash: null
      };
      if (entry.oldPath !== void 0) ignored.oldPath = entry.oldPath;
      files.push(ignored);
      continue;
    }
    const oldPath = entry.oldPath ?? entry.path;
    const hasMode = entry.oldMode !== void 0 || entry.newMode !== void 0 || entry.indexMode !== void 0;
    const isGitlink = hasMode ? entry.oldMode === "160000" || entry.newMode === "160000" || entry.indexMode === "160000" : modeListing.modes.get(entry.path) === "160000";
    if (isGitlink) {
      const submodule = {
        path: entry.path,
        status: "submodule",
        binary: false,
        oversized: false,
        added: entry.added,
        deleted: entry.deleted,
        hunks: entry.hunks,
        contentHash: null
      };
      if (entry.oldPath !== void 0) submodule.oldPath = entry.oldPath;
      files.push(submodule);
      continue;
    }
    const budgetSkipped = includeContent && budget.exhausted;
    const base = entry.status === "added" || !includeContent || budgetSkipped ? null : await readBlob(scope.repoRoot, scope.baseSha, oldPath, maxFileLines, maxContentBytes);
    const head = entry.status === "deleted" || !includeContent || budgetSkipped ? null : await readBlob(scope.repoRoot, scope.headSha, entry.path, maxFileLines, maxContentBytes);
    const binary = entry.binary || base?.binary === true || head?.binary === true;
    const oversized = base?.oversized === true || head?.oversized === true;
    const encoding = base?.encoding === "unknown" || head?.encoding === "unknown" ? "unknown" : void 0;
    const reason = base?.reason === "unreadable" || head?.reason === "unreadable" ? "unreadable" : void 0;
    let fileTruncated = false;
    let oldLines;
    let newLines;
    if (reason !== void 0) {
      warnUnreadable(warnings, entry.path);
    } else if (includeContent && !binary && !oversized) {
      if (budgetSkipped) {
        fileTruncated = true;
      } else {
        const bytes = (base?.lines === null || base === null ? 0 : base.bytes) + (head?.lines === null || head === null ? 0 : head.bytes);
        if (fitsContent(budget, bytes)) {
          oldLines = base?.lines ?? void 0;
          newLines = head?.lines ?? void 0;
        } else {
          fileTruncated = true;
        }
      }
    }
    let contentHash = null;
    if (includeContent && !oversized && reason === void 0 && !fileTruncated) {
      if (head !== null && head.hash !== "") contentHash = head.hash;
      else if (base !== null && base.hash !== "") contentHash = base.hash;
    }
    const file = {
      path: entry.path,
      status: entry.status,
      binary,
      oversized,
      added: entry.added,
      deleted: entry.deleted,
      hunks: binary || oversized ? [] : entry.hunks,
      contentHash
    };
    if (entry.oldPath !== void 0) file.oldPath = entry.oldPath;
    if (encoding !== void 0) file.encoding = encoding;
    if (reason !== void 0) file.reason = reason;
    if (fileTruncated) file.truncated = true;
    if (oldLines !== void 0) file.oldLines = oldLines;
    if (newLines !== void 0) file.newLines = newLines;
    files.push(file);
  }
  if (scope.kind === "worktree" && includeUntracked) {
    const listing = await listUntracked(scope.repoRoot, options.signal);
    if (listing.truncated) {
      if (!warnings.includes("untracked-list-truncated")) {
        warnings.push("untracked-list-truncated");
      }
      truncated = true;
    }
    for (const path of listing.paths) {
      const absolute = safeJoin(scope.repoRoot, path);
      const info = await lstat4(absolute).catch(() => null);
      if (info?.isSymbolicLink() === true || await hasSymlinkParent(scope.repoRoot, path)) {
        warnings.push(`symlink-not-followed:${path}`);
        continue;
      }
      const file = await untrackedFile(
        scope.repoRoot,
        path,
        maxFileLines,
        maxContentBytes,
        includeContent,
        isIgnored(path, ignore),
        budget,
        warnings
      );
      if (file !== null) files.push(file);
    }
  }
  files.sort((left, right) => comparePaths(left.path, right.path));
  const reviewableFiles = files.filter((file) => file.ignored !== true);
  if (reviewableFiles.length > maxFiles) {
    const kept = new Set(reviewableFiles.slice(0, maxFiles));
    files.splice(
      0,
      files.length,
      ...files.filter((file) => file.ignored === true || kept.has(file))
    );
    truncated = true;
    if (!warnings.includes("files-truncated")) warnings.push("files-truncated");
  }
  const totalsTruncated = truncated || budget.exhausted;
  const totals = files.reduce(
    (accumulator, file) => ({
      files: accumulator.files + 1,
      added: accumulator.added + file.added,
      deleted: accumulator.deleted + file.deleted,
      truncated: totalsTruncated
    }),
    { files: 0, added: 0, deleted: 0, truncated: totalsTruncated }
  );
  return {
    schemaVersion: 1,
    scope,
    files,
    totals,
    warnings
  };
}

// packages/core/src/review/ids.ts
import { randomBytes } from "node:crypto";
var ReviewIdError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ReviewIdError";
  }
};
var PREFIXES = /* @__PURE__ */ new Set(["rev", "rnd", "cmt", "evt", "snap", "anc", "sub", "job"]);
var CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
var TIME_LENGTH = 10;
var RANDOM_LENGTH = 16;
var RANDOM_BYTES = 10;
var MAX_TIME = 281474976710655;
function encodeFixed(value, length) {
  let remaining = value;
  let out = "";
  for (let index = 0; index < length; index++) {
    out = CROCKFORD[remaining % 32] + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}
function encodeBytes(bytes) {
  let accumulator = 0;
  let bits = 0;
  let out = "";
  for (const byte of bytes) {
    accumulator = accumulator << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[accumulator >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCKFORD[accumulator << 5 - bits & 31];
  return out;
}
function defaultRandom(length) {
  return randomBytes(length);
}
function createId(prefix, now = () => /* @__PURE__ */ new Date(), random = defaultRandom) {
  if (!PREFIXES.has(prefix)) {
    throw new ReviewIdError(`unknown id prefix: ${String(prefix)}`);
  }
  const date = now();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new ReviewIdError("clock returned an invalid date");
  }
  const time = date.getTime();
  if (time < 0 || time > MAX_TIME) {
    throw new ReviewIdError(`clock is outside the 48-bit millisecond range: ${time}`);
  }
  const bytes = random(RANDOM_BYTES);
  if (!(bytes instanceof Uint8Array) || bytes.length !== RANDOM_BYTES) {
    throw new ReviewIdError(`random source must return ${RANDOM_BYTES} bytes`);
  }
  const timePart = encodeFixed(time, TIME_LENGTH);
  const randomPart = encodeBytes(bytes);
  return `${prefix}_${timePart}${randomPart}`;
}
var ID_LENGTHS = {
  time: TIME_LENGTH,
  random: RANDOM_LENGTH,
  total: TIME_LENGTH + RANDOM_LENGTH
};

// packages/core/src/review/events.ts
var REVIEW_EVENT_TYPES = [
  "review/created",
  "round/created",
  "comment/added",
  "comment/replied",
  "comment/state",
  "comment/edited",
  "comment/deleted",
  "comment/anchor",
  "suggestion/state",
  "suggestion/applied",
  "fix/claim",
  "finding/decision",
  "review/updated",
  "review/deleted",
  "review/closed",
  "review/submitted",
  "agent/started",
  "agent/finding",
  "agent/report",
  "agent/failed"
];
var ReviewEventError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "ReviewEventError";
    this.code = code;
  }
};
var ACTOR_KINDS = /* @__PURE__ */ new Set(["human", "agent", "system"]);
var EVENT_TYPE_SET = new Set(REVIEW_EVENT_TYPES);
function isReviewEventType(value) {
  return typeof value === "string" && EVENT_TYPE_SET.has(value);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isActor(value) {
  if (!isRecord(value)) return false;
  return typeof value.name === "string" && value.name.trim().length > 0 && typeof value.kind === "string" && ACTOR_KINDS.has(value.kind);
}
function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}
function isEventId(value) {
  return typeof value === "string" && value.startsWith("evt_") && value.length > 4;
}
function createEvent(input) {
  if (!isReviewEventType(input.type)) {
    throw new ReviewEventError("unknown-type", `unknown event type: ${String(input.type)}`);
  }
  if (!isActor(input.actor)) {
    throw new ReviewEventError("invalid-actor", "event actor must have a non-empty name");
  }
  if (typeof input.reviewId !== "string" || input.reviewId.trim() === "") {
    throw new ReviewEventError("invalid-review-id", "event reviewId must be non-empty");
  }
  if (!isRecord(input.data)) {
    throw new ReviewEventError("invalid-event", "event data must be an object");
  }
  const now = input.now ?? (() => /* @__PURE__ */ new Date());
  const date = now();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new ReviewEventError("invalid-event", "event clock returned an invalid date");
  }
  const id = (input.newId ?? ((prefix) => createId(prefix, now)))("evt");
  if (!isEventId(id)) {
    throw new ReviewEventError("invalid-id", "event id must start with evt_");
  }
  return {
    v: 1,
    id,
    reviewId: input.reviewId,
    type: input.type,
    at: date.toISOString(),
    actor: input.actor,
    data: input.data
  };
}
function isReviewEvent(value) {
  if (!isRecord(value)) return false;
  if (value.v !== 1) return false;
  if (!isReviewEventType(value.type)) return false;
  if (!isEventId(value.id)) return false;
  if (typeof value.reviewId !== "string" || value.reviewId.trim() === "") return false;
  if (!isIsoTimestamp(value.at)) return false;
  if (!isActor(value.actor)) return false;
  if (!isRecord(value.data)) return false;
  if (value.seq !== void 0 && (typeof value.seq !== "number" || !Number.isInteger(value.seq) || value.seq < 1)) {
    return false;
  }
  return true;
}

// packages/core/src/review/anchors.ts
import { createHash as createHash3 } from "node:crypto";
var AnchorError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "AnchorError";
    this.code = code;
  }
};
var DEFAULT_WINDOW = 40;
var CONTEXT_LINES = 2;
function normalizeLine(line) {
  return line.replace(/\r$/, "").replace(/[ \t]+$/, "");
}
function normalizeQuote(quote) {
  return quote.split("\n").map(normalizeLine).join("\n");
}
function normalizeQuoteLines(quote) {
  return normalizeQuote(quote).split("\n");
}
function hashQuote(quote) {
  return createHash3("sha256").update(quote, "utf8").digest("hex");
}
function position(anchor) {
  return {
    round: anchor.round,
    path: anchor.path,
    lineStart: anchor.lineStart,
    lineEnd: anchor.lineEnd
  };
}
function linesFor(file, side) {
  return side === "new" ? file.newLines : file.oldLines;
}
function hunkHeaderFor(hunks, line, side) {
  for (const hunk of hunks) {
    const start = side === "new" ? hunk.newStart : hunk.oldStart;
    const count = side === "new" ? hunk.newLines : hunk.oldLines;
    if (count > 0 && line >= start && line < start + count) return hunk.header;
  }
  return "";
}
function contextBefore(lines, lineStart) {
  return lines.slice(Math.max(0, lineStart - 1 - CONTEXT_LINES), lineStart - 1);
}
function contextAfter(lines, lineEnd) {
  return lines.slice(lineEnd, lineEnd + CONTEXT_LINES);
}
function captureAnchor(snapshot, input) {
  if (!Number.isInteger(input.round) || input.round < 1) {
    throw new AnchorError("invalid-round", `round must be a positive integer: ${input.round}`);
  }
  const file = snapshot.files.find((candidate) => candidate.path === input.path);
  if (file === void 0) {
    throw new AnchorError("missing-path", `file is not present in the snapshot: ${input.path}`);
  }
  const lines = linesFor(file, input.side);
  if (lines === void 0 || lines.length === 0) {
    if (file.truncated === true) {
      throw new AnchorError("missing-lines", `file content was truncated: ${input.path}`);
    }
    throw new AnchorError(
      "missing-lines",
      `snapshot has no ${input.side} lines for: ${input.path}`
    );
  }
  const lineEnd = input.lineEnd ?? input.lineStart;
  if (!Number.isInteger(input.lineStart) || !Number.isInteger(lineEnd) || input.lineStart < 1 || lineEnd < input.lineStart || lineEnd > lines.length) {
    throw new AnchorError(
      "invalid-range",
      `range ${input.lineStart}..${lineEnd} is outside 1..${lines.length}`
    );
  }
  const quote = lines.slice(input.lineStart - 1, lineEnd).join("\n");
  return {
    id: input.id ?? createId("anc"),
    round: input.round,
    path: input.path,
    side: input.side,
    lineStart: input.lineStart,
    lineEnd,
    quote,
    contextBefore: contextBefore(lines, input.lineStart),
    contextAfter: contextAfter(lines, lineEnd),
    hunkHeader: hunkHeaderFor(file.hunks, input.lineStart, input.side),
    contentHash: hashQuote(quote),
    state: "active"
  };
}
function resolveFile(previous, next) {
  return next.files.find((file) => file.path === previous.path) ?? next.files.find((file) => file.oldPath === previous.path);
}
function expectedOldLine(line, hunks) {
  let delta = 0;
  for (const hunk of hunks) {
    const oldEnd = hunk.oldStart + hunk.oldLines - 1;
    if (hunk.oldLines > 0 && line >= hunk.oldStart && line <= oldEnd) {
      return hunk.newStart + (line - hunk.oldStart);
    }
    if (hunk.oldStart + hunk.oldLines <= line) {
      delta += hunk.newLines - hunk.oldLines;
    }
  }
  return line + delta;
}
function contextMatches(lines, context, start, quoteLength, direction) {
  if (context.length === 0) return false;
  for (let index = 0; index < context.length; index += 1) {
    const lineIndex = direction === "before" ? start - 2 - (context.length - 1 - index) : start + quoteLength - 1 + index;
    const line = lines[lineIndex];
    if (line === void 0 || normalizeLine(line) !== normalizeLine(context[index] ?? "")) {
      return false;
    }
  }
  return true;
}
function findCandidate(lines, quoteLines, expected, window, previous) {
  const maxStart = lines.length - quoteLines.length + 1;
  const from = Math.max(1, expected - window);
  const to = Math.min(maxStart, expected + window);
  let best;
  let tied = false;
  for (let start = from; start <= to; start += 1) {
    let matches = true;
    for (let offset = 0; offset < quoteLines.length; offset += 1) {
      const line = lines[start - 1 + offset];
      if (line === void 0 || normalizeLine(line) !== quoteLines[offset]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    const distance = Math.abs(start - expected);
    const score = 3 + (contextMatches(lines, previous.contextBefore, start, quoteLines.length, "before") ? 1 : 0) + (contextMatches(lines, previous.contextAfter, start, quoteLines.length, "after") ? 1 : 0) + Math.max(0, 1 - distance / (window + 1));
    if (best === void 0 || score > best.score || score === best.score && distance < best.distance) {
      best = { start, score, distance };
      tied = false;
    } else if (score === best.score && distance === best.distance) {
      tied = true;
    }
  }
  return best === void 0 ? void 0 : { ...best, tied };
}
function outdated(previous, file, options) {
  return {
    id: options.id ?? createId("anc"),
    round: options.round,
    path: file?.path ?? previous.path,
    side: previous.side,
    lineStart: previous.lineStart,
    lineEnd: previous.lineEnd,
    quote: previous.quote,
    contextBefore: [...previous.contextBefore],
    contextAfter: [...previous.contextAfter],
    hunkHeader: previous.hunkHeader,
    contentHash: previous.contentHash,
    state: "outdated",
    previous: position(previous)
  };
}
function reanchor(previous, next, options) {
  const file = resolveFile(previous, next);
  if (file === void 0) return outdated(previous, void 0, options);
  const lines = file.newLines;
  if (lines === void 0 || lines.length === 0) return outdated(previous, file, options);
  const quoteLines = normalizeQuoteLines(previous.quote);
  if (quoteLines.length === 0 || lines.length < quoteLines.length) {
    return outdated(previous, file, options);
  }
  const expectedRaw = previous.side === "old" ? expectedOldLine(previous.lineStart, file.hunks) : previous.lineStart;
  const expected = Math.max(1, expectedRaw);
  const window = Number.isFinite(options.window) ? Math.max(0, Math.trunc(options.window)) : DEFAULT_WINDOW;
  let quote = previous.quote;
  let best = findCandidate(lines, quoteLines, expected, window, previous);
  if (best === void 0 && options.fallbackQuote !== void 0) {
    const fallbackLines = normalizeQuoteLines(options.fallbackQuote);
    if (fallbackLines.length > 0 && lines.length >= fallbackLines.length) {
      best = findCandidate(lines, fallbackLines, expected, window, previous);
      if (best !== void 0) quote = options.fallbackQuote;
    }
  }
  if (best === void 0) return outdated(previous, file, options);
  const quoteLinesForAnchor = normalizeQuoteLines(quote);
  const lineStart = best.start;
  const lineEnd = lineStart + quoteLinesForAnchor.length - 1;
  return {
    id: options.id ?? createId("anc"),
    round: options.round,
    path: file.path,
    side: previous.side,
    lineStart,
    lineEnd,
    quote,
    contextBefore: contextBefore(lines, lineStart),
    contextAfter: contextAfter(lines, lineEnd),
    hunkHeader: hunkHeaderFor(file.hunks, lineStart, "new"),
    contentHash: hashQuote(quote),
    state: best.tied ? "ambiguous" : "active",
    previous: position(previous)
  };
}

// packages/core/src/review/outcomes.ts
function findFile(anchor, snapshot) {
  return snapshot.files.find((file) => file.path === anchor.path) ?? snapshot.files.find((file) => file.oldPath === anchor.path);
}
function contentAt(anchor, file) {
  const lines = file.newLines;
  if (lines === void 0 || file.truncated === true) return null;
  if (!Number.isInteger(anchor.lineStart) || !Number.isInteger(anchor.lineEnd) || anchor.lineStart < 1 || anchor.lineEnd < anchor.lineStart || anchor.lineEnd > lines.length) {
    return null;
  }
  return normalizeQuote(lines.slice(anchor.lineStart - 1, anchor.lineEnd).join("\n"));
}
function containsBlock(lines, block) {
  if (lines === void 0 || block === "") return false;
  const wanted = normalizeQuote(block).split("\n");
  if (wanted.length === 0) return false;
  for (let start = 0; start + wanted.length <= lines.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < wanted.length; offset += 1) {
      const line = lines[start + offset];
      if (line === void 0 || normalizeQuote(line) !== wanted[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}
function deriveOutcome(previous, next, nextSnapshot, suggestion) {
  const file = findFile(next, nextSnapshot);
  const content = file === void 0 ? null : contentAt(next, file);
  if (next.state === "outdated" || file === void 0 || content === null) {
    return { round: next.round, status: "outdated", confidence: "high" };
  }
  const previousQuote = normalizeQuote(previous.quote);
  const nextQuote = normalizeQuote(next.quote);
  if (suggestion !== void 0 && normalizeQuote(suggestion.original) === previousQuote && content === normalizeQuote(suggestion.replacement) && content !== previousQuote) {
    return { round: next.round, status: "applied", confidence: "high" };
  }
  if (nextQuote === previousQuote) {
    if (next.lineStart === previous.lineStart && next.lineEnd === previous.lineEnd && next.path === previous.path) {
      return { round: next.round, status: "unchanged", confidence: "high" };
    }
    return { round: next.round, status: "moved", confidence: "high" };
  }
  if (next.state === "active" || next.state === "ambiguous") {
    const confidence = suggestion !== void 0 && containsBlock(file.newLines, suggestion.replacement) ? "high" : "medium";
    return { round: next.round, status: "addressed", confidence };
  }
  return { round: next.round, status: "outdated", confidence: "low" };
}

// packages/core/src/review/fold.ts
var ReviewFoldError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ReviewFoldError";
  }
};
function findComment(state, commentId) {
  const comment = state.comments.find((candidate) => candidate.id === commentId);
  if (comment === void 0) {
    throw new ReviewFoldError(`unknown comment: ${commentId}`);
  }
  return comment;
}
function fold(state, event) {
  if (event.reviewId !== state.id) {
    throw new ReviewFoldError(`event ${event.id} belongs to ${event.reviewId}, not ${state.id}`);
  }
  if (event.type === "review/created") {
    if (event.data.review.id !== event.reviewId) {
      throw new ReviewFoldError(
        `review payload ${event.data.review.id} belongs to a different review than ${event.reviewId}`
      );
    }
    return {
      ...structuredClone(event.data.review),
      version: 1,
      warnings: []
    };
  }
  const next = structuredClone(state);
  next.version += 1;
  next.warnings ??= [];
  switch (event.type) {
    case "round/created": {
      if (next.rounds.some((round) => round.no === event.data.round.no)) {
        throw new ReviewFoldError(`duplicate round: ${event.data.round.no}`);
      }
      const expected = next.rounds.length + 1;
      if (event.data.round.no !== expected) {
        throw new ReviewFoldError(`round order: expected ${expected}, got ${event.data.round.no}`);
      }
      next.rounds.push(structuredClone(event.data.round));
      break;
    }
    case "comment/added": {
      if (next.comments.some((comment) => comment.id === event.data.comment.id)) {
        throw new ReviewFoldError(`duplicate comment: ${event.data.comment.id}`);
      }
      next.comments.push(structuredClone(event.data.comment));
      break;
    }
    case "comment/replied": {
      const comment = findComment(next, event.data.commentId);
      comment.replies.push(structuredClone(event.data.reply));
      break;
    }
    case "comment/state": {
      findComment(next, event.data.commentId).state = event.data.state;
      break;
    }
    case "comment/edited": {
      const comment = findComment(next, event.data.commentId);
      comment.body = event.data.body;
      comment.editedAt = event.at;
      comment.editedBy = structuredClone(event.actor);
      break;
    }
    case "comment/deleted": {
      const comment = findComment(next, event.data.commentId);
      comment.deletedAt = event.at;
      comment.deletedBy = structuredClone(event.actor);
      break;
    }
    case "comment/anchor": {
      const comment = findComment(next, event.data.commentId);
      const anchor = structuredClone(event.data.anchor);
      const index = comment.anchors.findIndex((candidate) => candidate.round === anchor.round);
      if (index < 0) comment.anchors.push(anchor);
      else comment.anchors[index] = anchor;
      if (event.data.outcome !== void 0) {
        comment.outcomes.push(structuredClone(event.data.outcome));
      }
      break;
    }
    case "suggestion/state": {
      findComment(next, event.data.commentId).suggestionState = event.data.state;
      break;
    }
    case "fix/claim": {
      next.fixClaims ??= [];
      next.fixClaims.push(...structuredClone(event.data.claims));
      break;
    }
    case "finding/decision": {
      next.findingDecisions ??= [];
      next.findingDecisions.push(structuredClone(event.data.decision));
      break;
    }
    case "review/updated": {
      if (event.data.title !== void 0) next.title = event.data.title;
      if (event.data.reviewer !== void 0) {
        next.reviewer = structuredClone(event.data.reviewer);
      }
      next.updatedAt = event.at;
      next.updatedBy = structuredClone(event.actor);
      break;
    }
    case "review/deleted": {
      next.deletedAt = event.at;
      next.deletedBy = structuredClone(event.actor);
      break;
    }
    case "suggestion/applied": {
      const comment = findComment(next, event.data.commentId);
      const alreadyApplied = comment.outcomes.some(
        (outcome) => outcome.round === event.data.round && outcome.status === "applied"
      );
      if (!alreadyApplied) {
        comment.outcomes.push({
          round: event.data.round,
          status: "applied",
          confidence: "high"
        });
        comment.suggestionState = "applied";
      }
      break;
    }
    case "review/closed": {
      next.status = "closed";
      next.closedAt ??= event.at;
      break;
    }
    case "review/submitted": {
      const submission = structuredClone(event.data.submission);
      next.submissions ??= [];
      if (next.submissions.some((item) => item.submissionId === submission.submissionId)) {
        throw new ReviewFoldError(`duplicate submission: ${submission.submissionId}`);
      }
      next.submissions.push(submission);
      if (submission.verdict === "approve") {
        next.status = "closed";
        next.closedAt ??= event.at;
      }
      break;
    }
    case "agent/started": {
      next.agent = {
        status: "running",
        jobId: event.data.jobId,
        round: event.data.round,
        startedAt: event.at,
        findings: []
      };
      break;
    }
    case "agent/finding": {
      next.agent ??= { status: "running", findings: [] };
      next.agent.findings ??= [];
      next.agent.findings.push(structuredClone(event.data.finding));
      break;
    }
    case "agent/report": {
      next.report = structuredClone(event.data.report);
      next.agent = {
        ...next.agent ?? {},
        status: event.data.report.skipped === true ? "skipped" : "done",
        round: event.data.report.round,
        findings: structuredClone(event.data.report.findings)
      };
      break;
    }
    case "agent/failed": {
      next.agent = {
        ...next.agent ?? {},
        status: "failed",
        error: event.data.message
      };
      break;
    }
  }
  return next;
}

// packages/core/src/review/store.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import {
  link,
  open as open2,
  readdir,
  readFile as readFile2,
  stat as stat2,
  mkdir,
  rename,
  rm,
  truncate,
  unlink
} from "node:fs/promises";
import { join, resolve as resolve2 } from "node:path";
var ReviewStoreLockedError = class extends Error {
  pid;
  stale;
  lockPath;
  constructor(message, options) {
    super(message);
    this.name = "ReviewStoreLockedError";
    this.pid = options.pid;
    this.stale = options.stale;
    this.lockPath = options.lockPath;
  }
};
var ReviewStoreCorruptionError = class extends Error {
  reviewId;
  line;
  constructor(message, reviewId, line) {
    super(message);
    this.name = "ReviewStoreCorruptionError";
    this.reviewId = reviewId;
    this.line = line;
  }
};
var ReviewNotFoundError = class extends Error {
  reviewId;
  constructor(reviewId) {
    super(`review not found: ${reviewId}`);
    this.name = "ReviewNotFoundError";
    this.reviewId = reviewId;
  }
};
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}
var REVIEW_STATUSES = /* @__PURE__ */ new Set(["open", "closed"]);
function isActor2(value) {
  if (!isRecord2(value)) return false;
  return typeof value.name === "string" && (value.kind === "human" || value.kind === "agent" || value.kind === "system");
}
function isComment(value) {
  if (!isRecord2(value)) return false;
  return typeof value.id === "string" && typeof value.reviewId === "string" && isTimestamp(value.createdAt) && typeof value.body === "string" && (value.state === "open" || value.state === "resolved" || value.state === "dismissed") && Array.isArray(value.replies) && Array.isArray(value.anchors) && Array.isArray(value.outcomes) && (value.editedAt === void 0 || isTimestamp(value.editedAt)) && (value.editedBy === void 0 || isActor2(value.editedBy)) && (value.deletedAt === void 0 || isTimestamp(value.deletedAt)) && (value.deletedBy === void 0 || isActor2(value.deletedBy));
}
function isFindingDecision(value) {
  if (!isRecord2(value)) return false;
  return typeof value.findingId === "string" && typeof value.round === "number" && Number.isInteger(value.round) && value.round > 0 && (value.state === "accepted" || value.state === "dismissed") && (value.note === void 0 || typeof value.note === "string") && isRecord2(value.by) && typeof value.by.name === "string" && (value.by.kind === "human" || value.by.kind === "agent" || value.by.kind === "system") && isTimestamp(value.at);
}
function isReviewState(value) {
  if (!isRecord2(value)) return false;
  return typeof value.id === "string" && typeof value.title === "string" && typeof value.repoRoot === "string" && typeof value.status === "string" && REVIEW_STATUSES.has(value.status) && isTimestamp(value.createdAt) && (value.closedAt === void 0 || isTimestamp(value.closedAt)) && (value.updatedAt === void 0 || isTimestamp(value.updatedAt)) && (value.updatedBy === void 0 || isActor2(value.updatedBy)) && (value.deletedAt === void 0 || isTimestamp(value.deletedAt)) && (value.deletedBy === void 0 || isActor2(value.deletedBy)) && Array.isArray(value.rounds) && Array.isArray(value.comments) && value.comments.every(isComment) && (value.findingDecisions === void 0 || Array.isArray(value.findingDecisions) && value.findingDecisions.every(isFindingDecision)) && typeof value.version === "number" && Number.isInteger(value.version) && value.version >= 0 && (value.warnings === void 0 || Array.isArray(value.warnings) && value.warnings.every((item) => typeof item === "string"));
}
function safeReviewId(reviewId) {
  if (typeof reviewId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(reviewId) || reviewId.length > 200) {
    throw new ReviewNotFoundError(reviewId);
  }
  return reviewId;
}
function safeSnapshotId(snapshotId) {
  if (typeof snapshotId !== "string" || !/^snap_[A-Za-z0-9]+$/.test(snapshotId)) {
    throw new ReviewNotFoundError(snapshotId);
  }
  return snapshotId;
}
function isSnapshot(value) {
  if (!isRecord2(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (!isRecord2(value.scope) || typeof value.scope.baseSha !== "string") return false;
  if (!Array.isArray(value.files)) return false;
  if (!isRecord2(value.totals) || !Array.isArray(value.warnings)) return false;
  return value.files.every(
    (file) => isRecord2(file) && typeof file.path === "string" && Array.isArray(file.hunks)
  );
}
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
function parseLock(raw) {
  try {
    const value = JSON.parse(raw);
    if (!isRecord2(value)) return {};
    return {
      ...typeof value.pid === "number" ? { pid: value.pid } : {},
      ...typeof value.createdAt === "string" ? { createdAt: value.createdAt } : {}
    };
  } catch {
    return {};
  }
}
async function readLock(lockPath) {
  try {
    const raw = await readFile2(lockPath, "utf8");
    return parseLock(raw);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    return {};
  }
}
function corrupt(reviewId, line, detail) {
  return new ReviewStoreCorruptionError(
    `review ${reviewId} is corrupt at line ${line}: ${detail}`,
    reviewId,
    line
  );
}
function splitEventLines(content) {
  if (content === "") return [];
  const lines = content.split("\n");
  if (content.endsWith("\n")) lines.pop();
  return lines;
}
function parseReview(content, reviewId) {
  const hasTrailingNewline = content.endsWith("\n");
  const lines = splitEventLines(content);
  if (lines.length === 0) throw new ReviewNotFoundError(reviewId);
  let state;
  let eventCount = 0;
  let torn = false;
  const events = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const lineNo = index + 1;
    const isLast = index === lines.length - 1;
    if (line.trim() === "") {
      if (isLast) {
        torn = true;
        continue;
      }
      throw corrupt(reviewId, lineNo, "empty line");
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      if (isLast) {
        torn = true;
        continue;
      }
      throw corrupt(reviewId, lineNo, "invalid JSON");
    }
    if (!isReviewEvent(parsed) || parsed.reviewId !== reviewId) {
      if (isLast && !hasTrailingNewline) {
        torn = true;
        continue;
      }
      throw corrupt(reviewId, lineNo, "invalid review event");
    }
    parsed.seq ??= lineNo;
    events.push(structuredClone(parsed));
    try {
      if (state === void 0) {
        if (parsed.type !== "review/created") {
          throw new Error("first event must be review/created");
        }
        state = fold(parsed.data.review, parsed);
      } else {
        state = fold(state, parsed);
      }
    } catch (error) {
      throw corrupt(reviewId, lineNo, error.message);
    }
    eventCount += 1;
  }
  if (state === void 0) throw new ReviewNotFoundError(reviewId);
  if (torn) state.warnings = [...state.warnings ?? [], "torn-tail"];
  return { state, eventCount, events };
}
function shortSha(sha) {
  return sha === null ? "worktree" : sha.slice(0, 8);
}
function summary(state) {
  const latest = state.rounds.at(-1);
  const comments = state.comments.filter((comment) => comment.deletedAt === void 0);
  const latestClaims = /* @__PURE__ */ new Map();
  for (const claim of state.fixClaims ?? []) latestClaims.set(claim.commentId, claim.status);
  return {
    id: state.id,
    title: state.title,
    repoRoot: state.repoRoot,
    status: state.status,
    createdAt: state.createdAt,
    roundCount: state.rounds.length,
    commentCount: comments.length,
    openCommentCount: comments.filter((comment) => comment.state === "open").length,
    ...latest === void 0 ? { scope: "no rounds" } : { scope: `${shortSha(latest.baseSha)} \u2192 ${shortSha(latest.headSha)}` },
    ...state.createdBy === void 0 ? {} : { author: state.createdBy.name },
    notFixedCount: [...latestClaims.values()].filter((status2) => status2 === "not-fixed").length
  };
}
var ReviewStore = class _ReviewStore {
  root;
  lockPath;
  lockCreatedAt;
  entries = /* @__PURE__ */ new Map();
  locks = /* @__PURE__ */ new Map();
  closed = false;
  constructor(root, lockCreatedAt) {
    this.root = root;
    this.lockPath = join(root, "lock");
    this.lockCreatedAt = lockCreatedAt;
  }
  static async open(root, options = {}) {
    const absolute = resolve2(root);
    await mkdir(absolute, { recursive: true });
    const lockPath = join(absolute, "lock");
    const createdAt = (options.now ?? (() => /* @__PURE__ */ new Date()))().toISOString();
    let handle2;
    try {
      handle2 = await open2(lockPath, "wx");
      await handle2.writeFile(JSON.stringify({ pid: process.pid, createdAt }));
      await handle2.sync();
      await handle2.close();
    } catch (error) {
      if (handle2 !== void 0) await handle2.close().catch(() => void 0);
      if (error.code !== "EEXIST") throw error;
      const existing = await readLock(lockPath);
      const pid = existing?.pid;
      if (pid !== void 0 && isPidAlive(pid)) {
        throw new ReviewStoreLockedError(`review store is locked by pid ${pid}`, {
          pid,
          stale: false,
          lockPath
        });
      }
      const message = pid === void 0 ? `stale lock: unreadable lock file ${lockPath}; remove it manually` : `stale lock: pid ${pid} is not running; remove ${lockPath} manually`;
      throw new ReviewStoreLockedError(message, {
        ...pid === void 0 ? {} : { pid },
        stale: true,
        lockPath
      });
    }
    return new _ReviewStore(absolute, createdAt);
  }
  async append(reviewId, event) {
    if (this.closed) throw new Error("review store is closed");
    const id = safeReviewId(reviewId);
    if (!isReviewEvent(event)) {
      throw new ReviewEventError("invalid-event", "append requires a valid review event");
    }
    if (event.reviewId !== id) {
      throw new ReviewEventError(
        "invalid-review-id",
        `event belongs to ${event.reviewId}, not ${id}`
      );
    }
    return await this.withReviewLock(id, async () => {
      const dir = this.reviewDir(id);
      await mkdir(dir, { recursive: true });
      const eventsPath = join(dir, "events.jsonl");
      await this.repairTornTail(eventsPath);
      let entry = this.entries.get(id);
      if (entry === void 0) {
        try {
          entry = await this.readEntry(id);
        } catch (error) {
          if (!(error instanceof ReviewNotFoundError)) throw error;
        }
      }
      if (entry === void 0) {
        if (event.type !== "review/created") throw new ReviewNotFoundError(id);
        entry = { state: event.data.review, eventCount: 0 };
      }
      const state = fold(entry.state, event);
      const sequenced = { ...event, seq: entry.eventCount + 1 };
      const payload = `${JSON.stringify(sequenced)}
`;
      const handle2 = await open2(eventsPath, "a");
      try {
        const result = await handle2.write(payload);
        if (result.bytesWritten !== Buffer.byteLength(payload)) {
          throw new Error("short event write");
        }
        await handle2.sync();
      } finally {
        await handle2.close();
      }
      const next = { state, eventCount: entry.eventCount + 1 };
      this.entries.set(id, next);
      await this.writeCache(id, next).catch(() => void 0);
      return structuredClone(sequenced);
    });
  }
  async load(reviewId) {
    if (this.closed) throw new Error("review store is closed");
    const id = safeReviewId(reviewId);
    return await this.withReviewLock(id, async () => {
      const entry = await this.readEntry(id);
      this.entries.set(id, entry);
      return structuredClone(entry.state);
    });
  }
  async events(reviewId, after = 0) {
    if (this.closed) throw new Error("review store is closed");
    const id = safeReviewId(reviewId);
    if (!Number.isInteger(after) || after < 0) {
      throw new ReviewEventError("invalid-event", "after must be a non-negative integer");
    }
    return await this.withReviewLock(id, async () => {
      const entry = await this.readEntry(id);
      this.entries.set(id, entry);
      return structuredClone((entry.events ?? []).filter((event) => (event.seq ?? 0) > after));
    });
  }
  async list() {
    if (this.closed) throw new Error("review store is closed");
    const reviewsRoot = join(this.root, "reviews");
    let entries;
    try {
      entries = await readdir(reviewsRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const summaries = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const cache = await this.readCache(id).catch(() => null);
      const cacheFresh = cache !== null && cache.state.id === id && cache.eventBytes !== void 0 && (await stat2(join(this.reviewDir(id), "events.jsonl")).catch(() => null))?.size === cache.eventBytes;
      if (cache !== null && cacheFresh) {
        if (cache.state.deletedAt === void 0) summaries.push(summary(cache.state));
        continue;
      }
      const rebuilt = await this.readEntry(id).catch(() => null);
      if (rebuilt === null || rebuilt.state.id !== id) continue;
      this.entries.set(id, rebuilt);
      if (rebuilt.state.deletedAt === void 0) summaries.push(summary(rebuilt.state));
    }
    summaries.sort((left, right) => {
      if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
    return summaries;
  }
  async writeSnapshot(snapshotId, snapshot) {
    if (this.closed) throw new Error("review store is closed");
    const id = safeSnapshotId(snapshotId);
    if (!isSnapshot(snapshot)) {
      throw new ReviewNotFoundError(id);
    }
    const dir = join(this.root, "snapshots");
    await mkdir(dir, { recursive: true });
    const target = join(dir, `${id}.json`);
    const temp = join(dir, `.${id}.${process.pid}.${randomBytes2(6).toString("hex")}.tmp`);
    const handle2 = await open2(temp, "wx");
    try {
      await handle2.writeFile(JSON.stringify(snapshot));
      await handle2.sync();
    } finally {
      await handle2.close();
    }
    try {
      await link(temp, target);
    } catch (error) {
      await unlink(temp).catch(() => void 0);
      throw error;
    }
    await unlink(temp).catch(() => void 0);
  }
  async readSnapshot(snapshotId) {
    if (this.closed) throw new Error("review store is closed");
    const id = safeSnapshotId(snapshotId);
    let raw;
    try {
      raw = await readFile2(join(this.root, "snapshots", `${id}.json`), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new ReviewNotFoundError(id);
      }
      throw error;
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ReviewNotFoundError(id);
    }
    if (!isSnapshot(value)) throw new ReviewNotFoundError(id);
    return structuredClone(value);
  }
  /**
   * Removes closed reviews older than `olderThanDays` and snapshots that no
   * remaining review references. Open reviews are never touched.
   */
  async gc(olderThanDays, now = /* @__PURE__ */ new Date()) {
    if (this.closed) throw new Error("review store is closed");
    if (!Number.isFinite(olderThanDays) || olderThanDays < 0) {
      throw new RangeError("olderThanDays must be a non-negative number");
    }
    const cutoff = now.getTime() - olderThanDays * 24 * 60 * 60 * 1e3;
    const reviewsRoot = join(this.root, "reviews");
    let reviewEntries = [];
    try {
      reviewEntries = await readdir(reviewsRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const all = /* @__PURE__ */ new Map();
    for (const entry of reviewEntries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const loaded = await this.readEntry(id).catch(() => null);
      if (loaded === null) continue;
      all.set(id, loaded.state);
      this.entries.set(id, loaded);
    }
    const removedReviews = [];
    for (const [id, state] of all) {
      if (state.status !== "closed") continue;
      const closedTime = new Date(state.closedAt ?? state.createdAt).getTime();
      if (!Number.isFinite(closedTime) || closedTime >= cutoff) continue;
      removedReviews.push(id);
      await rm(this.reviewDir(id), { recursive: true, force: true });
      this.entries.delete(id);
      all.delete(id);
    }
    const referenced = /* @__PURE__ */ new Set();
    for (const state of all.values()) {
      for (const round of state.rounds) referenced.add(round.snapshotId);
    }
    let removedSnapshots = 0;
    let entries = [];
    try {
      entries = await readdir(join(this.root, "snapshots"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const snapshotId = entry.slice(0, -".json".length);
      if (referenced.has(snapshotId)) continue;
      try {
        await unlink(join(this.root, "snapshots", entry));
        removedSnapshots += 1;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return { removedReviews, removedSnapshots };
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.entries.clear();
    const existing = await readLock(this.lockPath);
    if (existing?.pid === process.pid && existing.createdAt === this.lockCreatedAt) {
      await unlink(this.lockPath).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
  /**
   * Serializes work per review without blocking other reviews. A failed task
   * releases the gate so later appends can still make progress.
   */
  async withReviewLock(reviewId, task) {
    const previous = this.locks.get(reviewId) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolveGate) => {
      release = resolveGate;
    });
    const current = previous.catch(() => void 0).then(() => gate);
    this.locks.set(reviewId, current);
    await previous.catch(() => void 0);
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(reviewId) === current) this.locks.delete(reviewId);
    }
  }
  reviewDir(reviewId) {
    return join(this.root, "reviews", reviewId);
  }
  async repairTornTail(eventsPath) {
    let content;
    try {
      content = await readFile2(eventsPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (content === "" || content.endsWith("\n")) return;
    const lastNewline = content.lastIndexOf("\n");
    await truncate(eventsPath, lastNewline < 0 ? 0 : lastNewline + 1);
  }
  async readEntry(reviewId) {
    const dir = this.reviewDir(reviewId);
    let content;
    try {
      content = await readFile2(join(dir, "events.jsonl"), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new ReviewNotFoundError(reviewId);
      }
      throw error;
    }
    const { state, eventCount, events } = parseReview(content, reviewId);
    const cache = await this.readCache(reviewId);
    const eventBytes = Buffer.byteLength(content);
    if (cache !== null && cache.eventCount === eventCount && cache.eventBytes === eventBytes && cache.state.version === state.version && cache.state.id === reviewId) {
      return {
        state: {
          ...structuredClone(cache.state),
          warnings: [...state.warnings ?? []]
        },
        eventCount,
        events
      };
    }
    const entry = { state, eventCount, bytes: eventBytes, events };
    await this.writeCache(reviewId, entry).catch(() => void 0);
    return entry;
  }
  async readCache(reviewId) {
    let raw;
    try {
      raw = await readFile2(join(this.reviewDir(reviewId), "snapshot.json"), "utf8");
    } catch {
      return null;
    }
    try {
      const value = JSON.parse(raw);
      if (!isRecord2(value)) return null;
      if (value.reviewId !== reviewId) return null;
      if (typeof value.eventCount !== "number" || !Number.isInteger(value.eventCount)) return null;
      if (value.eventBytes !== void 0 && typeof value.eventBytes !== "number") return null;
      if (!isReviewState(value.state)) return null;
      return {
        reviewId,
        eventCount: value.eventCount,
        ...typeof value.eventBytes === "number" ? { eventBytes: value.eventBytes } : {},
        state: value.state
      };
    } catch {
      return null;
    }
  }
  async writeCache(reviewId, entry) {
    const dir = this.reviewDir(reviewId);
    const target = join(dir, "snapshot.json");
    const temp = join(dir, `.snapshot.${process.pid}.${randomBytes2(6).toString("hex")}.tmp`);
    const eventBytes = entry.bytes ?? await stat2(join(dir, "events.jsonl")).then(
      (info) => info.size,
      () => void 0
    );
    const payload = {
      reviewId,
      eventCount: entry.eventCount,
      ...eventBytes === void 0 ? {} : { eventBytes },
      state: entry.state
    };
    const handle2 = await open2(temp, "wx");
    try {
      await handle2.writeFile(JSON.stringify(payload));
      await handle2.sync();
    } finally {
      await handle2.close();
    }
    try {
      await rename(temp, target);
    } catch (error) {
      await unlink(temp).catch(() => void 0);
      throw error;
    }
  }
};

// packages/core/src/review/lifecycle.ts
var ReviewLifecycleError = class extends Error {
  code;
  reviewId;
  commentId;
  findingId;
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ReviewLifecycleError";
    this.code = code;
    if (details.reviewId !== void 0) this.reviewId = details.reviewId;
    if (details.commentId !== void 0) this.commentId = details.commentId;
    if (details.findingId !== void 0) this.findingId = details.findingId;
  }
};
function findComment2(state, commentId) {
  const comment = state.comments.find((candidate) => candidate.id === commentId);
  if (comment === void 0) {
    throw new ReviewLifecycleError("comment-not-found", `unknown comment: ${commentId}`, {
      reviewId: state.id,
      commentId
    });
  }
  return comment;
}
var ReviewLifecycle = class {
  store;
  now;
  constructor(store, now = () => /* @__PURE__ */ new Date()) {
    this.store = store;
    this.now = now;
  }
  async create(input) {
    const id = createId("rev", this.now);
    const state = {
      id,
      title: input.title,
      repoRoot: input.repoRoot,
      status: "open",
      createdAt: this.now().toISOString(),
      createdBy: input.actor,
      ...input.initiator === void 0 ? {} : { initiator: input.initiator },
      rounds: [],
      comments: [],
      version: 0,
      ...input.reviewer === void 0 ? {} : { reviewer: input.reviewer }
    };
    await this.store.append(
      id,
      createEvent({
        reviewId: id,
        type: "review/created",
        actor: input.actor,
        data: { review: state },
        now: this.now
      })
    );
    return this.get(id);
  }
  async get(reviewId) {
    try {
      return await this.store.load(reviewId);
    } catch (error) {
      if (error instanceof ReviewNotFoundError) {
        throw new ReviewLifecycleError("not-found", error.message, { reviewId });
      }
      throw error;
    }
  }
  async list() {
    return this.store.list();
  }
  async addRound(reviewId, snapshot, actor) {
    const state = await this.requireOpen(reviewId);
    const previous = state.rounds.at(-1);
    const sameScope = (round2) => snapshot.scope.headSha !== null && round2.baseSha === snapshot.scope.baseSha && round2.headSha === snapshot.scope.headSha;
    const earlier = state.rounds.slice(0, -1).find(sameScope);
    if (earlier !== void 0) {
      throw new ReviewLifecycleError(
        "duplicate-round",
        `snapshot already belongs to round ${earlier.no}`,
        { reviewId }
      );
    }
    if (previous !== void 0 && sameScope(previous)) {
      throw new ReviewLifecycleError(
        "duplicate-round",
        `snapshot already belongs to round ${previous.no}`,
        { reviewId }
      );
    }
    const snapshotId = createId("snap", this.now);
    await this.store.writeSnapshot(snapshotId, snapshot);
    const round = {
      no: state.rounds.length + 1,
      snapshotId,
      createdAt: this.now().toISOString(),
      baseSha: snapshot.scope.baseSha,
      headSha: snapshot.scope.headSha,
      path: `snapshots/${snapshotId}.json`
    };
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: "round/created",
        actor,
        data: { round },
        now: this.now
      })
    );
    return round;
  }
  async latestSnapshot(reviewId) {
    const state = await this.get(reviewId);
    const round = state.rounds.at(-1);
    if (round === void 0) {
      throw new ReviewLifecycleError("no-rounds", `review has no rounds: ${reviewId}`, {
        reviewId
      });
    }
    try {
      return await this.store.readSnapshot(round.snapshotId);
    } catch (error) {
      if (error instanceof ReviewNotFoundError) {
        throw new ReviewLifecycleError(
          "snapshot-mismatch",
          `round ${round.no} snapshot is missing or invalid: ${round.snapshotId}`,
          { reviewId }
        );
      }
      throw error;
    }
  }
  async addComment(reviewId, input, actor) {
    const state = await this.requireOpen(reviewId);
    const round = state.rounds.at(-1);
    if (round === void 0) {
      throw new ReviewLifecycleError("no-rounds", `review has no rounds: ${reviewId}`, {
        reviewId
      });
    }
    const snapshot = await this.latestSnapshot(reviewId);
    let anchor;
    try {
      anchor = captureAnchor(snapshot, {
        path: input.path,
        side: input.side,
        lineStart: input.lineStart,
        ...input.lineEnd === void 0 ? {} : { lineEnd: input.lineEnd },
        round: round.no,
        id: createId("anc", this.now)
      });
    } catch (error) {
      if (error instanceof AnchorError) {
        throw new ReviewLifecycleError("snapshot-mismatch", error.message, { reviewId });
      }
      throw error;
    }
    const comment = {
      id: createId("cmt", this.now),
      reviewId,
      createdAt: this.now().toISOString(),
      author: actor,
      body: input.body,
      state: "open",
      replies: [],
      anchors: [anchor],
      outcomes: [],
      ...input.suggestion === void 0 ? {} : { suggestion: structuredClone(input.suggestion) }
    };
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: "comment/added",
        actor,
        data: { comment },
        now: this.now
      })
    );
    return this.findComment(await this.get(reviewId), comment.id);
  }
  async reply(reviewId, commentId, body, actor) {
    const state = await this.requireOpen(reviewId);
    const target = findComment2(state, commentId);
    if (target.deletedAt !== void 0) {
      throw new ReviewLifecycleError("comment-not-found", `unknown comment: ${commentId}`, {
        reviewId,
        commentId
      });
    }
    if (body.trim() === "") {
      throw new ReviewLifecycleError("invalid-input", "reply body must be non-empty", { reviewId });
    }
    const reply = {
      id: createId("cmt", this.now),
      author: actor,
      body,
      createdAt: this.now().toISOString()
    };
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: "comment/replied",
        actor,
        data: { commentId, reply },
        now: this.now
      })
    );
    return this.findComment(await this.get(reviewId), commentId);
  }
  async editComment(reviewId, commentId, body, actor) {
    const state = await this.requireOpen(reviewId);
    const comment = findComment2(state, commentId);
    if (comment.deletedAt !== void 0) {
      throw new ReviewLifecycleError("comment-not-found", `unknown comment: ${commentId}`, {
        reviewId,
        commentId
      });
    }
    const text = body.trim();
    if (text === "") {
      throw new ReviewLifecycleError("invalid-input", "comment body must be non-empty", {
        reviewId,
        commentId
      });
    }
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: "comment/edited",
        actor,
        data: { commentId, body: text },
        now: this.now
      })
    );
    return findComment2(await this.get(reviewId), commentId);
  }
  async deleteComment(reviewId, commentId, actor) {
    const state = await this.get(reviewId);
    if (state.deletedAt !== void 0) {
      throw new ReviewLifecycleError("not-found", `review not found: ${reviewId}`, { reviewId });
    }
    const comment = findComment2(state, commentId);
    if (comment.deletedAt !== void 0) return comment;
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: "comment/deleted",
        actor,
        data: { commentId },
        now: this.now
      })
    );
    return findComment2(await this.get(reviewId), commentId);
  }
  async setCommentState(reviewId, commentId, state, actor) {
    const review = await this.requireOpen(reviewId);
    const comment = findComment2(review, commentId);
    if (comment.deletedAt !== void 0) {
      throw new ReviewLifecycleError("comment-not-found", `unknown comment: ${commentId}`, {
        reviewId,
        commentId
      });
    }
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: "comment/state",
        actor,
        data: { commentId, state },
        now: this.now
      })
    );
    return this.findComment(await this.get(reviewId), commentId);
  }
  async decideFinding(reviewId, findingId, input, actor) {
    if (input.state !== "accepted" && input.state !== "dismissed") {
      throw new ReviewLifecycleError("invalid-input", `unknown finding decision: ${input.state}`, {
        reviewId
      });
    }
    if (input.note !== void 0 && typeof input.note !== "string") {
      throw new ReviewLifecycleError("invalid-input", "finding decision note must be a string", {
        reviewId
      });
    }
    const note = input.note?.trim();
    if (note !== void 0 && note.length > 4e3) {
      throw new ReviewLifecycleError("invalid-input", "finding decision note is too long", {
        reviewId
      });
    }
    const state = await this.requireOpen(reviewId);
    const latestRound = state.rounds.at(-1);
    if (state.report === void 0 || latestRound === void 0) {
      throw new ReviewLifecycleError(
        "invalid-input",
        `review has no reviewer report: ${reviewId}`,
        { reviewId }
      );
    }
    if (state.report.round !== latestRound.no) {
      throw new ReviewLifecycleError(
        "invalid-input",
        `reviewer report is from round ${state.report.round}, latest is ${latestRound.no}`,
        { reviewId }
      );
    }
    if (!state.report.findings.some((finding) => finding.id === findingId)) {
      throw new ReviewLifecycleError("finding-not-found", `unknown finding: ${findingId}`, {
        reviewId,
        findingId
      });
    }
    const decision = {
      findingId,
      round: state.report.round,
      state: input.state,
      ...note === void 0 || note === "" ? {} : { note },
      by: actor,
      at: this.now().toISOString()
    };
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: "finding/decision",
        actor,
        data: { decision },
        now: this.now
      })
    );
    return decision;
  }
  async updateReview(reviewId, input, actor) {
    await this.requireOpen(reviewId);
    const title = input.title?.trim();
    if (title === void 0 && input.reviewer === void 0) {
      throw new ReviewLifecycleError("invalid-input", "review update is empty", { reviewId });
    }
    if (title !== void 0 && title === "") {
      throw new ReviewLifecycleError("invalid-input", "review title must be non-empty", {
        reviewId
      });
    }
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: "review/updated",
        actor,
        data: {
          ...title === void 0 ? {} : { title },
          ...input.reviewer === void 0 ? {} : { reviewer: input.reviewer }
        },
        now: this.now
      })
    );
    return this.get(reviewId);
  }
  async deleteReview(reviewId, actor, reason) {
    const state = await this.get(reviewId);
    if (state.deletedAt !== void 0) return state;
    if (reason !== void 0 && typeof reason !== "string") {
      throw new ReviewLifecycleError("invalid-input", "delete reason must be a string", {
        reviewId
      });
    }
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: "review/deleted",
        actor,
        data: reason === void 0 || reason.trim() === "" ? {} : { reason: reason.trim() },
        now: this.now
      })
    );
    return this.get(reviewId);
  }
  async close(reviewId, verdict, actor) {
    const state = await this.get(reviewId);
    if (state.deletedAt !== void 0) {
      throw new ReviewLifecycleError("not-found", `review not found: ${reviewId}`, { reviewId });
    }
    if (state.status === "closed") {
      throw new ReviewLifecycleError("closed", `review is already closed: ${reviewId}`, {
        reviewId
      });
    }
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: "review/closed",
        actor,
        data: { verdict },
        now: this.now
      })
    );
    return this.get(reviewId);
  }
  async refresh(reviewId, snapshot, actor) {
    const state = await this.requireOpen(reviewId);
    const round = await this.addRound(reviewId, snapshot, actor);
    const comments = structuredClone(state.comments);
    for (const comment of comments) {
      const previous = comment.anchors.at(-1);
      if (previous === void 0) continue;
      const anchor = reanchor(previous, snapshot, {
        round: round.no,
        id: createId("anc", this.now),
        ...comment.suggestion === void 0 ? {} : { fallbackQuote: comment.suggestion.replacement }
      });
      const outcome = deriveOutcome(previous, anchor, snapshot, comment.suggestion);
      await this.store.append(
        reviewId,
        createEvent({
          reviewId,
          type: "comment/anchor",
          actor,
          data: { commentId: comment.id, anchor, outcome },
          now: this.now
        })
      );
      const index = comment.anchors.findIndex((candidate) => candidate.round === anchor.round);
      if (index < 0) comment.anchors.push(anchor);
      else comment.anchors[index] = anchor;
      comment.outcomes.push(outcome);
    }
    return { round, comments };
  }
  async requireOpen(reviewId) {
    const state = await this.get(reviewId);
    if (state.deletedAt !== void 0) {
      throw new ReviewLifecycleError("not-found", `review not found: ${reviewId}`, { reviewId });
    }
    if (state.status === "closed") {
      throw new ReviewLifecycleError("closed", `review is closed: ${reviewId}`, { reviewId });
    }
    return state;
  }
  findComment(state, commentId) {
    return findComment2(state, commentId);
  }
};

// packages/core/src/reviewer/fake.ts
function emptyReport(job) {
  return {
    schemaVersion: 1,
    summary: `Fake review of ${job.reviewId} round ${job.round}`,
    riskLevel: "low",
    findings: [],
    questions: [],
    tests: { ran: false, commands: [] },
    verification: []
  };
}
var FakeReviewer = class {
  kind = "fake";
  options;
  constructor(options = {}) {
    this.options = options;
  }
  async run(job, sink, signal) {
    if (signal.aborted) throw new Error("reviewer cancelled");
    const report = typeof this.options.report === "function" ? this.options.report(job) : this.options.report ?? emptyReport(job);
    const findings = this.options.findings ?? report.findings;
    for (const finding of findings) {
      if (signal.aborted) throw new Error("reviewer cancelled");
      await sink(finding);
    }
    return {
      ...structuredClone(report),
      findings: structuredClone(findings)
    };
  }
};

// packages/core/src/reviewer/command.ts
import { spawn as spawn2 } from "node:child_process";
import { mkdtemp, open as open3, rm as rm2, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join2 } from "node:path";

// packages/core/src/reviewer/types.ts
var ReviewerError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "ReviewerError";
    this.code = code;
  }
};

// packages/core/src/reviewer/command.ts
var DEFAULT_TIMEOUT_MS = 10 * 60 * 1e3;
var DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
var BASE_ENV_KEYS = ["PATH", "HOME", "LANG", "TMPDIR", "TMP", "TEMP"];
var WINDOWS_ENV_KEYS = [
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA"
];
function reviewerEnv(job, overrides) {
  const env = {};
  const keys = process.platform === "win32" ? [...BASE_ENV_KEYS, ...WINDOWS_ENV_KEYS] : BASE_ENV_KEYS;
  for (const key of keys) {
    const value = process.env[key];
    if (value !== void 0) env[key] = value;
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value === void 0) continue;
    if (key.startsWith("LC_") || key.startsWith("REVIEW_")) env[key] = value;
  }
  env.REVIEW_ID = job.reviewId;
  env.REVIEW_ROUND = String(job.round);
  env.REVIEW_JOB_ID = job.id;
  env.REVIEW_REPO = job.repoRoot;
  return Object.assign(env, overrides);
}
function killProcess(child) {
  if (child.pid !== void 0 && process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
    }
  }
  child.kill("SIGKILL");
}
function replacePlaceholders(value, values) {
  return value.replace(/\{(promptFile|repo|outputFile|reviewId)\}/g, (_match, key) => {
    return values[key] ?? "";
  });
}
function lastFencedJson(stdout) {
  const matches = [...stdout.matchAll(/```(?:json)?[ \t]*\r?\n([\s\S]*?)```/g)];
  const last = matches.at(-1)?.[1];
  if (last === void 0) return void 0;
  try {
    return JSON.parse(last);
  } catch {
    throw new ReviewerError("invalid-output", "last fenced block is not valid JSON");
  }
}
async function readOutputFile(outputFile, maxBytes) {
  let handle2;
  try {
    handle2 = await open3(outputFile, "r");
  } catch {
    return void 0;
  }
  try {
    const info = await handle2.stat();
    if (!info.isFile()) {
      throw new ReviewerError("invalid-output", "reviewer output file is not a regular file");
    }
    if (info.size > maxBytes) {
      throw new ReviewerError("invalid-output", `reviewer output file exceeded ${maxBytes} bytes`);
    }
    const raw = await handle2.readFile({ encoding: "utf8" });
    if (Buffer.byteLength(raw) > maxBytes) {
      throw new ReviewerError("invalid-output", `reviewer output file exceeded ${maxBytes} bytes`);
    }
    return raw;
  } finally {
    await handle2.close();
  }
}
async function parseOutput(outputFile, stdout, maxBytes) {
  const raw = await readOutputFile(outputFile, maxBytes);
  if (raw !== void 0 && raw.trim() !== "") {
    try {
      return JSON.parse(raw);
    } catch {
      throw new ReviewerError("invalid-output", "reviewer output file is not valid JSON");
    }
  }
  const fenced = lastFencedJson(stdout);
  if (fenced !== void 0) return fenced;
  const trimmed = stdout.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new ReviewerError("invalid-output", "reviewer stdout is not valid JSON");
    }
  }
  throw new ReviewerError("invalid-output", "reviewer produced no JSON output");
}
async function status(runner, repoRoot, signal) {
  try {
    const result = await runner(repoRoot, ["status", "--porcelain"], { signal });
    return result.code === 0 ? result.stdout : "";
  } catch {
    return "";
  }
}
var CommandReviewer = class {
  kind = "command";
  options;
  child;
  constructor(options) {
    this.options = options;
  }
  async run(job, sink, signal) {
    if (signal.aborted) throw new ReviewerError("cancelled", "reviewer was cancelled");
    const temp = await mkdtemp(join2(tmpdir(), "cr-reviewer-"));
    const promptFile = join2(temp, "prompt.md");
    const outputFile = join2(temp, "output.json");
    await writeFile(promptFile, job.prompt, "utf8");
    const runner = this.options.runGit ?? runGit;
    const before = await status(runner, job.repoRoot, signal);
    const values = {
      promptFile,
      repo: job.repoRoot,
      outputFile,
      reviewId: job.reviewId
    };
    const argv = this.options.command.map((part) => replacePlaceholders(part, values));
    if (argv.length === 0 || argv[0] === "") {
      await rm2(temp, { recursive: true, force: true });
      throw new ReviewerError("spawn-failed", "reviewer command is empty");
    }
    try {
      const stdout = await this.execute(argv, job, signal);
      const after = await status(runner, job.repoRoot, signal);
      const parsed = await parseOutput(
        outputFile,
        stdout,
        this.options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
      );
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new ReviewerError("invalid-output", "reviewer JSON must be an object");
      }
      const report = parsed;
      for (const finding of Array.isArray(report.findings) ? report.findings : []) {
        await sink(finding);
      }
      if (before !== after) return { ...report, dirtyWorktree: true };
      return report;
    } finally {
      await rm2(temp, { recursive: true, force: true });
    }
  }
  cancel() {
    if (this.child !== void 0) killProcess(this.child);
  }
  async execute(argv, job, signal) {
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutput = this.options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    return await new Promise((resolve5, reject2) => {
      const child = spawn2(argv[0], argv.slice(1), {
        cwd: job.repoRoot,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
        env: reviewerEnv(job, this.options.env)
      });
      this.child = child;
      const chunks = [];
      const stderr = [];
      let bytes = 0;
      let settled = false;
      let timedOut = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        this.child = void 0;
        if (error !== void 0) reject2(error);
        else resolve5(value ?? "");
      };
      const onAbort = () => {
        killProcess(child);
        finish(new ReviewerError("cancelled", "reviewer was cancelled"));
      };
      const timer = setTimeout(() => {
        timedOut = true;
        killProcess(child);
        finish(new ReviewerError("timeout", `reviewer timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      signal.addEventListener("abort", onAbort, { once: true });
      child.on("error", (error) => {
        finish(
          new ReviewerError(
            "spawn-failed",
            error.code === "ENOENT" ? `reviewer command not found: ${argv[0]}` : error.message
          )
        );
      });
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxOutput) {
          killProcess(child);
          finish(
            new ReviewerError("invalid-output", `reviewer stdout exceeded ${maxOutput} bytes`)
          );
          return;
        }
        chunks.push(chunk);
      });
      child.stderr.on("data", (chunk) => {
        if (stderr.reduce((sum, item) => sum + item.length, 0) < 1024 * 1024) stderr.push(chunk);
      });
      child.on("close", (code) => {
        if (settled) return;
        if (timedOut) {
          finish(new ReviewerError("timeout", `reviewer timed out after ${timeoutMs}ms`));
          return;
        }
        if (code !== 0) {
          finish(
            new ReviewerError(
              "nonzero-exit",
              `reviewer exited with ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`
            )
          );
          return;
        }
        finish(void 0, Buffer.concat(chunks).toString("utf8"));
      });
      child.stdin.on("error", () => void 0);
      child.stdin.end(job.prompt);
    });
  }
};

// packages/core/src/reviewer/validate.ts
var MAX_FINDINGS = 200;
var MAX_QUESTIONS = 50;
var MAX_TEXT_BYTES = 32 * 1024;
var CATEGORIES = /* @__PURE__ */ new Set([
  "security",
  "correctness",
  "tests",
  "performance",
  "maintainability",
  "api",
  "concurrency",
  "docs",
  "other"
]);
var CONFIDENCES = /* @__PURE__ */ new Set(["high", "medium", "low"]);
var KINDS = /* @__PURE__ */ new Set(["issue", "question", "praise"]);
var RISKS = /* @__PURE__ */ new Set(["low", "medium", "high", "critical"]);
var TEST_RESULTS = /* @__PURE__ */ new Set(["pass", "fail", "unknown"]);
var VERIFICATION_STATUSES = /* @__PURE__ */ new Set(["fixed", "not-fixed", "unclear"]);
var REPORT_FIELDS = /* @__PURE__ */ new Set([
  "schemaVersion",
  "summary",
  "riskLevel",
  "findings",
  "questions",
  "tests",
  "verification"
]);
var FINDING_FIELDS = /* @__PURE__ */ new Set([
  "id",
  "severity",
  "category",
  "confidence",
  "kind",
  "file",
  "lineStart",
  "lineEnd",
  "title",
  "rationale",
  "evidence",
  "suggestion"
]);
var QUESTION_FIELDS = /* @__PURE__ */ new Set(["id", "file", "line", "question", "why"]);
var SEVERITY_ALIASES = {
  blocker: "blocker",
  critical: "blocker",
  high: "blocker",
  major: "major",
  medium: "major",
  minor: "minor",
  low: "minor",
  nit: "nit",
  info: "nit"
};
function autoFindingId(value) {
  const basis = [value.file, value.lineStart, value.lineEnd, value.title, value.evidence].join(
    "\0"
  );
  let hash = 2166136261;
  for (let index = 0; index < basis.length; index += 1) {
    hash ^= basis.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `f_auto_${(hash >>> 0).toString(36)}`;
}
function autoQuestionId(value) {
  const basis = [value.file, value.line, value.question].join("\0");
  let hash = 2166136261;
  for (let index = 0; index < basis.length; index += 1) {
    hash ^= basis.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `q_auto_${(hash >>> 0).toString(36)}`;
}
var ReportValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ReportValidationError";
  }
};
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}
function isPositiveInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
function textWithin(ctx, value) {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= ctx.maxTextBytes;
}
function reject(ctx, kind, reason, id, index) {
  ctx.rejected.push({
    kind,
    ...id === void 0 ? {} : { id },
    ...index === void 0 ? {} : { index },
    reason
  });
}
function warnUnknown(ctx, value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) ctx.warnings.push(`unknown-${label}-field:${key}`);
  }
}
function fileLines(file) {
  return file?.newLines ?? file?.oldLines;
}
function findFile2(snapshot, path) {
  return snapshot?.files.find((file) => file.path === path);
}
function normalizeCode(value) {
  return value.split("\n").map((line) => line.trim().replace(/[ \t]+/g, " ")).join("\n");
}
function validateSuggestion(ctx, file, lineStart, lineEnd, value) {
  if (!isRecord3(value)) return { unanchored: true };
  const { original, replacement } = value;
  if (!textWithin(ctx, original) || !textWithin(ctx, replacement)) return { unanchored: true };
  const lines = fileLines(file);
  if (lines === void 0) return { unanchored: true };
  const current = lines.slice(lineStart - 1, lineEnd).join("\n");
  if (normalizeCode(current) !== normalizeCode(original)) return { unanchored: true };
  return { suggestion: { original, replacement } };
}
function validateFinding(ctx, value, index, ids) {
  if (!isRecord3(value)) {
    reject(ctx, "finding", "finding must be an object", void 0, index);
    return null;
  }
  warnUnknown(ctx, value, FINDING_FIELDS, "finding");
  const id = isNonEmpty(value.id) ? value.id : autoFindingId(value);
  const rejected = (reason) => {
    reject(ctx, "finding", reason, id, index);
    return null;
  };
  if (ids.has(id)) return rejected(`duplicate finding id: ${id}`);
  const severityKey = typeof value.severity === "string" ? value.severity.toLowerCase() : "";
  const severity = Object.prototype.hasOwnProperty.call(SEVERITY_ALIASES, severityKey) ? SEVERITY_ALIASES[severityKey] : void 0;
  if (severity === void 0) return rejected("severity must be blocker|major|minor|nit");
  let category = "other";
  if (value.category !== void 0) {
    if (!CATEGORIES.has(value.category)) {
      return rejected("category is not a known category");
    }
    category = value.category;
  }
  let confidence = "medium";
  if (value.confidence !== void 0) {
    if (!CONFIDENCES.has(value.confidence)) {
      return rejected("confidence must be high|medium|low");
    }
    confidence = value.confidence;
  }
  let kind = "issue";
  if (value.kind !== void 0) {
    if (!KINDS.has(value.kind))
      return rejected("kind must be issue|question|praise");
    kind = value.kind;
  }
  if (!isNonEmpty(value.file)) return rejected("file must be a non-empty string");
  const lineStart = value.lineStart;
  const lineEnd = value.lineEnd === void 0 ? lineStart : value.lineEnd;
  if (!isPositiveInt(lineStart) || !isPositiveInt(lineEnd)) {
    return rejected("lineStart and lineEnd must be positive integers");
  }
  if (lineEnd < lineStart) return rejected("lineEnd must not precede lineStart");
  const title = value.title;
  if (!textWithin(ctx, title)) {
    return rejected(`title must be a string no larger than ${ctx.maxTextBytes} bytes`);
  }
  let rationale = value.rationale;
  if (rationale === void 0) {
    rationale = textWithin(ctx, value.recommendation) ? value.recommendation : title;
  }
  if (!textWithin(ctx, rationale)) {
    return rejected(`rationale must be a string no larger than ${ctx.maxTextBytes} bytes`);
  }
  const evidence = value.evidence;
  if (!textWithin(ctx, evidence)) {
    return rejected(`evidence must be a string no larger than ${ctx.maxTextBytes} bytes`);
  }
  const file = findFile2(ctx.snapshot, value.file);
  if (ctx.snapshot !== void 0 && file === void 0) {
    return rejected(`file is not present in the snapshot: ${value.file}`);
  }
  const lines = fileLines(file);
  if (lines !== void 0 && lineEnd > lines.length) {
    return rejected(`line range ${lineStart}..${lineEnd} exceeds ${lines.length} lines`);
  }
  const finding = {
    id,
    severity,
    category,
    confidence,
    kind,
    file: value.file,
    lineStart,
    lineEnd,
    title,
    rationale,
    evidence
  };
  if (value.suggestion !== void 0 && file !== void 0) {
    const suggestion = validateSuggestion(ctx, file, lineStart, lineEnd, value.suggestion);
    if (suggestion.suggestion !== void 0) finding.suggestion = suggestion.suggestion;
    if (suggestion.unanchored === true) finding.unanchored = true;
  } else if (value.suggestion !== void 0) {
    finding.unanchored = true;
  }
  ids.add(id);
  return finding;
}
function validateFindingItem(value, options = {}) {
  const ctx = {
    rejected: [],
    warnings: [],
    maxTextBytes: options.maxTextBytes ?? MAX_TEXT_BYTES,
    ...options.snapshot === void 0 ? {} : { snapshot: options.snapshot }
  };
  const finding = validateFinding(ctx, value, 0, /* @__PURE__ */ new Set());
  return { finding, rejected: ctx.rejected, warnings: ctx.warnings };
}
function validateQuestion(ctx, value, index, ids) {
  if (!isRecord3(value)) {
    reject(ctx, "question", "question must be an object", void 0, index);
    return null;
  }
  warnUnknown(ctx, value, QUESTION_FIELDS, "question");
  const id = isNonEmpty(value.id) ? value.id : autoQuestionId(value);
  const rejected = (reason) => {
    reject(ctx, "question", reason, id, index);
    return null;
  };
  if (ids.has(id)) return rejected(`duplicate question id: ${id}`);
  if (!isNonEmpty(value.file)) return rejected("file must be a non-empty string");
  if (!isPositiveInt(value.line)) return rejected("line must be a positive integer");
  if (!textWithin(ctx, value.question) || !textWithin(ctx, value.why)) {
    return rejected(`question text must be no larger than ${ctx.maxTextBytes} bytes`);
  }
  const file = findFile2(ctx.snapshot, value.file);
  if (ctx.snapshot !== void 0 && file === void 0) {
    return rejected(`file is not present in the snapshot: ${value.file}`);
  }
  const lines = fileLines(file);
  if (lines !== void 0 && value.line > lines.length) {
    return rejected(`line ${value.line} exceeds ${lines.length} lines`);
  }
  ids.add(id);
  return {
    id,
    file: value.file,
    line: value.line,
    question: value.question,
    why: value.why
  };
}
function validateTests(ctx, value) {
  if (value === void 0) return { ran: false, commands: [] };
  if (!isRecord3(value)) {
    reject(ctx, "test", "tests must be an object");
    return { ran: false, commands: [] };
  }
  const ran = value.ran === true;
  const commands = [];
  if (Array.isArray(value.commands)) {
    value.commands.forEach((entry, index) => {
      if (!isRecord3(entry)) {
        reject(ctx, "test", "test command must be an object", void 0, index);
        return;
      }
      if (typeof entry.command !== "string" || typeof entry.summary !== "string" || typeof entry.result !== "string" || !TEST_RESULTS.has(entry.result)) {
        reject(ctx, "test", "invalid test command", void 0, index);
        return;
      }
      if (Buffer.byteLength(entry.command, "utf8") > ctx.maxTextBytes || Buffer.byteLength(entry.summary, "utf8") > ctx.maxTextBytes) {
        reject(ctx, "test", "test command text exceeds the text limit", void 0, index);
        return;
      }
      commands.push({
        command: entry.command,
        result: entry.result,
        summary: entry.summary
      });
    });
  }
  return { ran, commands };
}
function validateVerification(ctx, value, index) {
  if (!isRecord3(value)) {
    reject(ctx, "verification", "verification must be an object", void 0, index);
    return null;
  }
  if (!isNonEmpty(value.commentId) || typeof value.status !== "string" || !VERIFICATION_STATUSES.has(value.status) || !textWithin(ctx, value.evidence)) {
    reject(ctx, "verification", "invalid verification entry", void 0, index);
    return null;
  }
  return {
    commentId: value.commentId,
    status: value.status,
    evidence: value.evidence
  };
}
function validateReport(raw, options = {}) {
  if (!isRecord3(raw)) throw new ReportValidationError("reviewer report must be an object");
  if (raw.schemaVersion !== 1) {
    throw new ReportValidationError("reviewer report schemaVersion must be 1");
  }
  const ctx = {
    rejected: [],
    warnings: [],
    maxTextBytes: options.maxTextBytes ?? MAX_TEXT_BYTES,
    ...options.snapshot === void 0 ? {} : { snapshot: options.snapshot }
  };
  warnUnknown(ctx, raw, REPORT_FIELDS, "report");
  const riskLevel = typeof raw.riskLevel === "string" && RISKS.has(raw.riskLevel) ? raw.riskLevel : "medium";
  if (typeof raw.riskLevel !== "string" || !RISKS.has(raw.riskLevel)) {
    ctx.warnings.push("invalid-risk-level");
  }
  let summary2 = typeof raw.summary === "string" ? raw.summary : "";
  if (typeof raw.summary !== "string") ctx.warnings.push("invalid-summary");
  if (Buffer.byteLength(summary2, "utf8") > ctx.maxTextBytes) {
    summary2 = Buffer.from(summary2, "utf8").subarray(0, ctx.maxTextBytes).toString("utf8");
    ctx.warnings.push("summary-truncated");
  }
  const findings = [];
  const findingIds = /* @__PURE__ */ new Set();
  if (Array.isArray(raw.findings)) {
    const max = options.maxFindings ?? MAX_FINDINGS;
    raw.findings.forEach((entry, index) => {
      if (index >= max) {
        reject(ctx, "finding", `more than ${max} findings`, void 0, index);
        return;
      }
      const finding = validateFinding(ctx, entry, index, findingIds);
      if (finding !== null) findings.push(finding);
    });
  } else if (raw.findings !== void 0) {
    reject(ctx, "report", "findings must be an array");
  }
  const questions = [];
  const questionIds = /* @__PURE__ */ new Set();
  if (Array.isArray(raw.questions)) {
    const max = options.maxQuestions ?? MAX_QUESTIONS;
    raw.questions.forEach((entry, index) => {
      if (index >= max) {
        reject(ctx, "question", `more than ${max} questions`, void 0, index);
        return;
      }
      const question = validateQuestion(ctx, entry, index, questionIds);
      if (question !== null) questions.push(question);
    });
  } else if (raw.questions !== void 0) {
    reject(ctx, "report", "questions must be an array");
  }
  const verification = [];
  if (Array.isArray(raw.verification)) {
    raw.verification.forEach((entry, index) => {
      const item = validateVerification(ctx, entry, index);
      if (item !== null) verification.push(item);
    });
  } else if (raw.verification !== void 0) {
    reject(ctx, "report", "verification must be an array");
  }
  return {
    report: {
      schemaVersion: 1,
      summary: summary2,
      riskLevel,
      findings,
      questions,
      tests: validateTests(ctx, raw.tests),
      verification
    },
    rejected: ctx.rejected,
    warnings: ctx.warnings
  };
}

// packages/core/src/service/types.ts
var ReviewError = class extends Error {
  code;
  details;
  constructor(code, message, details) {
    super(message);
    this.name = "ReviewError";
    this.code = code;
    if (details !== void 0) this.details = details;
  }
};

// packages/core/src/service/feedback.ts
var FEEDBACK_BYTE_LIMIT = 100 * 1024;
function latestAnchor(comment) {
  const anchor = comment.anchors.at(-1);
  if (anchor === void 0) return null;
  return { path: anchor.path, lineStart: anchor.lineStart, lineEnd: anchor.lineEnd };
}
function isApplied(comment) {
  return comment.outcomes.some((outcome) => outcome.status === "applied");
}
function suggestionOf(comment) {
  const anchor = latestAnchor(comment);
  if (anchor === null || comment.suggestion === void 0) return null;
  return {
    commentId: comment.id,
    path: anchor.path,
    lineStart: anchor.lineStart,
    lineEnd: anchor.lineEnd,
    original: comment.suggestion.original,
    replacement: comment.suggestion.replacement
  };
}
function humanComment(comment, anchor) {
  const item = {
    commentId: comment.id,
    path: anchor.path,
    lineStart: anchor.lineStart,
    lineEnd: anchor.lineEnd,
    body: comment.body
  };
  if (comment.suggestion !== void 0) item.suggestion = comment.suggestion;
  return item;
}
function latestDecision(review, findingId, round) {
  const decisions = review.findingDecisions ?? [];
  for (let index = decisions.length - 1; index >= 0; index -= 1) {
    const decision = decisions[index];
    if (decision?.findingId === findingId && decision.round === round) return decision;
  }
  return void 0;
}
function findingItem(finding, decision) {
  return {
    id: finding.id,
    severity: finding.severity,
    file: finding.file,
    lineStart: finding.lineStart,
    lineEnd: finding.lineEnd,
    title: finding.title,
    rationale: finding.rationale,
    evidence: finding.evidence,
    ...decision === void 0 ? {} : { decision: decision.state },
    ...decision?.note === void 0 ? {} : { note: decision.note }
  };
}
function findingLabel(finding, decision) {
  if (decision?.state === "accepted") {
    return `[accepted][${finding.severity}]`;
  }
  return `[${finding.severity}]`;
}
function findingLines(finding, decision) {
  return [
    `- ${findingLabel(finding, decision)}[${finding.file}:${finding.lineStart}] ${finding.title}`,
    `  ${finding.rationale}`,
    `  > ${finding.evidence.replace(/\n/g, "\n  > ")}`,
    ...decision?.note === void 0 ? [] : [`  \u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430: ${decision.note}`]
  ];
}
function actionableFinding(finding, decision) {
  if (finding.kind === "praise") return false;
  if (decision?.state === "dismissed") return false;
  if (decision?.state === "accepted") return true;
  return finding.severity === "blocker" || finding.severity === "major";
}
function verdictLabel(verdict) {
  if (verdict === "approve") return "approved";
  if (verdict === "request-changes") return "changes requested";
  return "comment";
}
function section(lines, title, body) {
  if (body.length === 0) return;
  lines.push(`### ${title}`, ...body, "");
}
function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
function capFeedbackJson(input) {
  if (jsonBytes(input) <= FEEDBACK_BYTE_LIMIT) return input;
  const json2 = structuredClone(input);
  json2.truncated = true;
  json2.notice = `feedback json truncated at ${FEEDBACK_BYTE_LIMIT} bytes`;
  for (const comment of json2.humanComments) {
    if (jsonBytes(json2) <= FEEDBACK_BYTE_LIMIT) break;
    if (comment.body.length > 16 * 1024) {
      const excess = jsonBytes(json2) - FEEDBACK_BYTE_LIMIT;
      comment.body = truncateUtf8(
        comment.body,
        Math.max(0, Buffer.byteLength(comment.body, "utf8") - excess - 1024)
      );
    }
  }
  const arrays = [
    "findings",
    "dismissedFindings",
    "questions",
    "acceptedSuggestions",
    "appliedSuggestions",
    "verification",
    "humanComments"
  ];
  for (const key of arrays) {
    while (jsonBytes(json2) > FEEDBACK_BYTE_LIMIT && json2[key].length > 0) json2[key].pop();
  }
  if (jsonBytes(json2) > FEEDBACK_BYTE_LIMIT) json2.summary = truncateUtf8(json2.summary ?? "", 1024);
  if (jsonBytes(json2) > FEEDBACK_BYTE_LIMIT) json2.notice = "feedback json truncated";
  if (jsonBytes(json2) > FEEDBACK_BYTE_LIMIT) {
    json2.title = truncateUtf8(json2.title, 1024);
    json2.scope = { ...json2.scope, label: truncateUtf8(json2.scope.label, 1024) };
  }
  if (jsonBytes(json2) > FEEDBACK_BYTE_LIMIT) {
    json2.findings = [];
    json2.dismissedFindings = [];
    json2.questions = [];
    json2.acceptedSuggestions = [];
    json2.appliedSuggestions = [];
    json2.verification = [];
    json2.humanComments = [];
  }
  return json2;
}
function truncateUtf8(value, maxBytes) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && (bytes[end] ?? 0) >= 128 && (bytes[end] ?? 0) < 192) end -= 1;
  return bytes.subarray(0, end).toString("utf8");
}
function buildFeedback(input) {
  const { review, snapshot, report, round, verdict, deliveryKey } = input;
  const activeComments = review.comments.filter((comment) => comment.deletedAt === void 0);
  const openComments = activeComments.filter(
    (comment) => comment.author.kind === "human" && comment.state === "open"
  );
  const resolved = activeComments.filter((comment) => comment.state === "resolved");
  const reportFindings = report?.findings ?? [];
  const decisions = /* @__PURE__ */ new Map();
  for (const finding of reportFindings) {
    const decision = latestDecision(review, finding.id, round);
    if (decision !== void 0) decisions.set(finding.id, decision);
  }
  const findings = reportFindings.filter(
    (finding) => actionableFinding(finding, decisions.get(finding.id))
  );
  const dismissed = reportFindings.filter(
    (finding) => decisions.get(finding.id)?.state === "dismissed"
  );
  const humanComments = [];
  const accepted = [];
  const applied = [];
  for (const comment of openComments) {
    const anchor = latestAnchor(comment);
    if (anchor === null) continue;
    humanComments.push(humanComment(comment, anchor));
    const suggestion = suggestionOf(comment);
    if (suggestion !== null) {
      if (isApplied(comment)) applied.push(suggestion);
      else accepted.push(suggestion);
    }
  }
  for (const comment of activeComments) {
    if (comment.author.kind === "human" && isApplied(comment)) {
      const suggestion = suggestionOf(comment);
      if (suggestion !== null && !applied.some((item) => item.commentId === suggestion.commentId)) {
        applied.push(suggestion);
      }
    }
  }
  const json2 = {
    schemaVersion: 1,
    reviewId: review.id,
    round,
    verdict,
    title: review.title,
    scope: {
      baseSha: snapshot.scope.baseSha,
      headSha: snapshot.scope.headSha,
      label: snapshot.scope.label
    },
    deliveryKey,
    findings: findings.map((finding) => findingItem(finding, decisions.get(finding.id))),
    dismissedFindings: dismissed.map((finding) => findingItem(finding, decisions.get(finding.id))),
    humanComments,
    appliedSuggestions: applied,
    acceptedSuggestions: accepted,
    questions: report?.questions ?? [],
    verification: report?.verification ?? [],
    resolved: {
      count: resolved.length,
      commentIds: resolved.map((comment) => comment.id)
    }
  };
  if (input.summary !== void 0) json2.summary = input.summary;
  const lines = [
    `## \u0420\u0435\u0432\u044C\u044E \xAB${review.title}\xBB \u2014 ${verdictLabel(verdict)} (round ${round})`,
    `Review: /review/${review.id}?round=${round}`,
    `Scope: ${snapshot.scope.label} (${snapshot.scope.baseSha}..${snapshot.scope.headSha ?? "worktree"})`,
    ""
  ];
  if (json2.summary !== void 0) lines.push(json2.summary, "");
  section(
    lines,
    "\u0417\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u0430\u0433\u0435\u043D\u0442\u0430 (\u043A \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044E)",
    findings.flatMap((finding) => findingLines(finding, decisions.get(finding.id)))
  );
  section(
    lines,
    "\u041E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u043E\u043C (\u043D\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0442\u044C)",
    dismissed.flatMap((finding) => {
      const decision = decisions.get(finding.id);
      if (decision?.note === void 0) return [];
      return [`- [${finding.file}:${finding.lineStart}] ${finding.title} \u2014 ${decision.note}`];
    })
  );
  section(
    lines,
    "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 (open)",
    humanComments.map((comment) => `- [${comment.path}:${comment.lineStart}] ${comment.body}`)
  );
  section(lines, "\u041F\u0440\u0438\u043D\u044F\u0442\u044B\u0435 suggested \u043F\u0440\u0430\u0432\u043A\u0438", [
    ...applied.map(
      (suggestion) => `- [${suggestion.path}:${suggestion.lineStart}] \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u043E\u043C (\u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0442\u044C \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E)`
    ),
    ...accepted.flatMap((suggestion) => [
      `- [${suggestion.path}:${suggestion.lineStart}] \u043F\u0440\u0438\u043D\u044F\u0442\u043E, \u043D\u043E \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u043E (\u043F\u0430\u0442\u0447 \u043D\u0438\u0436\u0435)`,
      "```diff",
      ...suggestion.original.split("\n").map((line) => `- ${line}`),
      ...suggestion.replacement.split("\n").map((line) => `+ ${line}`),
      "```"
    ])
  ]);
  section(
    lines,
    "\u0412\u043E\u043F\u0440\u043E\u0441\u044B \u043A \u0442\u0435\u0431\u0435",
    (report?.questions ?? []).map(
      (question) => `- [${question.id}] ${question.question} \u2014 ${question.why}`
    )
  );
  if (resolved.length > 0 || input.includeResolved === true) {
    section(
      lines,
      "\u0423\u0436\u0435 \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E \u0432 \u044D\u0442\u043E\u043C \u0440\u0430\u0443\u043D\u0434\u0435",
      resolved.map((comment) => `- [${comment.id}] resolved`)
    );
  }
  lines.push(
    "### \u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F",
    "\u041F\u0440\u0430\u0432\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0435\u0440\u0435\u0447\u0438\u0441\u043B\u0435\u043D\u043D\u043E\u0435, \u043D\u0435 \u043F\u0435\u0440\u0435\u043F\u0438\u0441\u044B\u0432\u0430\u0439 \u043D\u0435\u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0439 \u043A\u043E\u0434, \u043F\u0440\u043E\u0433\u043E\u043D\u0438 \u0442\u0435\u0441\u0442\u044B,",
    "\u0437\u0430\u0442\u0435\u043C \u0432\u044B\u0437\u043E\u0432\u0438 review_refresh(reviewId) \u0438 review_fix_status(...) \u0441 evidence.",
    "\u0415\u0441\u043B\u0438 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0435 \u2014 \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0439 \u043F\u0440\u0430\u0432\u043A\u0438 \u0434\u0432\u0430\u0436\u0434\u044B."
  );
  let markdown = lines.join("\n");
  if (Buffer.byteLength(markdown, "utf8") > FEEDBACK_BYTE_LIMIT) {
    const notice = `

\u2026 (feedback truncated at ${FEEDBACK_BYTE_LIMIT} bytes; see [review](/review/${review.id}?round=${round}))`;
    const room = FEEDBACK_BYTE_LIMIT - Buffer.byteLength(notice, "utf8");
    markdown = `${truncateUtf8(markdown, room)}${notice}`;
  }
  return { markdown, json: capFeedbackJson(json2), deliveryKey };
}

// packages/core/src/service/service.ts
var IDEMPOTENCY_LIMIT = 1e3;
var VERDICTS = /* @__PURE__ */ new Set(["approve", "request-changes", "comment"]);
var COMMENT_STATES = /* @__PURE__ */ new Set(["open", "resolved", "dismissed"]);
function clone(value) {
  return structuredClone(value);
}
function agentIsActive(review) {
  return review.agent?.status === "queued" || review.agent?.status === "running";
}
function scopeFromSnapshot(snapshot) {
  const scope = snapshot.scope;
  if (scope.kind === "worktree") return { kind: "worktree", baseRef: scope.baseRef ?? "HEAD" };
  if (scope.kind === "commit") {
    return { kind: "commit", sha: scope.headSha ?? scope.baseSha };
  }
  if (scope.kind === "commits") {
    return { kind: "commits", shas: scope.shas ?? [] };
  }
  return {
    kind: "range",
    baseRef: scope.baseSha,
    headRef: scope.headRef ?? scope.headSha ?? "HEAD"
  };
}
function scopeKey(scope) {
  if (scope.kind === "range") {
    return `range:${scope.baseRef}\0${scope.headRef}\0${scope.twoDot === true}`;
  }
  if (scope.kind === "worktree") return `worktree:${scope.baseRef}`;
  if (scope.kind === "commit") return `commit:${scope.sha}`;
  return `commits:${scope.shas.join("\0")}`;
}
function assertContext(ctx) {
  if (ctx === void 0 || ctx.actor === void 0) {
    throw new ReviewError("validation", "CallContext with an actor is required");
  }
}
function validateInitiator(value) {
  if (value === void 0) return;
  if (typeof value !== "object" || value === null) {
    throw new ReviewError("validation", "initiator must be an object");
  }
  if (typeof value.harness !== "string" || value.harness.trim() === "") {
    throw new ReviewError("validation", "initiator.harness must be a non-empty string");
  }
  if (typeof value.sessionId !== "string" || value.sessionId.trim() === "") {
    throw new ReviewError("validation", "initiator.sessionId must be a non-empty string");
  }
  for (const field of ["cwd", "agentPreset"]) {
    const fieldValue = value[field];
    if (fieldValue !== void 0 && (typeof fieldValue !== "string" || fieldValue.trim() === "")) {
      throw new ReviewError("validation", `initiator.${field} must be a non-empty string`);
    }
  }
}
function validateReviewer(config) {
  if (!["fake", "command", "none", "worker"].includes(config.backend)) {
    throw new ReviewError("validation", `unknown reviewer backend: ${config.backend}`);
  }
  if (config.backend === "command") {
    if (!Array.isArray(config.command) || config.command.length === 0) {
      throw new ReviewError("validation", "command reviewer requires a non-empty argv array");
    }
    if (config.command.some((part) => typeof part !== "string" || part === "")) {
      throw new ReviewError(
        "validation",
        "command reviewer argv entries must be non-empty strings"
      );
    }
  }
}
function mapLifecycleCode(code) {
  switch (code) {
    case "not-found":
    case "comment-not-found":
    case "finding-not-found":
      return "not-found";
    case "closed":
    case "duplicate-round":
    case "round-order":
      return "conflict";
    case "no-rounds":
    case "snapshot-mismatch":
    case "invalid-input":
      return "validation";
  }
}
var ReviewServiceImpl = class {
  lifecycle;
  store;
  snapshots;
  now;
  newId;
  backendFactory;
  runGit;
  idempotencyLimit;
  results = /* @__PURE__ */ new Map();
  inflight = /* @__PURE__ */ new Map();
  running = /* @__PURE__ */ new Set();
  active = /* @__PURE__ */ new Map();
  constructor(deps) {
    this.lifecycle = deps.lifecycle;
    this.store = deps.store;
    this.snapshots = deps.snapshots;
    this.now = deps.now ?? (() => /* @__PURE__ */ new Date());
    this.newId = deps.newId ?? ((prefix) => createId(prefix, this.now));
    this.backendFactory = deps.backendFactory;
    this.runGit = deps.runGit;
    this.idempotencyLimit = deps.idempotencyLimit ?? IDEMPOTENCY_LIMIT;
  }
  async create(input, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (typeof input.title !== "string" || input.title.trim() === "") {
          throw new ReviewError("validation", "title must be non-empty");
        }
        if (typeof input.repoRoot !== "string" || input.repoRoot.trim() === "") {
          throw new ReviewError("validation", "repoRoot must be non-empty");
        }
        if (typeof input.scope !== "object" || input.scope === null) {
          throw new ReviewError("validation", "scope is required");
        }
        const reviewer = input.reviewer ?? { backend: "none" };
        validateReviewer(reviewer);
        validateInitiator(input.initiator);
        let snapshot;
        try {
          snapshot = await this.snapshots.build({ repoRoot: input.repoRoot, scope: input.scope });
        } catch (error) {
          throw this.translate(error);
        }
        let state;
        try {
          state = await this.lifecycle.create({
            title: input.title,
            repoRoot: input.repoRoot,
            actor: ctx.actor,
            reviewer,
            ...input.initiator === void 0 ? {} : { initiator: input.initiator }
          });
          await this.lifecycle.addRound(state.id, snapshot, ctx.actor);
        } catch (error) {
          throw this.translate(error);
        }
        return await this.get(state.id);
      },
      "reviews.create",
      ctx.requestId
    );
  }
  async updateReview(id, input, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (input.title === void 0 && input.reviewer === void 0 && input.scope === void 0) {
          throw new ReviewError("validation", "review update is empty");
        }
        if (input.title !== void 0 && typeof input.title !== "string") {
          throw new ReviewError("validation", "title must be a string");
        }
        if (input.title !== void 0 && input.title.trim() === "") {
          throw new ReviewError("validation", "title must be non-empty");
        }
        if (input.reviewer !== void 0) validateReviewer(input.reviewer);
        const review = await this.requireReview(id);
        if (review.status === "closed") {
          throw new ReviewError("conflict", `review is closed: ${id}`, { id });
        }
        let snapshot;
        if (input.scope !== void 0) {
          if (this.running.has(id) || agentIsActive(review)) {
            throw new ReviewError("agent-busy", `a reviewer is active for ${id}`, { id });
          }
          const latest = await this.latestSnapshotOrThrow(review);
          if (scopeKey(input.scope) !== scopeKey(scopeFromSnapshot(latest))) {
            try {
              snapshot = await this.snapshots.build({
                repoRoot: review.repoRoot,
                scope: input.scope
              });
            } catch (error) {
              throw this.translate(error);
            }
          }
        }
        if (input.title !== void 0 || input.reviewer !== void 0) {
          try {
            await this.lifecycle.updateReview(
              id,
              {
                ...input.title === void 0 ? {} : { title: input.title },
                ...input.reviewer === void 0 ? {} : { reviewer: input.reviewer }
              },
              ctx.actor
            );
          } catch (error) {
            throw this.translate(error);
          }
        }
        if (snapshot !== void 0) {
          try {
            await this.lifecycle.refresh(id, snapshot, ctx.actor);
          } catch (error) {
            throw this.translate(error);
          }
        }
        return await this.get(id);
      },
      `review.update:${id}`,
      ctx.requestId
    );
  }
  async deleteReview(id, ctx, reason) {
    assertContext(ctx);
    await this.idempotent(
      async () => {
        let review;
        try {
          review = await this.lifecycle.get(id);
        } catch (error) {
          throw this.translate(error);
        }
        if (review.deletedAt !== void 0) return;
        const active = this.active.get(id);
        active?.controller.abort();
        active?.backend?.cancel?.();
        try {
          await this.lifecycle.deleteReview(id, ctx.actor, reason);
        } catch (error) {
          throw this.translate(error);
        }
      },
      `review.delete:${id}`,
      ctx.requestId
    );
  }
  async get(id) {
    let review;
    try {
      review = await this.lifecycle.get(id);
    } catch (error) {
      throw this.translate(error);
    }
    if (review.deletedAt !== void 0) {
      throw new ReviewError("not-found", `review not found: ${id}`, { id });
    }
    const latestSnapshot = await this.readLatestSnapshot(review);
    return {
      review,
      latestSnapshot,
      report: review.report ?? null
    };
  }
  async list(filter = {}) {
    const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 50), 1), 100);
    const offset = Math.max(Math.trunc(filter.offset ?? 0), 0);
    let items;
    try {
      items = await this.lifecycle.list();
    } catch (error) {
      throw this.translate(error);
    }
    if (filter.status !== void 0) {
      items = items.filter((item) => item.status === filter.status);
    }
    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset
    };
  }
  async snapshot(id, round, file) {
    const review = await this.requireReview(id);
    const target = review.rounds.find((item) => item.no === round);
    if (target === void 0) {
      throw new ReviewError("not-found", `round ${round} not found for ${id}`, { id, round });
    }
    let snapshot;
    try {
      snapshot = await this.store.readSnapshot(target.snapshotId);
    } catch (error) {
      throw this.translate(error);
    }
    if (file !== void 0) {
      const selected = snapshot.files.find((item) => item.path === file);
      if (selected === void 0) {
        throw new ReviewError("not-found", `file not found in round ${round}: ${file}`, {
          id,
          round,
          file
        });
      }
      snapshot = {
        ...snapshot,
        files: [clone(selected)],
        totals: { ...snapshot.totals, files: 1 }
      };
    }
    return { snapshot, round, ...file === void 0 ? {} : { file } };
  }
  async addComment(id, input, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (typeof input.body !== "string" || input.body.trim() === "") {
          throw new ReviewError("validation", "comment body must be non-empty");
        }
        try {
          const comment = await this.lifecycle.addComment(id, input, ctx.actor);
          return { comment };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `comment.add:${id}`,
      ctx.requestId
    );
  }
  async editComment(id, commentId, input, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (typeof input.body !== "string" || input.body.trim() === "") {
          throw new ReviewError("validation", "comment body must be non-empty");
        }
        try {
          const comment = await this.lifecycle.editComment(id, commentId, input.body, ctx.actor);
          return { comment };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `comment.edit:${id}:${commentId}`,
      ctx.requestId
    );
  }
  async deleteComment(id, commentId, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        try {
          const comment = await this.lifecycle.deleteComment(id, commentId, ctx.actor);
          return { comment };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `comment.delete:${id}:${commentId}`,
      ctx.requestId
    );
  }
  async reply(id, commentId, input, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (typeof input.body !== "string" || input.body.trim() === "") {
          throw new ReviewError("validation", "reply body must be non-empty");
        }
        try {
          const comment = await this.lifecycle.reply(id, commentId, input.body, ctx.actor);
          return { comment };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `comment.reply:${id}:${commentId}`,
      ctx.requestId
    );
  }
  async setCommentState(id, commentId, state, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (!COMMENT_STATES.has(state)) {
          throw new ReviewError("validation", `unknown comment state: ${String(state)}`);
        }
        try {
          const comment = await this.lifecycle.setCommentState(id, commentId, state, ctx.actor);
          return { comment };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `comment.state:${id}:${commentId}`,
      ctx.requestId
    );
  }
  async decideFinding(id, findingId, input, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        try {
          const decision = await this.lifecycle.decideFinding(id, findingId, input, ctx.actor);
          return { decision };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `finding.decision:${id}:${findingId}`,
      ctx.requestId
    );
  }
  async events(id, after = 0) {
    if (!Number.isInteger(after) || after < 0) {
      throw new ReviewError("validation", "after must be a non-negative integer");
    }
    try {
      return await this.store.events(id, after);
    } catch (error) {
      throw this.translate(error);
    }
  }
  async suggestionAction(id, commentId, action, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (!["accept", "decline", "apply"].includes(action)) {
          throw new ReviewError("validation", `unknown suggestion action: ${String(action)}`);
        }
        const review = await this.requireReview(id);
        if (review.status === "closed") {
          throw new ReviewError("conflict", `review is closed: ${id}`, { id });
        }
        const comment = review.comments.find((candidate) => candidate.id === commentId);
        if (comment === void 0) {
          throw new ReviewError("not-found", `unknown comment: ${commentId}`, { id, commentId });
        }
        if (comment.suggestion === void 0) {
          throw new ReviewError("validation", `comment has no suggestion: ${commentId}`, {
            id,
            commentId
          });
        }
        if (action === "apply") {
          const round = review.rounds.at(-1);
          if (round === void 0)
            throw new ReviewError("validation", `review has no rounds: ${id}`);
          try {
            await this.store.append(
              id,
              createEvent({
                reviewId: id,
                type: "suggestion/applied",
                actor: ctx.actor,
                data: { commentId, round: round.no },
                now: this.now
              })
            );
          } catch (error) {
            throw this.translate(error);
          }
        } else {
          const state = action === "accept" ? "accepted" : "declined";
          try {
            await this.store.append(
              id,
              createEvent({
                reviewId: id,
                type: "suggestion/state",
                actor: ctx.actor,
                data: { commentId, state },
                now: this.now
              })
            );
          } catch (error) {
            throw this.translate(error);
          }
        }
        return await this.getComment(id, commentId);
      },
      `comment.suggestion:${id}:${commentId}`,
      ctx.requestId
    );
  }
  async refresh(id, input, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        const review = await this.requireReview(id);
        if (review.status === "closed") {
          throw new ReviewError("conflict", `review is closed: ${id}`, { id });
        }
        if (this.running.has(id) || agentIsActive(review)) {
          throw new ReviewError("agent-busy", `a reviewer is active for ${id}`, { id });
        }
        const latest = await this.latestSnapshotOrThrow(review);
        const scope = input.scope ?? scopeFromSnapshot(latest);
        let snapshot;
        try {
          snapshot = await this.snapshots.build({ repoRoot: review.repoRoot, scope });
        } catch (error) {
          throw this.translate(error);
        }
        try {
          await this.lifecycle.refresh(id, snapshot, ctx.actor);
        } catch (error) {
          throw this.translate(error);
        }
        return await this.get(id);
      },
      `review.refresh:${id}`,
      ctx.requestId
    );
  }
  async close(id, verdict, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (verdict !== "approved" && verdict !== "closed") {
          throw new ReviewError("validation", `unknown close verdict: ${String(verdict)}`);
        }
        try {
          await this.lifecycle.close(id, verdict, ctx.actor);
        } catch (error) {
          throw this.translate(error);
        }
        return await this.get(id);
      },
      `review.close:${id}`,
      ctx.requestId
    );
  }
  async claimFixStatus(id, input, ctx) {
    assertContext(ctx);
    await this.idempotent(
      async () => {
        if (!Array.isArray(input.items) || input.items.length === 0) {
          throw new ReviewError("validation", "items must be a non-empty array");
        }
        const review = await this.requireReview(id);
        if (review.status === "closed") {
          throw new ReviewError("conflict", `review is closed: ${id}`, { id });
        }
        const known = new Set(review.comments.map((comment) => comment.id));
        const claims = input.items.map((item) => {
          if (!["fixed", "not-fixed", "unclear"].includes(item.status)) {
            throw new ReviewError("validation", `unknown fix status: ${String(item.status)}`);
          }
          if (!known.has(item.commentId)) {
            throw new ReviewError("not-found", `unknown comment: ${item.commentId}`, {
              id,
              commentId: item.commentId
            });
          }
          if (item.evidence !== void 0 && typeof item.evidence !== "string") {
            throw new ReviewError("validation", "evidence must be a string");
          }
          return {
            commentId: item.commentId,
            status: item.status,
            ...item.evidence === void 0 ? {} : { evidence: item.evidence },
            by: ctx.actor,
            at: this.now().toISOString()
          };
        });
        await this.store.append(
          id,
          createEvent({
            reviewId: id,
            type: "fix/claim",
            actor: ctx.actor,
            data: { claims },
            now: this.now
          })
        );
      },
      `review.fix-status:${id}`,
      ctx.requestId
    );
  }
  async latestFeedback(id) {
    await this.requireReview(id);
    const events = await this.events(id, 0);
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event?.type !== "review/submitted") continue;
      return {
        submission: event.data.submission,
        feedback: event.data.feedback
      };
    }
    return null;
  }
  async gc(olderThanDays) {
    const result = await this.store.gc(olderThanDays, this.now());
    this.results.clear();
    return result;
  }
  async submit(id, input, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (!VERDICTS.has(input.verdict)) {
          throw new ReviewError("validation", `unknown verdict: ${String(input.verdict)}`);
        }
        if (input.summary !== void 0 && typeof input.summary !== "string") {
          throw new ReviewError("validation", "summary must be a string");
        }
        const review = await this.requireReview(id);
        if (review.status === "closed") {
          throw new ReviewError("conflict", `review is closed: ${id}`, { id });
        }
        const round = review.rounds.at(-1);
        if (round === void 0) {
          throw new ReviewError("validation", `review has no rounds: ${id}`, { id });
        }
        if ((review.submissions ?? []).some((submission2) => submission2.round === round.no)) {
          throw new ReviewError("conflict", `round ${round.no} was already submitted`, {
            id,
            round: round.no
          });
        }
        let snapshot;
        try {
          snapshot = await this.store.readSnapshot(round.snapshotId);
        } catch (error) {
          throw this.translate(error);
        }
        const report = review.report !== void 0 && review.report.round === round.no ? review.report : null;
        const submissionId = this.newId("sub");
        const deliveryKey = `${id}:${round.no}:${submissionId}`;
        const feedback = buildFeedback({
          review,
          snapshot,
          report,
          round: round.no,
          verdict: input.verdict,
          deliveryKey,
          ...input.summary === void 0 ? {} : { summary: input.summary },
          ...input.includeResolved === void 0 ? {} : { includeResolved: input.includeResolved }
        });
        const submission = {
          submissionId,
          round: round.no,
          verdict: input.verdict,
          deliveryKey,
          createdAt: this.now().toISOString()
        };
        try {
          await this.store.append(
            id,
            createEvent({
              reviewId: id,
              type: "review/submitted",
              actor: ctx.actor,
              data: {
                submission,
                feedback: {
                  markdown: feedback.markdown,
                  json: feedback.json,
                  deliveryKey
                }
              },
              now: this.now
            })
          );
        } catch (error) {
          throw this.translate(error);
        }
        return {
          reviewId: id,
          round: round.no,
          verdict: input.verdict,
          feedback,
          deliveryKey
        };
      },
      `review.submit:${id}`,
      ctx.requestId
    );
  }
  async runReviewer(id, ctx) {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (this.running.has(id)) {
          throw new ReviewError("agent-busy", `a reviewer is already running for ${id}`, { id });
        }
        this.running.add(id);
        try {
          return await this.runReviewerOnce(id, ctx);
        } finally {
          this.running.delete(id);
        }
      },
      `review.run:${id}`,
      ctx.requestId
    );
  }
  async cancelAgent(id, ctx) {
    assertContext(ctx);
    const active = this.active.get(id);
    if (active === void 0) {
      const review = await this.requireReview(id);
      if (agentIsActive(review)) {
        throw new ReviewError("conflict", `reviewer is not owned by this service instance`, {
          id
        });
      }
      return;
    }
    active.controller.abort();
    active.backend?.cancel?.();
  }
  async runReviewerOnce(id, ctx) {
    const review = await this.requireReview(id);
    if (review.status === "closed") {
      throw new ReviewError("stale-review", `review is closed: ${id}`, { id });
    }
    if (agentIsActive(review)) {
      throw new ReviewError("agent-busy", `a reviewer is already running for ${id}`, { id });
    }
    const round = review.rounds.at(-1);
    if (round === void 0) {
      throw new ReviewError("validation", `review has no rounds: ${id}`, { id });
    }
    let snapshot;
    try {
      snapshot = await this.store.readSnapshot(round.snapshotId);
    } catch (error) {
      throw this.translate(error);
    }
    const config = review.reviewer ?? { backend: "none" };
    const job = {
      id: this.newId("job"),
      reviewId: id,
      round: round.no,
      kind: review.report === void 0 ? "initial" : "verify",
      repoRoot: review.repoRoot,
      prompt: this.buildPrompt(review, round, snapshot),
      snapshot
    };
    const controller = new AbortController();
    this.active.set(id, { controller });
    try {
      await this.store.append(
        id,
        createEvent({
          reviewId: id,
          type: "agent/started",
          actor: ctx.actor,
          data: { jobId: job.id, round: round.no, backend: config.backend },
          now: this.now
        })
      );
      let raw;
      if (config.backend === "none") {
        raw = {
          schemaVersion: 1,
          summary: "Reviewer backend is none; review skipped.",
          riskLevel: "low",
          findings: [],
          questions: [],
          tests: { ran: false, commands: [] },
          verification: []
        };
      } else {
        let backend;
        try {
          backend = this.backendFor(config);
        } catch (error) {
          throw this.translate(error);
        }
        this.active.set(id, { controller, backend });
        if (controller.signal.aborted) {
          throw new ReviewError("conflict", `reviewer was cancelled for ${id}`, { id });
        }
        raw = await backend.run(
          job,
          async (finding) => {
            await this.store.append(
              id,
              createEvent({
                reviewId: id,
                type: "agent/finding",
                actor: ctx.actor,
                data: { finding, round: round.no },
                now: this.now
              })
            );
          },
          controller.signal
        );
      }
      if (controller.signal.aborted) {
        throw new ReviewError("conflict", `reviewer was cancelled for ${id}`, { id });
      }
      const validation = validateReport(raw, { snapshot });
      const warnings = [...validation.warnings];
      if (raw.dirtyWorktree === true) warnings.push("dirty-worktree");
      const report = {
        ...validation.report,
        reviewId: id,
        round: round.no,
        backend: config.backend,
        rejected: validation.rejected,
        warnings,
        ...raw.dirtyWorktree === true ? { dirtyWorktree: true } : {},
        ...config.backend === "none" ? { skipped: true } : {}
      };
      await this.store.append(
        id,
        createEvent({
          reviewId: id,
          type: "agent/report",
          actor: ctx.actor,
          data: { report },
          now: this.now
        })
      );
      return report;
    } catch (error) {
      const reviewError = error instanceof ReviewError ? error : controller.signal.aborted ? new ReviewError("conflict", `reviewer was cancelled for ${id}`, { id }) : new ReviewError("internal", error.message, { id });
      try {
        await this.store.append(
          id,
          createEvent({
            reviewId: id,
            type: "agent/failed",
            actor: ctx.actor,
            data: { code: reviewError.code, message: reviewError.message },
            now: this.now
          })
        );
      } catch {
      }
      throw reviewError;
    } finally {
      this.active.delete(id);
    }
  }
  backendFor(config) {
    if (this.backendFactory !== void 0) return this.backendFactory(config);
    if (config.backend === "fake") return new FakeReviewer();
    if (config.backend === "command") {
      return new CommandReviewer({
        command: config.command ?? [],
        ...this.runGit === void 0 ? {} : { runGit: this.runGit },
        ...config.timeoutMs === void 0 ? {} : { timeoutMs: config.timeoutMs }
      });
    }
    throw new ReviewError("validation", `reviewer backend cannot run: ${config.backend}`);
  }
  buildPrompt(review, round, snapshot) {
    const files = snapshot.files.map((file) => `- ${file.status} ${file.path} (+${file.added}/-${file.deleted})`).join("\n");
    return [
      `# Independent code review: ${review.title}`,
      "",
      `Review: ${review.id}`,
      `Round: ${round.no}`,
      `Repository: ${review.repoRoot}`,
      `Scope: ${snapshot.scope.label} (${snapshot.scope.baseSha}..${snapshot.scope.headSha ?? "worktree"})`,
      "",
      "You are a read-only reviewer. Do not modify files.",
      "Review the changes and surrounding code, run tests if useful, and report only actionable",
      "findings with file/line anchors and evidence. Return strict JSON (schemaVersion 1), or",
      "write it to output.json / a fenced json block.",
      "",
      "## Files",
      files,
      "",
      "## Instructions",
      "- Blockers and major issues first; no style nitpicks without impact.",
      "- Every finding needs file, lineStart/lineEnd, title, rationale and evidence.",
      "- Put product/intent questions in questions[], not findings[].",
      "- Verification entries use the supplied comment ids when this is a verify round."
    ].join("\n");
  }
  async readLatestSnapshot(review) {
    const round = review.rounds.at(-1);
    if (round === void 0) return null;
    try {
      return await this.store.readSnapshot(round.snapshotId);
    } catch (error) {
      throw this.translate(error);
    }
  }
  async getComment(id, commentId) {
    const review = await this.requireReview(id);
    const comment = review.comments.find((candidate) => candidate.id === commentId);
    if (comment === void 0) {
      throw new ReviewError("not-found", `unknown comment: ${commentId}`, { id, commentId });
    }
    return { comment };
  }
  async latestSnapshotOrThrow(review) {
    const round = review.rounds.at(-1);
    if (round === void 0) {
      throw new ReviewError("validation", `review has no rounds: ${review.id}`, { id: review.id });
    }
    try {
      return await this.store.readSnapshot(round.snapshotId);
    } catch (error) {
      throw this.translate(error);
    }
  }
  async requireReview(id) {
    try {
      const review = await this.lifecycle.get(id);
      if (review.deletedAt !== void 0) {
        throw new ReviewError("not-found", `review not found: ${id}`, { id });
      }
      return review;
    } catch (error) {
      throw this.translate(error);
    }
  }
  async idempotent(operation, scope, requestId2) {
    if (requestId2 === void 0 || requestId2 === "") return await operation();
    const key = `${scope}\0${requestId2}`;
    if (this.results.has(key)) return clone(this.results.get(key));
    const pending = this.inflight.get(key);
    if (pending !== void 0) return clone(await pending);
    const run = operation();
    this.inflight.set(key, run);
    try {
      const result = await run;
      if (this.results.size >= this.idempotencyLimit) {
        const oldest = this.results.keys().next().value;
        if (oldest !== void 0) this.results.delete(oldest);
      }
      this.results.set(key, clone(result));
      return result;
    } finally {
      if (this.inflight.get(key) === run) this.inflight.delete(key);
    }
  }
  translate(error) {
    if (error instanceof ReviewError) return error;
    if (error instanceof ReviewLifecycleError) {
      return new ReviewError(mapLifecycleCode(error.code), error.message, {
        ...error.reviewId === void 0 ? {} : { reviewId: error.reviewId },
        ...error.commentId === void 0 ? {} : { commentId: error.commentId }
      });
    }
    if (error instanceof ReviewNotFoundError) {
      return new ReviewError("not-found", error.message, { reviewId: error.reviewId });
    }
    if (error instanceof ReviewerError || error instanceof ReportValidationError) {
      return new ReviewError("internal", error.message);
    }
    return new ReviewError("internal", error.message);
  }
};

// packages/core/src/index.ts
var CORE_VERSION = "0.1.0";

// packages/server/src/daemon/errors.ts
var STATUS = {
  unauthorized: 401,
  forbidden: 403,
  "not-found": 404,
  validation: 400,
  conflict: 409,
  "stale-review": 409,
  "agent-busy": 409,
  "daemon-unavailable": 503,
  "rate-limited": 429,
  internal: 500
};
var ApiError = class extends Error {
  code;
  status;
  details;
  retryAfter;
  constructor(code, message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    if (options.details !== void 0) this.details = options.details;
    if (options.retryAfter !== void 0) this.retryAfter = options.retryAfter;
  }
};
function errorEnvelope(error) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...error.details === void 0 ? {} : { details: error.details }
    }
  };
}
function writeError(res, error, requestId2) {
  if (res.headersSent) {
    res.end();
    return;
  }
  const body = JSON.stringify(errorEnvelope(error));
  res.writeHead(error.status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-request-id": requestId2,
    ...error.retryAfter === void 0 ? {} : { "retry-after": String(error.retryAfter) }
  });
  res.end(body);
}

// packages/server/src/daemon/server.ts
init_auth();

// packages/server/src/daemon/http.ts
var DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
function clientPeer(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim() !== "") {
      return forwarded.split(",")[0]?.trim() ?? "unknown";
    }
  }
  return req.socket.remoteAddress ?? "unknown";
}
function requestId(req) {
  const header = req.headers["x-request-id"];
  if (typeof header === "string" && header.length > 0 && header.length <= 200) return header;
  return `req_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
async function readBody(req, maxBytes) {
  const declared = req.headers["content-length"];
  if (typeof declared === "string" && Number(declared) > maxBytes) {
    throw new ApiError("validation", `request body exceeds ${maxBytes} bytes`);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new ApiError("validation", `request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
async function readJson(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const raw = await readBody(req, maxBytes);
  if (raw.length === 0) return {};
  let value;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new ApiError("validation", "request body is not valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError("validation", "request body must be a JSON object");
  }
  return value;
}
async function readForm(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const raw = await readBody(req, maxBytes);
  if (raw.length === 0) return {};
  const params = new URLSearchParams(raw.toString("utf8"));
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}
function sendJson(res, status2, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status2, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...headers
  });
  res.end(body);
}
function parsePositiveInt(value, fallback) {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

// packages/server/src/daemon/rate-limit.ts
var RateLimiter = class {
  windows = /* @__PURE__ */ new Map();
  config;
  now;
  constructor(config, now = Date.now) {
    this.config = config;
    this.now = now;
  }
  check(peer, kind) {
    const limit = kind === "mutation" ? this.config.mutations : this.config.reads;
    const time = this.now();
    const key = `${kind}:${peer}`;
    const existing = this.windows.get(key);
    if (existing === void 0 || time - existing.start >= this.config.windowMs) {
      this.windows.set(key, { start: time, count: 1 });
      return { allowed: true };
    }
    if (existing.count >= limit) {
      const retryAfter = Math.max(
        1,
        Math.ceil((existing.start + this.config.windowMs - time) / 1e3)
      );
      return { allowed: false, retryAfter };
    }
    existing.count += 1;
    return { allowed: true };
  }
  cleanup() {
    const time = this.now();
    for (const [key, window] of this.windows) {
      if (time - window.start >= this.config.windowMs) this.windows.delete(key);
    }
  }
};

// packages/server/src/daemon/sse.ts
import { randomBytes as randomBytes4 } from "node:crypto";
import { open as open4, readFile as readFile3, rename as rename2, unlink as unlink2 } from "node:fs/promises";
import { dirname } from "node:path";
var BUFFER_LIMIT = 1e3;
var EventHub = class {
  service;
  cursorPath;
  reviews = /* @__PURE__ */ new Map();
  global = [];
  latest = /* @__PURE__ */ new Map();
  syncs = /* @__PURE__ */ new Map();
  waiters = /* @__PURE__ */ new Set();
  listeners = /* @__PURE__ */ new Set();
  globalSeq = 0;
  constructor(service2, options = {}) {
    this.service = service2;
    this.cursorPath = options.cursorPath;
  }
  /**
   * Loads the persisted global cursor. The cursor is reserved in blocks before
   * events are published, so a crash can create a gap but can never reuse a
   * cursor already sent to a client (which would silently drop events).
   */
  async load() {
    if (this.cursorPath === void 0) return;
    let raw;
    try {
      raw = await readFile3(this.cursorPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    const value = JSON.parse(raw);
    if (typeof value !== "object" || value === null || value.version !== 1 || typeof value.seq !== "number" || !Number.isInteger(value.seq) || value.seq < 0) {
      throw new Error(`stream cursor is invalid: ${this.cursorPath}`);
    }
    this.globalSeq = value.seq;
  }
  /**
   * Refreshes the in-memory buffer from the event log. Concurrent callers for one
   * review are serialized so an event cannot be buffered twice.
   */
  async sync(reviewId) {
    const previous = this.syncs.get(reviewId) ?? Promise.resolve([]);
    const next = previous.catch(() => []).then(() => this.syncOnce(reviewId));
    this.syncs.set(reviewId, next);
    try {
      return await next;
    } finally {
      if (this.syncs.get(reviewId) === next) this.syncs.delete(reviewId);
    }
  }
  /** Replays the event log for every known review into the global stream. */
  async syncAll() {
    const limit = 100;
    let offset = 0;
    for (; ; ) {
      const page = await this.service.list({ limit, offset });
      for (const item of page.items) await this.sync(item.id);
      offset += page.items.length;
      if (page.items.length === 0 || offset >= page.total) return;
    }
  }
  eventsAfter(reviewId, after) {
    return (this.reviews.get(reviewId) ?? []).filter((event) => (event.seq ?? 0) > after);
  }
  globalAfter(after) {
    return this.global.filter((item) => item.seq > after);
  }
  wait(reviewId, after, timeoutMs, signal) {
    const ready = this.eventsAfter(reviewId, after);
    if (ready.length > 0) return Promise.resolve(ready);
    return new Promise((resolve5) => {
      const waiter = {
        reviewId,
        after,
        resolve: (events) => {
          clearTimeout(waiter.timer);
          this.waiters.delete(waiter);
          resolve5(events);
        },
        timer: setTimeout(() => waiter.resolve([]), timeoutMs)
      };
      signal?.addEventListener(
        "abort",
        () => {
          waiter.resolve([]);
        },
        { once: true }
      );
      this.waiters.add(waiter);
    });
  }
  waitGlobal(after, timeoutMs, signal) {
    const ready = this.globalAfter(after);
    if (ready.length > 0) return Promise.resolve(ready);
    return new Promise((resolve5) => {
      const listeners = this.listeners;
      const finish = (entries) => {
        clearTimeout(timer);
        listeners.delete(listener);
        resolve5(entries);
      };
      const listener = () => {
        const entries = this.globalAfter(after);
        if (entries.length > 0) finish(entries);
      };
      const timer = setTimeout(() => finish([]), timeoutMs);
      signal?.addEventListener(
        "abort",
        () => {
          finish([]);
        },
        { once: true }
      );
      listeners.add(listener);
    });
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async syncOnce(reviewId) {
    const events = await this.service.events(reviewId, 0);
    const known = this.reviews.get(reviewId) ?? [];
    const knownLatest = Math.max(
      0,
      ...known.map((event) => event.seq ?? 0),
      this.latest.get(reviewId) ?? 0
    );
    const fresh = events.filter((event) => (event.seq ?? 0) > knownLatest);
    if (fresh.length === 0) {
      if (knownLatest > 0) this.latest.set(reviewId, knownLatest);
      return [];
    }
    const start = await this.reserve(fresh.length);
    this.reviews.set(reviewId, [...known, ...fresh].slice(-BUFFER_LIMIT));
    const entries = [];
    for (const [index, event] of fresh.entries()) {
      const entry = { reviewId, event, seq: start + index + 1 };
      this.global.push(entry);
      if (this.global.length > BUFFER_LIMIT) this.global.shift();
      entries.push(entry);
      const seq = event.seq ?? 0;
      if (seq > (this.latest.get(reviewId) ?? 0)) this.latest.set(reviewId, seq);
    }
    for (const entry of entries) {
      for (const listener of this.listeners) listener(entry.event, entry.reviewId, entry.seq);
    }
    this.flush();
    return fresh;
  }
  async reserve(count) {
    if (count === 0) return this.globalSeq;
    const start = this.globalSeq;
    this.globalSeq += count;
    if (this.cursorPath !== void 0) await this.persistCursor();
    return start;
  }
  async persistCursor() {
    if (this.cursorPath === void 0) return;
    const target = this.cursorPath;
    const temp = `${target}.${process.pid}.${randomBytes4(6).toString("hex")}.tmp`;
    const handle2 = await open4(temp, "wx");
    try {
      await handle2.writeFile(JSON.stringify({ version: 1, seq: this.globalSeq }));
      await handle2.sync();
    } finally {
      await handle2.close();
    }
    try {
      await rename2(temp, target);
    } catch (error) {
      await unlink2(temp).catch(() => void 0);
      throw error;
    }
    const dir = await open4(dirname(target), "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  }
  flush() {
    for (const waiter of [...this.waiters]) {
      const events = waiter.reviewId === void 0 ? this.globalAfter(waiter.after).map((item) => item.event) : this.eventsAfter(waiter.reviewId, waiter.after);
      if (events.length > 0) waiter.resolve(events);
    }
  }
};
function frame(reviewId, event, seq = event.seq ?? 0) {
  const id = `${reviewId}:${seq}`;
  return {
    id,
    payload: `id: ${id}
event: ${event.type}
data: ${JSON.stringify(event)}

`
  };
}
async function openSse(req, res, hub, options) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  res.write(": connected\n\n");
  let replaying = true;
  const pending = /* @__PURE__ */ new Map();
  const unsubscribe = hub.subscribe((event, reviewId, seq) => {
    if (options.reviewId !== void 0 && reviewId !== options.reviewId) return;
    const framed = frame(reviewId, event, options.reviewId === void 0 ? seq : event.seq ?? 0);
    if (replaying) pending.set(framed.id, framed.payload);
    else res.write(framed.payload);
  });
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, options.heartbeatMs);
  const close = () => {
    clearInterval(heartbeat);
    unsubscribe();
    if (!res.writableEnded) res.end();
  };
  req.on("close", close);
  res.on("close", close);
  try {
    if (options.reviewId === void 0) await hub.syncAll();
    else await hub.sync(options.reviewId);
  } catch {
  }
  if (res.writableEnded) return;
  const existing = options.reviewId === void 0 ? hub.globalAfter(options.after).map((item) => frame(item.reviewId, item.event, item.seq)) : hub.eventsAfter(options.reviewId, options.after).map((event) => frame(options.reviewId ?? "", event));
  const replayed = /* @__PURE__ */ new Set();
  for (const item of existing) {
    if (pending.has(item.id)) continue;
    res.write(item.payload);
    replayed.add(item.id);
  }
  replaying = false;
  for (const [id, payload] of pending) {
    if (replayed.has(id)) continue;
    res.write(payload);
  }
  pending.clear();
}

// packages/server/src/daemon/jobs.ts
import { randomBytes as randomBytes5 } from "node:crypto";
function randomId2(prefix) {
  return `${prefix}_${randomBytes5(12).toString("base64url")}`;
}
var JobQueue = class {
  now;
  leaseMs;
  maxAttempts;
  heartbeatMs;
  workers = /* @__PURE__ */ new Map();
  jobs = /* @__PURE__ */ new Map();
  order = [];
  attempts = /* @__PURE__ */ new Map();
  /** Finding ids accepted for a job across retries, bounded by MAX_FINDINGS. */
  findingsSeen = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  sweepTimer;
  constructor(options = {}) {
    this.now = options.now ?? (() => /* @__PURE__ */ new Date());
    this.leaseMs = options.leaseMs ?? 6e4;
    this.maxAttempts = options.maxAttempts ?? 2;
    this.heartbeatMs = options.heartbeatMs ?? 2e4;
    this.sweepTimer = setInterval(() => this.sweep(), Math.max(100, Math.floor(this.leaseMs / 4)));
    this.sweepTimer.unref?.();
  }
  register(input = {}) {
    const id = input.id ?? randomId2("wrk");
    const worker = {
      id,
      name: input.name ?? id,
      harness: input.harness ?? "unknown",
      lastSeen: this.now().toISOString(),
      leaseMs: this.leaseMs,
      heartbeatMs: this.heartbeatMs
    };
    this.workers.set(id, worker);
    return { ...worker };
  }
  heartbeat(workerId) {
    const worker = this.workers.get(workerId);
    if (worker === void 0) return null;
    worker.lastSeen = this.now().toISOString();
    for (const job of this.jobs.values()) {
      if (job.status === "leased" && job.workerId === workerId) {
        job.leaseUntil = new Date(this.now().getTime() + this.leaseMs).toISOString();
      }
    }
    return { ...worker };
  }
  worker(workerId) {
    const worker = this.workers.get(workerId);
    return worker === void 0 ? null : { ...worker };
  }
  enqueue(input) {
    const job = {
      id: randomId2("job"),
      reviewId: input.reviewId,
      round: input.round,
      kind: input.kind,
      backend: input.backend,
      prompt: input.prompt,
      diff: input.diff,
      meta: input.meta ?? {},
      status: "queued",
      attempt: 0,
      createdAt: this.now().toISOString()
    };
    this.jobs.set(job.id, job);
    this.findingsSeen.set(job.id, /* @__PURE__ */ new Set());
    this.order.push(job.id);
    this.notify();
    return { ...job };
  }
  async next(workerId, waitMs, signal) {
    const worker = this.workers.get(workerId);
    if (worker === void 0) {
      throw new ApiError("unauthorized", "unknown worker; register again");
    }
    const deadline = this.now().getTime() + Math.max(0, waitMs);
    for (; ; ) {
      this.sweep();
      const job = this.pick();
      if (job !== void 0) return this.lease(job, workerId);
      const remaining = deadline - this.now().getTime();
      if (remaining <= 0 || signal?.aborted === true) return null;
      await this.sleep(Math.min(remaining, 250), signal);
    }
  }
  /** Returns a snapshot only if this is the current or last-known lease. */
  attempt(jobId, attemptId) {
    const job = this.jobs.get(jobId);
    if (job === void 0 || job.attemptId !== attemptId) return null;
    return { ...job };
  }
  /** Checks a finding without consuming its id, so the caller can append first. */
  hasFinding(jobId, attemptId, findingId) {
    if (this.leased(jobId, attemptId) === null) return false;
    return this.findingsSeen.get(jobId)?.has(findingId) === true;
  }
  /** Number of findings already accepted for this job, across retries. */
  findingCount(jobId, attemptId) {
    if (this.leased(jobId, attemptId) === null) return 0;
    return this.findingsSeen.get(jobId)?.size ?? 0;
  }
  acceptFinding(jobId, attemptId, findingId) {
    const job = this.leased(jobId, attemptId);
    if (job === null) return null;
    const state = this.attempts.get(attemptId);
    if (state === void 0) return null;
    const seen = this.findingsSeen.get(jobId) ?? /* @__PURE__ */ new Set();
    if (seen.has(findingId) || seen.size >= 200) return null;
    seen.add(findingId);
    this.findingsSeen.set(jobId, seen);
    state.findings.add(findingId);
    return { ...job };
  }
  acceptReport(jobId, attemptId) {
    const job = this.leased(jobId, attemptId);
    if (job === null) return null;
    const state = this.attempts.get(attemptId);
    if (state === void 0 || state.report) return null;
    state.report = true;
    job.status = "done";
    delete job.leaseUntil;
    this.notify();
    return { ...job };
  }
  fail(jobId, attemptId, retryable) {
    const job = this.leased(jobId, attemptId);
    if (job === null) return null;
    const state = this.attempts.get(attemptId);
    if (state === void 0 || state.failed) return null;
    state.failed = true;
    if (retryable && job.attempt < this.maxAttempts) {
      job.status = "queued";
      delete job.leaseUntil;
      delete job.workerId;
      this.notify();
      return { job: { ...job }, retried: true };
    }
    job.status = "failed";
    delete job.leaseUntil;
    this.notify();
    return { job: { ...job }, retried: false };
  }
  cancelReview(reviewId) {
    const canceled = [];
    for (const job of this.jobs.values()) {
      if (job.reviewId !== reviewId) continue;
      if (job.status === "queued" || job.status === "leased") {
        job.status = "canceled";
        delete job.leaseUntil;
        canceled.push({ ...job });
      }
    }
    if (canceled.length > 0) this.notify();
    return canceled;
  }
  job(jobId) {
    const job = this.jobs.get(jobId);
    return job === void 0 ? null : { ...job };
  }
  stats() {
    let queued = 0;
    let leased = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "queued") queued += 1;
      if (job.status === "leased") leased += 1;
    }
    return { queued, leased, workers: this.workers.size };
  }
  listReview(reviewId) {
    return [...this.jobs.values()].filter((job) => job.reviewId === reviewId).map((job) => ({ ...job }));
  }
  sweep() {
    const now = this.now().getTime();
    for (const job of this.jobs.values()) {
      if (job.status !== "leased" || job.leaseUntil === void 0) continue;
      if (new Date(job.leaseUntil).getTime() > now) continue;
      if (job.attempt >= this.maxAttempts) {
        job.status = "failed";
      } else {
        job.status = "queued";
        delete job.workerId;
        delete job.attemptId;
        delete job.leaseUntil;
      }
      this.notify();
    }
    for (const [id, worker] of this.workers) {
      if (now - new Date(worker.lastSeen).getTime() > this.heartbeatMs * 3) this.workers.delete(id);
    }
  }
  close() {
    if (this.sweepTimer !== void 0) clearInterval(this.sweepTimer);
    this.sweepTimer = void 0;
    this.listeners.clear();
  }
  leased(jobId, attemptId) {
    const job = this.jobs.get(jobId);
    if (job === void 0 || job.attemptId !== attemptId || job.status !== "leased") return null;
    return job;
  }
  pick() {
    for (const id of this.order) {
      const job = this.jobs.get(id);
      if (job?.status === "queued") return job;
    }
    return void 0;
  }
  lease(job, workerId) {
    job.status = "leased";
    job.attempt += 1;
    job.attemptId = randomId2("att");
    job.workerId = workerId;
    job.leaseUntil = new Date(this.now().getTime() + this.leaseMs).toISOString();
    this.attempts.set(job.attemptId, { findings: /* @__PURE__ */ new Set(), report: false, failed: false });
    return {
      id: job.id,
      reviewId: job.reviewId,
      round: job.round,
      kind: job.kind,
      backend: job.backend,
      attempt: job.attempt,
      attemptId: job.attemptId,
      leaseUntil: job.leaseUntil,
      bundle: {
        prompt: job.prompt,
        diff: job.diff,
        schema: { schemaVersion: 1 },
        meta: { ...job.meta, reviewId: job.reviewId, round: job.round, kind: job.kind }
      }
    };
  }
  notify() {
    for (const listener of this.listeners) listener();
  }
  sleep(ms, signal) {
    return new Promise((resolve5) => {
      const timer = setTimeout(done, ms);
      const onAbort = () => done();
      function done() {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve5();
      }
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
};

// packages/server/src/daemon/deliveries.ts
import { randomBytes as randomBytes6 } from "node:crypto";
import { mkdir as mkdir2, open as open5, readFile as readFile4, rename as rename3, unlink as unlink3 } from "node:fs/promises";
import { dirname as dirname2 } from "node:path";
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isDeliveryRecord(value) {
  if (!isRecord4(value)) return false;
  if (typeof value.id !== "string" || typeof value.deliveryKey !== "string") return false;
  if (typeof value.reviewId !== "string" || typeof value.round !== "number") return false;
  if (typeof value.submissionId !== "string" || typeof value.harness !== "string") return false;
  if (value.status !== "pending" && value.status !== "acked" && value.status !== "failed") {
    return false;
  }
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return false;
  if (!isRecord4(value.feedback)) return false;
  if (typeof value.feedback.markdown !== "string" || typeof value.feedback.deliveryKey !== "string" || !("json" in value.feedback)) {
    return false;
  }
  return true;
}
var DeliveryQueue = class {
  byId = /* @__PURE__ */ new Map();
  byKey = /* @__PURE__ */ new Map();
  now;
  path;
  operation = Promise.resolve();
  closed = false;
  constructor(now = () => /* @__PURE__ */ new Date(), options = {}) {
    this.now = now;
    this.path = options.path;
  }
  /** Loads persisted deliveries; a missing file starts an empty queue. */
  async load() {
    if (this.path === void 0) return;
    let raw;
    try {
      raw = await readFile4(this.path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(`delivery store is not valid JSON: ${this.path}`);
    }
    if (!isRecord4(value) || value.version !== 1 || !Array.isArray(value.deliveries)) {
      throw new Error(`delivery store has an unsupported shape: ${this.path}`);
    }
    this.byId.clear();
    this.byKey.clear();
    for (const item of value.deliveries) {
      if (!isDeliveryRecord(item)) {
        throw new Error(`delivery store contains an invalid record: ${this.path}`);
      }
      this.byId.set(item.id, item);
      this.byKey.set(item.deliveryKey, item.id);
    }
  }
  async create(input) {
    return await this.enqueue(async () => {
      const existing = this.byKey.get(input.deliveryKey);
      if (existing !== void 0) {
        const record2 = this.byId.get(existing);
        if (record2 !== void 0) return { ...record2 };
      }
      const id = `dlv_${randomBytes6(12).toString("base64url")}`;
      const at = this.now().toISOString();
      const record = {
        id,
        deliveryKey: input.deliveryKey,
        reviewId: input.reviewId,
        round: input.round,
        submissionId: input.submissionId,
        harness: input.harness,
        ...input.initiator === void 0 ? {} : { initiator: input.initiator },
        status: "pending",
        feedback: input.feedback,
        createdAt: at,
        updatedAt: at
      };
      this.byId.set(id, record);
      this.byKey.set(input.deliveryKey, id);
      try {
        await this.persist();
      } catch (error) {
        this.byId.delete(id);
        this.byKey.delete(input.deliveryKey);
        throw error;
      }
      return { ...record };
    });
  }
  pending(harness) {
    return [...this.byId.values()].filter((record) => record.harness === harness && record.status === "pending").map((record) => ({ ...record }));
  }
  get(id) {
    const record = this.byId.get(id);
    return record === void 0 ? null : { ...record };
  }
  async ack(id, by) {
    return await this.enqueue(async () => {
      const record = this.byId.get(id);
      if (record === void 0) return null;
      if (record.status !== "pending") return { ...record };
      const previous = { ...record };
      record.status = "acked";
      record.ackedBy = by;
      record.updatedAt = this.now().toISOString();
      try {
        await this.persist();
      } catch (error) {
        this.byId.set(id, previous);
        throw error;
      }
      return { ...record };
    });
  }
  async fail(id, error) {
    return await this.enqueue(async () => {
      const record = this.byId.get(id);
      if (record === void 0) return null;
      if (record.status !== "pending") return { ...record };
      const previous = { ...record };
      record.status = "failed";
      record.error = error;
      record.updatedAt = this.now().toISOString();
      try {
        await this.persist();
      } catch (persistError) {
        this.byId.set(id, previous);
        throw persistError;
      }
      return { ...record };
    });
  }
  /** Waits for queued writes so the daemon can shut down without losing state. */
  async close() {
    this.closed = true;
    await this.operation.catch(() => void 0);
  }
  enqueue(operation) {
    if (this.closed) return Promise.reject(new Error("delivery queue is closed"));
    const result = this.operation.catch(() => void 0).then(operation);
    this.operation = result.then(
      () => void 0,
      () => void 0
    );
    return result;
  }
  async persist() {
    if (this.path === void 0) return;
    const payload = {
      version: 1,
      deliveries: [...this.byId.values()].map((record) => ({ ...record }))
    };
    const dir = dirname2(this.path);
    await mkdir2(dir, { recursive: true });
    const temp = `${this.path}.${process.pid}.${randomBytes6(6).toString("hex")}.tmp`;
    const handle2 = await open5(temp, "wx");
    try {
      await handle2.writeFile(JSON.stringify(payload), "utf8");
      await handle2.sync();
    } finally {
      await handle2.close();
    }
    try {
      await rename3(temp, this.path);
    } catch (error) {
      await unlink3(temp).catch(() => void 0);
      throw error;
    }
    const directory = await open5(dir, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
};

// packages/server/src/daemon/routes.ts
import { randomBytes as randomBytes8 } from "node:crypto";
import { open as open7, readdir as readdir2, stat as stat4, unlink as unlink5 } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname4, isAbsolute as isAbsolute3, join as join4, parse, resolve as resolve4, sep as sep4 } from "node:path";

// packages/server/src/daemon/prompt.ts
var DIFF_PROMPT_LIMIT = 6e4;
var TRUNCATION_MARKER = "[diff truncated: prompt budget reached]";
function fileHeader(file) {
  const oldPath = file.oldPath ?? file.path;
  const lines = [`diff --git a/${oldPath} b/${file.path}`];
  if (file.binary) {
    lines.push(`Binary files a/${oldPath} and b/${file.path} differ`);
    return lines;
  }
  if (file.status === "added") lines.push("--- /dev/null", `+++ b/${file.path}`);
  else if (file.status === "deleted") lines.push(`--- a/${oldPath}`, "+++ /dev/null");
  else lines.push(`--- a/${oldPath}`, `+++ b/${file.path}`);
  return lines;
}
function hunkLines(file) {
  const lines = [];
  for (const hunk of file.hunks) {
    const suffix = hunk.header === "" ? "" : ` ${hunk.header}`;
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${suffix}`
    );
    for (const line of hunk.lines) {
      const prefix = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
      lines.push(`${prefix}${line.text}`);
    }
  }
  return lines;
}
function renderBoundedDiff(files, limit = DIFF_PROMPT_LIMIT) {
  const rendered = [];
  let size = 0;
  let truncated = false;
  const append2 = (line) => {
    const cost = line.length + (rendered.length === 0 ? 0 : 1);
    if (size + cost > limit) {
      truncated = true;
      return false;
    }
    rendered.push(line);
    size += cost;
    return true;
  };
  for (const file of files) {
    if (file.ignored === true) continue;
    let stopped = false;
    for (const line of fileHeader(file)) {
      if (!append2(line)) {
        stopped = true;
        break;
      }
    }
    if (stopped) break;
    if (file.binary) continue;
    for (const line of hunkLines(file)) {
      if (!append2(line)) {
        stopped = true;
        break;
      }
    }
    if (stopped) break;
  }
  const text = rendered.join("\n");
  if (!truncated) return { text, truncated };
  return { text: text === "" ? TRUNCATION_MARKER : `${text}
${TRUNCATION_MARKER}`, truncated };
}
function buildReviewPrompt(input) {
  const rendered = renderBoundedDiff(
    input.files,
    input.diffLimit === void 0 ? DIFF_PROMPT_LIMIT : input.diffLimit
  );
  const lines = [
    `# Independent code review: ${input.title}`,
    "",
    `Review: ${input.reviewId}`,
    `Round: ${input.round}`,
    `Kind: ${input.kind}`,
    "",
    "Read-only review: inspect the repository as needed, but do not modify files,",
    "spawn agents, or start or refresh reviews.",
    "Work in at most 15 tool calls. Start from the diff, then only open files that",
    "validate a suspected issue; do not tour the repository or read tests and docs",
    "unless a finding depends on them.",
    "Your final assistant message must contain ONLY one fenced ```json report.",
    "Never end the turn with an empty message or with prose only: a review without",
    "the JSON report is a failed review.",
    "Return one JSON object in a ```json fence with exactly this shape:",
    "{",
    '  "schemaVersion": 1,',
    '  "summary": "what changed and the main risks",',
    '  "riskLevel": "low|medium|high|critical",',
    '  "findings": [{',
    '    "id": "f1",',
    '    "severity": "blocker|major|minor|nit",',
    '    "category": "security|correctness|tests|performance|maintainability|api|concurrency|docs|other",',
    '    "confidence": "high|medium|low",',
    '    "kind": "issue|question|praise",',
    '    "file": "path/from/the/diff",',
    '    "lineStart": 1,',
    '    "lineEnd": 1,',
    '    "title": "short finding title",',
    '    "rationale": "why this is a problem",',
    '    "evidence": "exact code quote from the diff"',
    "  }],",
    '  "questions": [{',
    '    "id": "q1", "file": "path", "line": 1,',
    '    "question": "what is unclear", "why": "why it matters"',
    "  }],",
    '  "tests": {"ran": false, "commands": []},',
    '  "verification": []',
    "}",
    "Every finding needs a unique id and the enum values above; use an empty",
    "findings array when nothing is wrong. Do not invent fields outside this shape.",
    "",
    "Changed files:"
  ];
  if (input.kind === "verify" && input.context !== void 0) {
    const context = input.context;
    lines.push("", "## Verification round", "");
    lines.push(
      "Re-check the previous findings against this round and the unresolved comments.",
      "For every previous finding, return a verification entry with status",
      "`fixed`, `not-fixed` or `unclear`, quoting the new line when fixed.",
      "Do not repeat findings that are already fixed; do report regressions."
    );
    if (context.previousRound !== void 0) {
      lines.push("", `Previous round: ${context.previousRound}`);
    }
    if (context.unresolved !== void 0 && context.unresolved.length > 0) {
      lines.push("", "Unresolved human comments:");
      for (const comment of context.unresolved) {
        lines.push(
          `- ${comment.path}:${comment.lineStart} [${comment.state}] ${comment.body.replace(/\s+/g, " ").slice(0, 500)}`
        );
      }
    }
    if (context.previousReport !== void 0) {
      const previous = JSON.stringify(context.previousReport);
      lines.push("", "Previous reviewer report (JSON, bounded):");
      lines.push(previous.length > 2e4 ? `${previous.slice(0, 2e4)}\u2026` : previous);
    }
  }
  if (input.files.length === 0) lines.push("The review contains no file changes.");
  else lines.push(rendered.text);
  return { prompt: lines.join("\n"), truncated: rendered.truncated };
}

// packages/server/src/daemon/settings.ts
import { randomBytes as randomBytes7 } from "node:crypto";
import { mkdir as mkdir3, open as open6, readFile as readFile5, rename as rename4, unlink as unlink4 } from "node:fs/promises";
import { dirname as dirname3, join as join3 } from "node:path";
var FILE = "repositories.json";
function isSetting(value) {
  if (typeof value !== "object" || value === null) return false;
  const item = value;
  return typeof item.name === "string" && item.name.trim() !== "" && typeof item.path === "string" && item.path.trim() !== "" && (item.defaultTarget === void 0 || typeof item.defaultTarget === "string");
}
async function readRepositorySettings(storeDir) {
  let raw;
  try {
    raw = await readFile5(join3(storeDir, FILE), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { repositories: [] };
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("repositories.json is not valid JSON");
  }
  const record = parsed;
  if (typeof parsed !== "object" || parsed === null || !Array.isArray(record.repositories)) {
    throw new Error("repositories.json has an invalid shape");
  }
  const entries = record.repositories;
  if (!entries.every(isSetting)) {
    throw new Error("repositories.json has an invalid repository entry");
  }
  return {
    repositories: entries.map((item) => ({
      name: item.name.trim(),
      path: item.path.trim(),
      ...item.defaultTarget === void 0 || item.defaultTarget.trim() === "" ? {} : { defaultTarget: item.defaultTarget.trim() }
    }))
  };
}
async function writeRepositorySettings(storeDir, settings) {
  const target = join3(storeDir, FILE);
  const directory = dirname3(target);
  await mkdir3(directory, { recursive: true });
  const temporary = `${target}.${process.pid}.${randomBytes7(6).toString("hex")}.tmp`;
  const handle2 = await open6(temporary, "wx", 384);
  try {
    await handle2.writeFile(`${JSON.stringify(settings, null, 2)}
`, "utf8");
    await handle2.sync();
  } finally {
    await handle2.close();
  }
  try {
    await rename4(temporary, target);
  } catch (error) {
    await unlink4(temporary).catch(() => void 0);
    throw error;
  }
  const directoryHandle = await open6(directory, "r");
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}

// packages/server/src/daemon/static.ts
import { readFile as readFile6, realpath as realpath3, stat as stat3 } from "node:fs/promises";
import { extname, isAbsolute as isAbsolute2, relative as relative3, resolve as resolve3, sep as sep3 } from "node:path";
import { fileURLToPath } from "node:url";
var CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'";
var SPA_ROUTES = /* @__PURE__ */ new Set(["/", "/auth", "/new", "/health", "/settings"]);
var IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
var MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};
function contentType(path) {
  return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}
function setStaticSecurityHeaders(res) {
  res.setHeader("content-security-policy", CSP);
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
}
function isSpaRoute(pathname) {
  return SPA_ROUTES.has(pathname) || /^\/review\/[^/]+$/.test(pathname);
}
function safeRelative(root, requested) {
  let decoded;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  if (isAbsolute2(decoded)) return null;
  const absolute = resolve3(root, decoded);
  const rel = relative3(root, absolute);
  if (rel === "" || rel.startsWith("..") || rel.split(sep3).includes("..")) return null;
  return absolute;
}
async function resolveInside(root, requested) {
  const absolute = safeRelative(root, requested);
  if (absolute === null) return null;
  try {
    const [realRoot, realFile] = await Promise.all([realpath3(root), realpath3(absolute)]);
    const rel = relative3(realRoot, realFile);
    if (rel === "" || rel.startsWith("..") || rel.split(sep3).includes("..")) return null;
    return realFile;
  } catch {
    return null;
  }
}
function sendHtml(res, html, cache) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    "cache-control": cache
  });
  res.end(html);
}
function fallbackHtml() {
  return [
    '<!doctype html><meta charset="utf-8"><title>reviewd \u2014 UI not built</title>',
    "<style>body{font:16px/1.5 system-ui,sans-serif;max-width:44rem;margin:10vh auto;padding:0 1.5rem;color:#1f2328;background:#f6f8fa}code{background:#eaeef2;padding:.15rem .35rem;border-radius:4px}</style>",
    "<h1>reviewd is running</h1>",
    "<p>The browser UI has not been built yet. Build it with <code>pnpm build</code> and reload this page.</p>",
    "<p>For scripted clients use the authenticated API at <code>/api</code>; health is available at <code>/api/health</code>.</p>",
    '<p><a href="/auth">Sign in</a> \xB7 <a href="/api/health">Health</a></p>'
  ].join("\n");
}
function fallbackAuthHtml() {
  return [
    '<!doctype html><meta charset="utf-8"><title>reviewd \u2014 sign in</title>',
    "<h1>Sign in</h1>",
    "<p>The browser UI is not built. You can still exchange a token for a session cookie:</p>",
    '<form method="post" action="/api/auth"><input name="token" type="password" autocomplete="current-password"><button>Sign in</button></form>'
  ].join("\n");
}
async function resolveWebDir(explicit) {
  const env = process.env.CODE_REVIEW_WEB_DIR;
  const override = explicit !== void 0 && explicit.trim() !== "" ? explicit : env;
  if (override !== void 0 && override.trim() !== "") {
    const root = resolve3(override);
    try {
      const info = await stat3(resolve3(root, "index.html"));
      return info.isFile() ? root : null;
    } catch {
      return null;
    }
  }
  const candidates = [
    fileURLToPath(new URL("../../web/dist", import.meta.url)),
    fileURLToPath(new URL("../../../web/dist", import.meta.url)),
    resolve3(process.cwd(), "packages/web/dist"),
    resolve3(process.cwd(), "web/dist")
  ];
  for (const candidate of candidates) {
    const root = resolve3(candidate);
    try {
      const info = await stat3(resolve3(root, "index.html"));
      if (info.isFile()) return root;
    } catch {
    }
  }
  return null;
}
async function serveStatic(pathname, res, webDir, basePath = "") {
  const base = basePath.replace(/\/+$/, "");
  if (base !== "") {
    if (pathname === base) pathname = "/";
    else if (pathname.startsWith(`${base}/`)) pathname = pathname.slice(base.length);
    else return false;
  }
  if (pathname.startsWith("/api/")) return false;
  if (webDir === null) {
    if (pathname === "/" || pathname === "/auth" || isSpaRoute(pathname)) {
      setStaticSecurityHeaders(res);
      sendHtml(res, pathname === "/auth" ? fallbackAuthHtml() : fallbackHtml(), "no-store");
      return true;
    }
    notFound(res);
    return true;
  }
  if (isSpaRoute(pathname) || pathname === "/index.html") {
    const html = await readFile6(resolve3(webDir, "index.html")).catch(() => null);
    if (html === null) return false;
    setStaticSecurityHeaders(res);
    sendHtml(res, html.toString("utf8"), "no-store");
    return true;
  }
  if (pathname.startsWith("/assets/")) {
    const requested = pathname.slice(1);
    if (requested.includes("..") || requested.includes("\\")) {
      notFound(res);
      return true;
    }
    const file = await resolveInside(webDir, requested);
    if (file === null) {
      notFound(res);
      return true;
    }
    const body = await readFile6(file).catch(() => null);
    if (body === null) {
      notFound(res);
      return true;
    }
    setStaticSecurityHeaders(res);
    res.writeHead(200, {
      "content-type": contentType(file),
      "content-length": body.byteLength,
      "cache-control": IMMUTABLE_CACHE
    });
    res.end(body);
    return true;
  }
  const rootFile = await resolveInside(webDir, pathname.slice(1));
  if (rootFile !== null) {
    const body = await readFile6(rootFile).catch(() => null);
    if (body !== null) {
      setStaticSecurityHeaders(res);
      res.writeHead(200, {
        "content-type": contentType(rootFile),
        "content-length": body.byteLength,
        "cache-control": "no-store"
      });
      res.end(body);
      return true;
    }
  }
  notFound(res);
  return true;
}
function notFound(res) {
  setStaticSecurityHeaders(res);
  const html = '<!doctype html><meta charset="utf-8"><title>Not found</title><h1>Not found</h1>';
  res.writeHead(404, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    "cache-control": "no-store"
  });
  res.end(html);
}

// packages/server/src/daemon/routes.ts
var systemActor = { name: "reviewd", kind: "system" };
function actorFor(req, auth) {
  const raw = req.headers["x-review-actor"];
  const name2 = typeof raw === "string" && raw.trim() !== "" ? raw.trim().slice(0, 100) : auth === "cookie" ? "browser" : "api";
  return { name: name2, kind: "human" };
}
function ctxFor(req, auth) {
  const header = req.headers["idempotency-key"];
  return {
    actor: actorFor(req, auth),
    ...typeof header === "string" && header !== "" ? { requestId: header } : {}
  };
}
function mapError(error) {
  if (error instanceof ApiError) return error;
  if (error instanceof ReviewError) {
    switch (error.code) {
      case "not-found":
        return new ApiError("not-found", error.message, { details: error.details });
      case "validation":
        return new ApiError("validation", error.message, { details: error.details });
      case "conflict":
        return new ApiError("conflict", error.message, { details: error.details });
      case "stale-review":
        return new ApiError("stale-review", error.message, { details: error.details });
      case "agent-busy":
        return new ApiError("agent-busy", error.message, { details: error.details });
      case "internal":
        return new ApiError("internal", error.message);
    }
  }
  if (error instanceof RangeError) return new ApiError("validation", error.message);
  if (error instanceof GitError) return new ApiError("validation", error.message);
  return new ApiError("internal", "internal server error");
}
async function probeStore(store) {
  const probe = join4(store.root, `.health-${process.pid}-${randomBytes8(6).toString("hex")}`);
  try {
    const handle2 = await open7(probe, "wx");
    try {
      await handle2.writeFile("ok", "utf8");
    } finally {
      await handle2.close();
    }
    await unlink5(probe);
    return true;
  } catch {
    await unlink5(probe).catch(() => void 0);
    return false;
  }
}
async function probeGit(cwd) {
  try {
    const result = await runGit(cwd, ["--version"], {
      allowFailure: true,
      maxBytes: 4096,
      maxStderrBytes: 4096
    });
    return result.code === 0;
  } catch {
    return false;
  }
}
function str(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError("validation", `${field} must be a non-empty string`);
  }
  return value;
}
function object(value, field) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError("validation", `${field} must be an object`);
  }
  return value;
}
async function append(ctx, reviewId, type, data, actor = systemActor) {
  const event = createEvent({
    reviewId,
    type,
    actor,
    data,
    now: ctx.now
  });
  await ctx.store.append(reviewId, event);
  await ctx.hub.sync(reviewId);
}
async function enqueueWorkerJob(ctx, reviewId) {
  const view = await ctx.service.get(reviewId);
  const round = view.review.rounds.at(-1);
  if (round === void 0 || view.review.reviewer?.backend !== "worker") return;
  const kind = view.report === null ? "initial" : "verify";
  const previousRound = round.no > 1 ? round.no - 1 : void 0;
  const unresolved = view.review.comments.filter((comment) => comment.state === "open").flatMap((comment) => {
    const anchor = comment.anchors.at(-1);
    return anchor === void 0 ? [] : [
      {
        path: anchor.path,
        lineStart: anchor.lineStart,
        body: comment.body,
        state: comment.state
      }
    ];
  });
  const { prompt } = buildReviewPrompt({
    title: view.review.title,
    reviewId,
    round: round.no,
    kind,
    files: view.latestSnapshot?.files ?? [],
    ...kind === "verify" ? {
      context: {
        ...previousRound === void 0 ? {} : { previousRound },
        ...view.report === null ? {} : { previousReport: view.report },
        unresolved
      }
    } : {}
  });
  const initiator = view.review.initiator;
  ctx.jobs.enqueue({
    reviewId,
    round: round.no,
    kind,
    backend: "worker",
    prompt,
    diff: view.latestSnapshot,
    meta: {
      reviewId,
      round: round.no,
      // The worker runs the reviewer in the initiator's visible worktree; the
      // daemon's checkout is only a fallback for reviews without an initiator.
      cwd: initiator?.cwd ?? view.review.repoRoot,
      ...initiator === void 0 ? {} : { initiator }
    }
  });
}
function parseInitiator(value) {
  if (value === void 0) return void 0;
  const input = object(value, "initiator");
  const harness = str(input.harness, "initiator.harness");
  const sessionId = str(input.sessionId, "initiator.sessionId");
  const cwd = input.cwd === void 0 ? void 0 : str(input.cwd, "initiator.cwd");
  const agentPreset = input.agentPreset === void 0 ? void 0 : str(input.agentPreset, "initiator.agentPreset");
  return {
    harness,
    sessionId,
    ...cwd === void 0 ? {} : { cwd },
    ...agentPreset === void 0 ? {} : { agentPreset }
  };
}
async function createReview(ctx, req, auth, body) {
  const reviewer = body.reviewer === void 0 ? void 0 : object(body.reviewer, "reviewer");
  const initiator = parseInitiator(body.initiator);
  const view = await ctx.service.create(
    {
      repoRoot: str(body.repoRoot, "repoRoot"),
      title: str(body.title, "title"),
      scope: object(body.scope, "scope"),
      ...reviewer === void 0 ? {} : { reviewer },
      ...initiator === void 0 ? {} : { initiator }
    },
    ctxFor(req, auth)
  );
  await ctx.hub.sync(view.review.id);
  await enqueueWorkerJob(ctx, view.review.id);
  const origin = ctx.config.publicUrl.replace(/\/$/, "") || `http://${req.headers.host ?? "localhost"}`;
  const url = `${origin}/review/${view.review.id}`;
  return { review: view, url, warnings: view.review.warnings ?? [] };
}
async function handle(req, res, ctx, options) {
  const url = new URL(req.url ?? "/", "http://daemon");
  const path = url.pathname;
  const method = req.method ?? "GET";
  const id = requestId(req);
  if (method === "GET" && await serveStatic(path, res, ctx.config.webDir)) return;
  if (path === "/api/health" && method === "GET") {
    const queue = ctx.jobs.stats();
    const storeWritable = await probeStore(ctx.store);
    const gitOk = await probeGit(ctx.store.root);
    const healthy = storeWritable && gitOk;
    sendJson(res, healthy ? 200 : 503, {
      status: healthy ? "ok" : "degraded",
      store: { writable: storeWritable },
      git: { ok: gitOk },
      queue,
      jobs: { queued: queue.queued, running: queue.leased },
      workers: { online: queue.workers },
      version: CORE_VERSION
    });
    return;
  }
  if (path === "/api/version" && method === "GET") {
    sendJson(res, 200, { name: "reviewd", version: CORE_VERSION, schemaVersion: 1 });
    return;
  }
  if (path === "/api/auth" && method === "POST") {
    const contentType2 = String(req.headers["content-type"] ?? "");
    const body = contentType2.includes("application/x-www-form-urlencoded") ? await readForm(req, ctx.config.maxBodyBytes) : await readJson(req, ctx.config.maxBodyBytes);
    const token = str(body.token, "token");
    const { tokenMatches: tokenMatches2, sessionCookie: sessionCookie2 } = await Promise.resolve().then(() => (init_auth(), auth_exports));
    if (!tokenMatches2(ctx.config.token, token)) throw new ApiError("unauthorized", "invalid token");
    const secure = ctx.config.publicUrl.startsWith("https:");
    res.setHeader("set-cookie", sessionCookie2(ctx.config.token, { secure }));
    sendJson(res, 200, { ok: true });
    return;
  }
  if (path === "/api/auth/logout" && method === "POST") {
    const { clearCookie: clearCookie2 } = await Promise.resolve().then(() => (init_auth(), auth_exports));
    res.setHeader("set-cookie", clearCookie2());
    sendJson(res, 200, { ok: true });
    return;
  }
  if (!options.authenticated) throw new ApiError("unauthorized", "authentication required");
  if (path === "/api/config/public" && method === "GET") {
    sendJson(res, 200, {
      publicUrl: ctx.config.publicUrl,
      limits: {
        mutationsPerMinute: ctx.config.rateLimit.mutations,
        readsPerMinute: ctx.config.rateLimit.reads
      },
      defaultBase: "main"
    });
    return;
  }
  const segments = path.split("/").filter((part) => part !== "");
  if (path === "/api/reviews" && method === "GET") {
    const status2 = url.searchParams.get("status");
    const page = await ctx.service.list({
      ...status2 === "open" || status2 === "closed" ? { status: status2 } : {},
      limit: parsePositiveInt(url.searchParams.get("limit"), 50),
      offset: parsePositiveInt(url.searchParams.get("offset"), 0)
    });
    sendJson(res, 200, page);
    return;
  }
  if (path === "/api/reviews" && method === "POST") {
    const body = await readJson(req, ctx.config.maxBodyBytes);
    sendJson(res, 201, await createReview(ctx, req, options.auth, body));
    return;
  }
  if (segments[0] === "api" && segments[1] === "reviews" && segments[2] !== void 0) {
    const reviewId = decodeURIComponent(segments[2]);
    const rest = segments.slice(3);
    if (rest.length === 0 && method === "GET") {
      sendJson(res, 200, await ctx.service.get(reviewId));
      return;
    }
    if (rest.length === 0 && method === "PATCH") {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const input = {
        ...body.title === void 0 ? {} : { title: str(body.title, "title") },
        ...body.reviewer === void 0 ? {} : { reviewer: object(body.reviewer, "reviewer") },
        ...body.scope === void 0 ? {} : { scope: object(body.scope, "scope") }
      };
      const before = body.scope === void 0 ? null : await ctx.service.get(reviewId);
      const view = await ctx.service.updateReview(reviewId, input, ctxFor(req, options.auth));
      if (before !== null && view.review.rounds.length > before.review.rounds.length) {
        await enqueueWorkerJob(ctx, reviewId);
      }
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (rest.length === 0 && method === "DELETE") {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const reason = body.reason === void 0 ? void 0 : str(body.reason, "reason");
      await ctx.service.deleteReview(reviewId, ctxFor(req, options.auth), reason);
      ctx.jobs.cancelReview(reviewId);
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (rest[0] === "snapshot" && method === "GET") {
      const round = Number(url.searchParams.get("round"));
      if (!Number.isInteger(round) || round <= 0)
        throw new ApiError("validation", "round is required");
      const file = url.searchParams.get("file") ?? void 0;
      sendJson(res, 200, await ctx.service.snapshot(reviewId, round, file));
      return;
    }
    if (rest[0] === "events" && method === "GET") {
      await ctx.service.get(reviewId);
      const afterParam = url.searchParams.get("after") ?? req.headers["last-event-id"] ?? "0";
      const last = String(afterParam).includes(":") ? Number(String(afterParam).split(":").at(-1)) : Number(afterParam);
      const after = Number(Number.isFinite(last) && last >= 0 ? last : 0);
      const accept = String(req.headers.accept ?? "");
      if (accept.includes("text/event-stream")) {
        await openSse(req, res, ctx.hub, {
          reviewId,
          after,
          heartbeatMs: ctx.config.heartbeatMs
        });
        return;
      }
      await ctx.hub.sync(reviewId);
      const waitSeconds = Math.min(parsePositiveInt(url.searchParams.get("wait"), 25), 25);
      const controller = new AbortController();
      req.on("close", () => controller.abort());
      const events = await ctx.hub.wait(reviewId, after, waitSeconds * 1e3, controller.signal);
      sendJson(res, 200, { events, latestSeq: events.at(-1)?.seq ?? after });
      return;
    }
    if (rest[0] === "comments" && rest.length === 1 && method === "POST") {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const input = {
        body: str(body.body, "body"),
        path: str(body.path, "path"),
        side: body.side === "old" ? "old" : "new",
        lineStart: parsePositiveInt(String(body.lineStart ?? ""), 0),
        ...body.lineEnd === void 0 ? {} : { lineEnd: parsePositiveInt(String(body.lineEnd), 0) },
        ...body.suggestion === void 0 ? {} : {
          suggestion: object(
            body.suggestion,
            "suggestion"
          )
        }
      };
      const view = await ctx.service.addComment(reviewId, input, ctxFor(req, options.auth));
      await ctx.hub.sync(reviewId);
      sendJson(res, 201, view);
      return;
    }
    if (rest[0] === "comments" && rest[2] === "replies" && method === "POST") {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const view = await ctx.service.reply(
        reviewId,
        decodeURIComponent(rest[1] ?? ""),
        { body: str(body.body, "body") },
        ctxFor(req, options.auth)
      );
      await ctx.hub.sync(reviewId);
      sendJson(res, 201, view);
      return;
    }
    if (rest[0] === "comments" && rest[1] !== void 0 && rest[2] === "suggestion" && method === "POST") {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const action = body.action;
      if (action !== "accept" && action !== "decline" && action !== "apply") {
        throw new ApiError("validation", "action must be accept, decline or apply");
      }
      const view = await ctx.service.suggestionAction(
        reviewId,
        decodeURIComponent(rest[1]),
        action,
        ctxFor(req, options.auth)
      );
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (rest[0] === "comments" && rest[1] !== void 0 && rest.length === 2 && method === "PATCH") {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const hasBody = body.body !== void 0;
      const hasState = body.state !== void 0;
      if (hasBody === hasState) {
        throw new ApiError("validation", "provide exactly one of body or state");
      }
      const commentId = decodeURIComponent(rest[1]);
      let view;
      if (hasBody) {
        view = await ctx.service.editComment(
          reviewId,
          commentId,
          { body: str(body.body, "body") },
          ctxFor(req, options.auth)
        );
      } else {
        const state = body.state;
        if (state !== "open" && state !== "resolved" && state !== "dismissed") {
          throw new ApiError("validation", "state must be open, resolved or dismissed");
        }
        view = await ctx.service.setCommentState(
          reviewId,
          commentId,
          state,
          ctxFor(req, options.auth)
        );
      }
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (rest[0] === "comments" && rest[1] !== void 0 && rest.length === 2 && method === "DELETE") {
      const view = await ctx.service.deleteComment(
        reviewId,
        decodeURIComponent(rest[1]),
        ctxFor(req, options.auth)
      );
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (rest[0] === "findings" && rest[1] !== void 0 && rest[2] === "decision" && rest.length === 3 && method === "POST") {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const state = body.state;
      if (state !== "accepted" && state !== "dismissed") {
        throw new ApiError("validation", "state must be accepted or dismissed");
      }
      if (body.note !== void 0 && typeof body.note !== "string") {
        throw new ApiError("validation", "note must be a string");
      }
      const note = typeof body.note === "string" ? body.note : void 0;
      const view = await ctx.service.decideFinding(
        reviewId,
        decodeURIComponent(rest[1]),
        { state, ...note === void 0 ? {} : { note } },
        ctxFor(req, options.auth)
      );
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (rest[0] === "refresh" && method === "POST") {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const scope = body.scope === void 0 ? void 0 : object(body.scope, "scope");
      const view = await ctx.service.refresh(
        reviewId,
        scope === void 0 ? {} : { scope },
        ctxFor(req, options.auth)
      );
      await enqueueWorkerJob(ctx, reviewId);
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (rest[0] === "submit" && method === "POST") {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const verdict = body.verdict;
      if (verdict !== "approve" && verdict !== "request-changes" && verdict !== "comment") {
        throw new ApiError("validation", "unknown verdict");
      }
      const input = {
        verdict,
        ...body.summary === void 0 ? {} : { summary: str(body.summary, "summary") },
        ...body.includeResolved === void 0 ? {} : { includeResolved: body.includeResolved === true }
      };
      const submission = await ctx.service.submit(reviewId, input, ctxFor(req, options.auth));
      const review = await ctx.service.get(reviewId);
      const initiator = review.review.initiator;
      const delivery = await ctx.deliveries.create({
        deliveryKey: submission.deliveryKey,
        reviewId,
        round: submission.round,
        submissionId: submission.deliveryKey.split(":")[2] ?? "unknown",
        harness: initiator?.harness ?? (typeof body.harness === "string" && body.harness !== "" ? body.harness : "dsh"),
        ...initiator === void 0 ? {} : { initiator },
        feedback: submission.feedback
      });
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, { submission, delivery });
      return;
    }
    if (rest[0] === "close" && method === "POST") {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      if (body.verdict !== void 0 && body.verdict !== "approved" && body.verdict !== "closed") {
        throw new ApiError("validation", "verdict must be approved or closed");
      }
      const verdict = body.verdict === "approved" ? "approved" : "closed";
      const view = await ctx.service.close(reviewId, verdict, ctxFor(req, options.auth));
      ctx.jobs.cancelReview(reviewId);
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (rest[0] === "fix-status" && method === "POST") {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      if (!Array.isArray(body.items)) throw new ApiError("validation", "items must be an array");
      await ctx.service.claimFixStatus(
        reviewId,
        {
          items: body.items.map((item) => object(item, "item"))
        },
        ctxFor(req, options.auth)
      );
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (rest[0] === "feedback" && method === "GET") {
      const feedback = await ctx.service.latestFeedback(reviewId);
      if (feedback === null) throw new ApiError("not-found", "no submission yet");
      sendJson(res, 200, feedback);
      return;
    }
    if (rest[0] === "agent" && rest[1] === "cancel" && method === "POST") {
      ctx.jobs.cancelReview(reviewId);
      await ctx.service.cancelAgent(reviewId, ctxFor(req, options.auth)).catch((error) => {
        if (!(error instanceof ReviewError) || error.code !== "conflict") throw error;
      });
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, { ok: true });
      return;
    }
  }
  if (path === "/api/events" && method === "GET") {
    const accept = String(req.headers.accept ?? "");
    const raw = req.headers["last-event-id"] ?? url.searchParams.get("after") ?? "0";
    const after = Number(String(raw).includes(":") ? String(raw).split(":").at(-1) : raw);
    const sequence = Number.isFinite(after) && after >= 0 ? after : 0;
    if (accept.includes("text/event-stream")) {
      await openSse(req, res, ctx.hub, { after: sequence, heartbeatMs: ctx.config.heartbeatMs });
      return;
    }
    await ctx.hub.syncAll();
    const controller = new AbortController();
    req.on("close", () => controller.abort());
    const items = await ctx.hub.waitGlobal(sequence, ctx.config.longPollMs, controller.signal);
    sendJson(res, 200, { events: items });
    return;
  }
  if (path === "/api/workers/register" && method === "POST") {
    const body = await readJson(req, ctx.config.maxBodyBytes);
    const worker = ctx.jobs.register({
      ...typeof body.id === "string" ? { id: body.id } : {},
      ...typeof body.name === "string" ? { name: body.name } : {},
      ...typeof body.harness === "string" ? { harness: body.harness } : {}
    });
    sendJson(res, 201, worker);
    return;
  }
  if (segments[0] === "api" && segments[1] === "workers" && segments[3] === "heartbeat" && method === "POST") {
    const worker = ctx.jobs.heartbeat(decodeURIComponent(segments[2] ?? ""));
    if (worker === null) throw new ApiError("not-found", "unknown worker");
    sendJson(res, 200, worker);
    return;
  }
  if (path === "/api/jobs/next" && method === "GET") {
    const workerId = url.searchParams.get("workerId");
    if (workerId === null || workerId === "")
      throw new ApiError("validation", "workerId is required");
    const waitSeconds = Math.min(parsePositiveInt(url.searchParams.get("wait"), 25), 25);
    const controller = new AbortController();
    req.on("close", () => controller.abort());
    const lease = await ctx.jobs.next(workerId, waitSeconds * 1e3, controller.signal);
    if (lease === null) {
      res.writeHead(204, { "cache-control": "no-store", "x-request-id": id });
      res.end();
      return;
    }
    await append(ctx, lease.reviewId, "agent/started", {
      jobId: lease.id,
      round: lease.round,
      backend: "worker"
    });
    sendJson(res, 200, { job: { ...lease, bundle: void 0 }, bundle: lease.bundle });
    return;
  }
  if (segments[0] === "api" && segments[1] === "jobs" && segments[2] !== void 0 && method === "POST") {
    const jobId = decodeURIComponent(segments[2]);
    const action = segments[3];
    const body = await readJson(req, ctx.config.maxBodyBytes);
    const attemptId = str(body.attemptId, "attemptId");
    const job = ctx.jobs.attempt(jobId, attemptId);
    if (job === null) throw new ApiError("conflict", "stale or unknown job attempt");
    if (action === "ack") {
      sendJson(res, 200, { ok: true, status: job.status });
      return;
    }
    if (action === "findings") {
      if (!Array.isArray(body.findings))
        throw new ApiError("validation", "findings must be an array");
      const snapshot = job.diff ?? { files: [] };
      const seen = /* @__PURE__ */ new Set();
      let accepted = 0;
      let rejected = 0;
      for (const raw of body.findings) {
        const validation = validateFindingItem(raw, { snapshot });
        const finding = validation.finding;
        if (finding === null || seen.has(finding.id)) {
          rejected += 1;
          continue;
        }
        seen.add(finding.id);
        if (ctx.jobs.hasFinding(jobId, attemptId, finding.id) || ctx.jobs.findingCount(jobId, attemptId) >= 200) {
          rejected += 1;
          continue;
        }
        await append(ctx, job.reviewId, "agent/finding", {
          finding,
          round: job.round
        });
        if (ctx.jobs.acceptFinding(jobId, attemptId, finding.id) !== null) {
          accepted += 1;
        } else {
          rejected += 1;
        }
      }
      sendJson(res, 200, { accepted, rejected });
      return;
    }
    if (action === "report") {
      const report = object(body.report, "report");
      let validation;
      try {
        validation = validateReport(report, {
          snapshot: job.diff ?? { files: [] }
        });
      } catch (error) {
        throw new ApiError("validation", error instanceof Error ? error.message : "invalid report");
      }
      if (ctx.jobs.job(jobId)?.status === "done") {
        sendJson(res, 200, { accepted: true, duplicate: true });
        return;
      }
      const agentReport = {
        ...validation.report,
        reviewId: job.reviewId,
        round: job.round,
        backend: "worker",
        rejected: validation.rejected,
        warnings: validation.warnings
      };
      await append(ctx, job.reviewId, "agent/report", { report: agentReport });
      const accepted = ctx.jobs.acceptReport(jobId, attemptId);
      if (accepted === null) {
        if (ctx.jobs.job(jobId)?.status === "done") {
          sendJson(res, 200, { accepted: true, duplicate: true });
          return;
        }
        throw new ApiError("conflict", "stale or unknown job attempt");
      }
      sendJson(res, 200, { accepted: true, warnings: validation.warnings });
      return;
    }
    if (action === "fail") {
      const result = ctx.jobs.fail(jobId, attemptId, body.retryable !== false);
      if (result === null) {
        sendJson(res, 200, { ok: true, duplicate: true });
        return;
      }
      await append(ctx, job.reviewId, "agent/failed", {
        code: typeof body.code === "string" ? body.code : "failed",
        message: typeof body.message === "string" ? body.message : "job failed"
      });
      sendJson(res, 200, { ok: true, retried: result.retried, status: result.job.status });
      return;
    }
  }
  if (path === "/api/deliveries/pending" && method === "GET") {
    const harness = url.searchParams.get("harness") ?? "dsh";
    sendJson(res, 200, { deliveries: ctx.deliveries.pending(harness) });
    return;
  }
  if (segments[0] === "api" && segments[1] === "deliveries" && segments[2] !== void 0 && method === "POST") {
    const deliveryId = decodeURIComponent(segments[2]);
    const action = segments[3];
    const body = await readJson(req, ctx.config.maxBodyBytes);
    if (action === "ack") {
      const record = await ctx.deliveries.ack(
        deliveryId,
        typeof body.by === "string" ? body.by : "unknown"
      );
      if (record === null) throw new ApiError("not-found", "unknown delivery");
      sendJson(res, 200, record);
      return;
    }
    if (action === "fail") {
      const record = await ctx.deliveries.fail(
        deliveryId,
        typeof body.error === "string" ? body.error : "delivery failed"
      );
      if (record === null) throw new ApiError("not-found", "unknown delivery");
      sendJson(res, 200, record);
      return;
    }
  }
  if (path === "/api/gc" && method === "POST") {
    const body = await readJson(req, ctx.config.maxBodyBytes);
    const days = typeof body.olderThanDays === "number" ? body.olderThanDays : Number(body.olderThanDays ?? 90);
    if (!Number.isFinite(days) || days < 0)
      throw new ApiError("validation", "olderThanDays must be non-negative");
    sendJson(res, 200, await ctx.service.gc(days));
    return;
  }
  if (path === "/api/settings/repositories" && method === "GET") {
    sendJson(res, 200, await readRepositorySettings(ctx.store.root));
    return;
  }
  if (path === "/api/settings/repositories" && method === "PUT") {
    const body = await readJson(req, ctx.config.maxBodyBytes);
    const list = body.repositories;
    if (!Array.isArray(list)) {
      throw new ApiError("validation", "repositories must be an array");
    }
    if (list.length > 100) {
      throw new ApiError("validation", "at most 100 repositories can be configured");
    }
    const seen = /* @__PURE__ */ new Set();
    const repositories = [];
    for (const [index, raw] of list.entries()) {
      const item = object(raw, `repositories[${index}]`);
      const name2 = str(item.name, `repositories[${index}].name`).trim();
      const candidate = str(item.path, `repositories[${index}].path`).trim();
      if (name2.length > 120) {
        throw new ApiError("validation", `repositories[${index}].name is too long`);
      }
      if (candidate.length > 4096) {
        throw new ApiError("validation", `repositories[${index}].path is too long`);
      }
      const root = await resolveRepoRoot(candidate);
      if (seen.has(root)) {
        throw new ApiError("validation", `repository ${root} is configured twice`);
      }
      seen.add(root);
      const defaultTarget = item.defaultTarget === void 0 ? void 0 : str(item.defaultTarget, `repositories[${index}].defaultTarget`).trim();
      if (defaultTarget !== void 0) {
        assertGitRef(defaultTarget, `repositories[${index}].defaultTarget`);
        const check = await runGit(
          root,
          ["rev-parse", "--verify", "--end-of-options", `${defaultTarget}^{commit}`],
          { allowFailure: true }
        );
        if (check.code !== 0) {
          throw new ApiError(
            "validation",
            `default target ${defaultTarget} is not a commit in ${root}`
          );
        }
      }
      repositories.push({
        name: name2,
        path: root,
        ...defaultTarget === void 0 ? {} : { defaultTarget }
      });
    }
    await writeRepositorySettings(ctx.store.root, { repositories });
    sendJson(res, 200, { repositories });
    return;
  }
  if (path === "/api/fs/dirs" && method === "GET") {
    const raw = url.searchParams.get("path");
    const trimmed = raw === null ? "" : raw.trim();
    const requested = trimmed === "" ? homedir() : trimmed;
    if (requested.includes("\0")) {
      throw new ApiError("validation", "path must not contain NUL bytes");
    }
    if (requested.length > 4096) {
      throw new ApiError("validation", "path is too long");
    }
    if (!isAbsolute3(requested)) {
      throw new ApiError("validation", "path must be absolute");
    }
    const target = resolve4(requested);
    let info;
    try {
      info = await stat4(target);
    } catch (error) {
      throw directoryError(error, target);
    }
    if (!info.isDirectory()) {
      throw new ApiError("validation", `not a directory: ${target}`);
    }
    let dirents;
    try {
      dirents = await readdir2(target, { withFileTypes: true });
    } catch (error) {
      throw directoryError(error, target);
    }
    const entries = [];
    for (const entry of dirents) {
      if (!await entryIsDirectory(target, entry)) continue;
      const entryPath = join4(target, entry.name);
      entries.push({
        name: entry.name,
        path: entryPath,
        isGit: await hasGitEntry(entryPath)
      });
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    const truncated = entries.length > MAX_DIRECTORY_ENTRIES;
    if (truncated) entries.length = MAX_DIRECTORY_ENTRIES;
    sendJson(res, 200, {
      path: target,
      parent: target === parse(target).root ? null : dirname4(target),
      breadcrumbs: breadcrumbsFor(target),
      entries,
      truncated
    });
    return;
  }
  if (path === "/api/repos/commits" && method === "GET") {
    const repoPath = url.searchParams.get("path");
    const base = url.searchParams.get("base");
    const head = url.searchParams.get("head");
    if (repoPath === null) throw new ApiError("validation", "path is required");
    if (base === null) throw new ApiError("validation", "base is required");
    if (head === null) throw new ApiError("validation", "head is required");
    const root = await resolveRepoRoot(repoPath);
    const baseRef = assertGitRef(base, "base");
    const headRef = assertGitRef(head, "head");
    const baseSha = await resolveCommitRef2(root, baseRef);
    const headSha = await resolveCommitRef2(root, headRef);
    const mergeBase = await runGit(root, ["merge-base", baseSha, headSha]);
    const log = await runGit(root, [
      "log",
      "--topo-order",
      "--reverse",
      "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s",
      `${baseSha}..${headSha}`
    ]);
    const commits = log.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "").map((line) => {
      const [sha = "", shortSha2 = "", author = "", date = "", ...subject] = line.split("");
      return { sha, shortSha: shortSha2, author, date, subject: subject.join("") };
    });
    sendJson(res, 200, {
      repoRoot: root,
      baseRef,
      headRef,
      mergeBase: mergeBase.stdout.trim(),
      headSha,
      commits
    });
    return;
  }
  if (path === "/api/repos/branches" && method === "GET") {
    const repoPath = url.searchParams.get("path");
    if (repoPath === null) throw new ApiError("validation", "path is required");
    const root = await resolveRepoRoot(repoPath);
    const result = await runGit(root, [
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads",
      "refs/remotes"
    ]);
    const branches = [
      ...new Set(
        result.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.endsWith("/HEAD"))
      )
    ].sort();
    sendJson(res, 200, { repoRoot: root, branches });
    return;
  }
  throw new ApiError("not-found", `unknown route: ${method} ${path}`);
}
var MAX_DIRECTORY_ENTRIES = 500;
function nodeErrorCode(error) {
  if (typeof error !== "object" || error === null || !("code" in error)) return void 0;
  const code = error.code;
  return typeof code === "string" ? code : void 0;
}
function directoryError(error, target) {
  switch (nodeErrorCode(error)) {
    case "ENOENT":
      return new ApiError("validation", `directory does not exist: ${target}`);
    case "EACCES":
      return new ApiError("validation", `permission denied: ${target}`);
    case "ENOTDIR":
      return new ApiError("validation", `not a directory: ${target}`);
    default:
      return new ApiError("validation", `cannot read directory: ${target}`);
  }
}
async function entryIsDirectory(parent, entry) {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return (await stat4(join4(parent, entry.name))).isDirectory();
  } catch {
    return false;
  }
}
async function hasGitEntry(directory) {
  try {
    const info = await stat4(join4(directory, ".git"));
    return info.isDirectory() || info.isFile();
  } catch {
    return false;
  }
}
function breadcrumbsFor(target) {
  const { root } = parse(target);
  const breadcrumbs = [{ name: "/", path: root }];
  let current = root;
  for (const segment of target.slice(root.length).split(sep4)) {
    if (segment === "") continue;
    current = join4(current, segment);
    breadcrumbs.push({ name: segment, path: current });
  }
  return breadcrumbs;
}
function assertGitRef(value, label) {
  const ref = value.trim();
  if (ref === "" || ref.startsWith("-") || ref.length > 1024 || ref.includes("\0")) {
    throw new ApiError("validation", `${label} must be a git ref or commit`);
  }
  return ref;
}
async function resolveCommitRef2(root, ref) {
  const result = await runGit(root, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${ref}^{commit}`
  ]);
  return result.stdout.trim();
}

// packages/server/src/daemon/server.ts
var DEFAULTS2 = {
  host: "127.0.0.1",
  port: 3100,
  maxBodyBytes: 1024 * 1024,
  longPollMs: 25e3,
  heartbeatMs: 15e3,
  jobLeaseMs: 6e4,
  jobMaxAttempts: 2,
  rateLimit: { mutations: 60, reads: 600, windowMs: 6e4 }
};
function isLoopbackPeer(peer) {
  return peer === "::1" || peer === "::ffff:127.0.0.1" || peer === "127.0.0.1" || peer.startsWith("127.");
}
async function startDaemon(config, deps = {}) {
  assertToken(config.token);
  if (config.storeDir === void 0 || config.storeDir.trim() === "") {
    throw new Error("storeDir is required");
  }
  if (config.publicUrl !== void 0 && config.publicUrl !== "") {
    let parsed;
    try {
      parsed = new URL(config.publicUrl);
    } catch {
      throw new Error("publicUrl must be an absolute URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("publicUrl must use http or https");
    }
  }
  const now = deps.now ?? (() => /* @__PURE__ */ new Date());
  const store = await ReviewStore.open(config.storeDir, { now });
  let service2 = deps.service;
  if (service2 === void 0) {
    const lifecycle = new ReviewLifecycle(store, now);
    service2 = new ReviewServiceImpl({
      lifecycle,
      store,
      snapshots: { build: async (input) => await buildSnapshot(input) },
      now
    });
  }
  const hub = new EventHub(service2, { cursorPath: join5(config.storeDir, "stream-cursor.json") });
  try {
    await hub.load();
  } catch (error) {
    await store.close();
    throw error;
  }
  const jobs = new JobQueue({
    now,
    leaseMs: config.jobLeaseMs ?? DEFAULTS2.jobLeaseMs,
    maxAttempts: config.jobMaxAttempts ?? DEFAULTS2.jobMaxAttempts,
    heartbeatMs: 2e4
  });
  const deliveries = new DeliveryQueue(now, {
    path: join5(config.storeDir, "deliveries.json")
  });
  try {
    await deliveries.load();
  } catch (error) {
    jobs.close();
    await store.close();
    throw error;
  }
  const rateLimiter = new RateLimiter(config.rateLimit ?? DEFAULTS2.rateLimit);
  const publicUrl = config.publicUrl ?? "";
  const webDir = await resolveWebDir(config.webDir);
  const ctx = {
    config: {
      token: config.token,
      trustProxy: config.trustProxy ?? false,
      maxBodyBytes: config.maxBodyBytes ?? DEFAULTS2.maxBodyBytes,
      longPollMs: config.longPollMs ?? DEFAULTS2.longPollMs,
      heartbeatMs: config.heartbeatMs ?? DEFAULTS2.heartbeatMs,
      jobLeaseMs: config.jobLeaseMs ?? DEFAULTS2.jobLeaseMs,
      jobMaxAttempts: config.jobMaxAttempts ?? DEFAULTS2.jobMaxAttempts,
      publicUrl,
      webDir,
      rateLimit: config.rateLimit ?? DEFAULTS2.rateLimit
    },
    service: service2,
    store,
    hub,
    jobs,
    deliveries,
    now
  };
  const handler = async (req, res) => {
    const id = requestId(req);
    const peer = clientPeer(req, ctx.config.trustProxy);
    try {
      const url2 = new URL(req.url ?? "/", "http://daemon");
      const method = req.method ?? "GET";
      const isMutation = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
      let auth = null;
      const bearer = bearerToken(req);
      if (bearer !== void 0 && tokenMatches(ctx.config.token, bearer)) {
        auth = "bearer";
      } else if (verifySession(ctx.config.token, cookieSession(req), Date.now())) {
        auth = "cookie";
      }
      if (url2.pathname.startsWith("/api/") && !["/api/health", "/api/version", "/api/auth", "/api/auth/logout"].includes(url2.pathname)) {
        if (auth === null) throw new ApiError("unauthorized", "authentication required");
      }
      if (isMutation && url2.pathname !== "/api/auth" && url2.pathname !== "/api/auth/logout") {
        if (auth !== null && !isSameOriginMutation(
          req,
          ctx.config.publicUrl || `http://${req.headers.host ?? "localhost"}`,
          auth
        )) {
          throw new ApiError("forbidden", "cross-origin mutation rejected");
        }
        if (auth === null) throw new ApiError("unauthorized", "authentication required");
      }
      const kind = isMutation ? "mutation" : "read";
      const localRead = kind === "read" && isLoopbackPeer(peer);
      const allowed = localRead ? { allowed: true } : rateLimiter.check(peer, kind);
      if (!allowed.allowed) {
        throw new ApiError("rate-limited", "rate limit exceeded", {
          retryAfter: allowed.retryAfter
        });
      }
      await handle(req, res, ctx, {
        authenticated: auth !== null,
        auth: auth ?? "bearer",
        peer
      });
    } catch (error) {
      writeError(res, mapError(error), id);
    }
  };
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  try {
    await new Promise((resolve5, reject2) => {
      server.once("error", reject2);
      server.listen(config.port ?? DEFAULTS2.port, config.host ?? DEFAULTS2.host, () => resolve5());
    });
  } catch (error) {
    jobs.close();
    await deliveries.close();
    await store.close();
    throw error;
  }
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : config.port ?? DEFAULTS2.port;
  const host = config.host === "0.0.0.0" || config.host === "::" ? "127.0.0.1" : config.host ?? DEFAULTS2.host;
  const url = `http://${host}:${port}`;
  let closed = false;
  return {
    url,
    port,
    close: async () => {
      if (closed) return;
      closed = true;
      jobs.close();
      await new Promise((resolve5) => {
        server.close(() => resolve5());
        server.closeAllConnections?.();
      });
      await deliveries.close();
      await store.close();
    }
  };
}

// packages/dsh/src/embedded.ts
function startEmbeddedReview(config, options = {}) {
  const token = randomBytes9(32).toString("base64url");
  const storeDir = options.storeDir ?? join6(homedir2(), ".local", "share", "dsh-code-review");
  const start = options.startDaemon ?? startDaemon;
  const ready = start({
    host: "127.0.0.1",
    port: 0,
    storeDir,
    token,
    ...options.webDir === void 0 ? {} : { webDir: options.webDir }
  });
  const api = new DeferredReviewApi(
    ready.then((daemon) => new ReviewApi({ ...config, daemonUrl: daemon.url, token }))
  );
  let closing;
  return {
    ready,
    api,
    token,
    close() {
      closing ??= (async () => {
        const daemon = await ready.catch(() => void 0);
        if (daemon !== void 0) await daemon.close();
      })();
      return closing;
    }
  };
}

// packages/dsh/src/proxy.ts
var PREFIX = "/api/code-review";
var MAX_BODY = 2 * 1024 * 1024;
function json(res, status2, code, message) {
  const body = JSON.stringify({ error: { code, message } });
  res.writeHead(status2, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(body)),
    "cache-control": "no-store"
  });
  res.end(body);
}
async function resolveEndpoint(deps, res) {
  if (deps.endpoint === void 0) return deps.config;
  try {
    return await deps.endpoint;
  } catch {
    json(res, 503, "daemon-unavailable", "review daemon is not ready");
    return void 0;
  }
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
  const prefix = deps.prefix ?? PREFIX;
  return async function proxy(req, res) {
    try {
      const url = req.url ?? "/";
      const path = url.startsWith(prefix) ? url.slice(prefix.length) || "/" : "/";
      if (!path.startsWith("/")) {
        json(res, 400, "bad-path", "invalid proxy path");
        return;
      }
      const endpoint = await resolveEndpoint(deps, res);
      if (endpoint === void 0) return;
      if (path === "/info" && (req.method === "GET" || req.method === "HEAD")) {
        const body2 = JSON.stringify({
          daemonUrl: endpoint.daemonUrl,
          ...deps.config.publicUrl === void 0 ? {} : { publicUrl: deps.config.publicUrl },
          ...deps.uiBase === void 0 ? {} : { uiBase: deps.uiBase }
        });
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "content-length": String(Buffer.byteLength(body2)),
          "cache-control": "no-store"
        });
        res.end(req.method === "HEAD" ? void 0 : body2);
        return;
      }
      if (endpoint.token === "") {
        json(res, 503, "not-configured", "review daemon token is not configured");
        return;
      }
      const body = await bodyOf(req);
      const headers = {
        authorization: `Bearer ${endpoint.token}`,
        accept: typeof req.headers.accept === "string" ? req.headers.accept : "application/json"
      };
      if (req.headers["content-type"] !== void 0) {
        const contentType3 = req.headers["content-type"];
        if (typeof contentType3 === "string") headers["content-type"] = contentType3;
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
      const response = await fetchImpl(`${endpoint.daemonUrl}${daemonPath}`, {
        method: req.method ?? "GET",
        headers,
        ...body === void 0 ? {} : { body },
        signal: controller.signal,
        redirect: "manual"
      });
      const contentType2 = response.headers.get("content-type") ?? "application/json";
      if (contentType2.includes("text/event-stream") && response.body !== null) {
        res.writeHead(response.status, {
          "content-type": contentType2,
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
        "content-type": contentType2,
        "content-length": String(Buffer.byteLength(text)),
        "cache-control": response.headers.get("cache-control") ?? "no-store"
      };
      const requestId2 = response.headers.get("x-request-id");
      if (requestId2 !== null) outgoing["x-request-id"] = requestId2;
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

// packages/dsh/src/ui.ts
import { existsSync } from "node:fs";
import { join as join7 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
function createUiHandler(deps) {
  const base = (deps.basePath ?? "/code-review").replace(/\/+$/, "");
  const api = `${base}/api`;
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    if (url.pathname === base) {
      res.writeHead(308, { location: `${base}/${url.search}` }).end();
      return;
    }
    if (url.pathname === api || url.pathname.startsWith(`${api}/`)) {
      await deps.proxy(req, res);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" }).end();
      return;
    }
    if (await serveStatic(url.pathname, res, deps.webDir, base)) return;
    res.writeHead(404).end();
  };
}
function resolveUiDir() {
  const candidates = [
    fileURLToPath2(new URL("./web", import.meta.url)),
    fileURLToPath2(new URL("../web", import.meta.url))
  ];
  return candidates.find((dir) => existsSync(join7(dir, "index.html"))) ?? null;
}

// packages/dsh/src/delivery.ts
var MAX_FEEDBACK_CHARS = 1e5;
var MAX_DELIVERY_ATTEMPTS = 3;
function wait(ms, signal) {
  return new Promise((resolve5) => {
    if (signal.aborted) {
      resolve5();
      return;
    }
    const timer = setTimeout(resolve5, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve5();
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
var READ_ONLY_REVIEWER_TOOLS = /* @__PURE__ */ new Set([
  "read",
  "grep",
  "glob",
  "review_status",
  "review_feedback"
]);
function wait2(ms, signal) {
  return new Promise((resolve5) => {
    if (signal.aborted) {
      resolve5();
      return;
    }
    const timer = setTimeout(resolve5, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve5();
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
function reportFromText(text) {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].at(-1);
  const candidate = fenced?.[1] ?? text;
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
function extractReviewerReport(events) {
  const texts = [];
  for (const event of events) {
    if (typeof event !== "object" || event === null) continue;
    const record = event;
    if (record.type !== "assistant/message") continue;
    const text = textOfContent(record.data?.message?.content);
    if (text.trim() !== "") texts.push(text);
  }
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const parsed = reportFromText(texts[index]);
    if (parsed !== void 0) return parsed;
  }
  return void 0;
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
  let handle2;
  try {
    const selection = deps.defaultModel?.currentSelection();
    const agentOptions = {
      ...Object.fromEntries(
        Object.entries(selection ?? {}).filter(([, value]) => value !== void 0)
      ),
      ...deps.config.reviewerModel === void 0 ? {} : deps.config.reviewerModel
    };
    handle2 = await deps.agents.create({
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
      ...Object.keys(agentOptions).length === 0 ? {} : { agentOptions }
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
  const agent = handle2.agent;
  if (parent === void 0 && deps.config.reviewerPreset !== void 0) {
    const preset = deps.config.reviewerPreset;
    const presets = agent.ctx?.get?.("agentPresets");
    try {
      if (presets?.mount === void 0) throw new Error("agent preset service is unavailable");
      await presets.mount(agent.ctx, preset);
    } catch (error) {
      await deps.api.post(
        `/api/jobs/${encodeURIComponent(job.id)}/fail`,
        {
          attemptId: job.attemptId,
          code: "reviewer-preset",
          message: error instanceof Error ? error.message : `cannot mount preset ${preset}`,
          retryable: false
        },
        signal
      ).catch(() => void 0);
      await handle2.dispose?.().catch(() => void 0);
      return;
    }
  }
  let release;
  try {
    const tools = agent.ctx?.tools;
    if (tools?.guard === void 0) throw new Error("reviewer tool service is unavailable");
    release = tools.guard(
      (execution) => READ_ONLY_REVIEWER_TOOLS.has(execution.name) ? void 0 : `reviewer is read-only: ${execution.name} is not allowed`
    );
  } catch (error) {
    await deps.api.post(
      `/api/jobs/${encodeURIComponent(job.id)}/fail`,
      {
        attemptId: job.attemptId,
        code: "reviewer-tools",
        message: error instanceof Error ? error.message : "cannot restrict reviewer tools",
        retryable: false
      },
      signal
    ).catch(() => void 0);
    await handle2.dispose?.().catch(() => void 0);
    return;
  }
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
      new Promise((_resolve, reject2) => {
        timeout = setTimeout(() => {
          cancel({ kind: "timeout" });
          reject2(timeoutError);
        }, timeoutMs);
      })
    ]);
    const events = agent.session?.snapshotEvents?.() ?? agent.snapshotEvents?.() ?? [];
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
    const disposal = handle2.dispose?.();
    if (disposal !== void 0) await disposal.catch(() => void 0);
  }
}
async function runWorkerLoop(deps, signal) {
  if (deps.agents === void 0) {
    deps.logger?.warn?.("code-review: worker enabled but ctx.agents is unavailable");
    return;
  }
  const sleep = deps.sleep ?? wait2;
  const randomId3 = deps.randomId ?? (() => `wkr_${randomUUID()}`);
  const baseId = randomId3();
  const register = async () => {
    let delayMs = 1e3;
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
        return registered.id;
      } catch (error) {
        if (signal.aborted) return void 0;
        deps.logger?.warn?.(
          `code-review: worker registration failed (attempt ${attempt}, retrying in ${delayMs}ms): ${error instanceof Error ? error.message : "unknown"}`
        );
        await sleep(delayMs, signal);
        delayMs = Math.min(delayMs * 2, 3e4);
      }
    }
    return void 0;
  };
  while (!signal.aborted) {
    const workerId = await register();
    if (workerId === void 0) return;
    const heartbeat = setInterval(() => {
      void deps.api.post(`/api/workers/${encodeURIComponent(workerId)}/heartbeat`, {}, signal).catch(() => void 0);
    }, deps.config.heartbeatMs);
    heartbeat.unref?.();
    let stale = false;
    try {
      while (!signal.aborted) {
        try {
          const lease = await deps.api.get(
            `/api/jobs/next?workerId=${encodeURIComponent(workerId)}&wait=25`,
            signal
          );
          if (lease === null) {
            if (!signal.aborted) await sleep(deps.config.pollMs, signal);
            continue;
          }
          await runJob(deps, lease, signal);
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof ReviewApiError && (error.status === 401 || error.status === 404 || error.code === "unauthorized")) {
            stale = true;
            break;
          }
          deps.logger?.warn?.(
            `code-review: worker poll failed: ${error instanceof Error ? error.message : "unknown"}`
          );
          await sleep(deps.config.pollMs, signal);
        }
      }
    } finally {
      clearInterval(heartbeat);
    }
    if (!stale) return;
    deps.logger?.warn?.("code-review: worker registration is stale; registering again");
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
function startReviewLoops(ctx, config, api, ready) {
  const controller = new AbortController();
  const start = () => {
    if (controller.signal.aborted) return;
    const agents = service(ctx, "agents");
    const sessionController = service(ctx, "sessionController");
    if (config.worker) {
      const defaultModel = service(
        ctx,
        "agentDefaultModel"
      );
      const deps = {
        config,
        api,
        ...agents === void 0 ? {} : { agents },
        ...sessionController === void 0 ? {} : { sessionController },
        ...defaultModel === void 0 ? {} : { defaultModel },
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
  };
  if (ready === void 0) {
    start();
  } else {
    void ready.then(start).catch((error) => {
      ctx.logger?.warn?.(
        `code-review: embedded daemon failed: ${error instanceof Error ? error.message : "unknown"}`
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
  const embedded = config.embedded ? startEmbeddedReview(config, {
    ...config.storeDir === void 0 ? {} : { storeDir: config.storeDir }
  }) : void 0;
  if (embedded !== void 0) {
    ctx.effect(() => async () => {
      await embedded.close().catch((error) => {
        ctx.logger?.warn?.(
          `code-review: embedded daemon did not close cleanly: ${error instanceof Error ? error.message : "unknown"}`
        );
      });
    });
  }
  const endpoint = embedded === void 0 ? void 0 : embedded.ready.then((daemon) => ({ daemonUrl: daemon.url, token: embedded.token }));
  if (endpoint !== void 0) void endpoint.catch(() => void 0);
  const api = embedded?.api ?? new ReviewApi(config);
  const proxy = createProxyHandler({
    config,
    ...endpoint === void 0 ? {} : { endpoint },
    ...embedded === void 0 ? {} : { uiBase: config.uiBase }
  });
  const gatedProxy = withConnectionGate(ctx.connection, proxy);
  ctx.effect(
    () => ctx.webServer.register({ kind: "prefix", path: "/api/code-review", handler: gatedProxy })
  );
  if (embedded !== void 0) {
    const uiProxy = createProxyHandler({
      config,
      prefix: `${config.uiBase}/api`,
      ...endpoint === void 0 ? {} : { endpoint },
      uiBase: config.uiBase
    });
    const ui = createUiHandler({
      webDir: resolveUiDir(),
      proxy: uiProxy,
      basePath: config.uiBase
    });
    ctx.effect(
      () => ctx.webServer.register({
        kind: "prefix",
        path: config.uiBase,
        handler: withConnectionGate(ctx.connection, ui)
      })
    );
  }
  ctx.effect(() => {
    const disposers = createReviewTools(ctx, config, api);
    return () => {
      for (const dispose of disposers) dispose();
    };
  });
  ctx.effect(() => createReviewCommand({ ...ctx, commands: ctx.commands }, config, api));
  ctx.effect(() => startReviewLoops(ctx, config, api, embedded?.ready));
}
export {
  apply,
  inject,
  name
};
