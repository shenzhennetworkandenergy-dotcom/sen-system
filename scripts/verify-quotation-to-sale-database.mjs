import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npxCli = process.platform === "win32"
  ? resolve(process.execPath, "..", "node_modules", "npm", "bin", "npx-cli.js")
  : null;
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const linkedProjectMarker = resolve(repositoryRoot, "supabase", ".temp", "project-ref");
const requestedApiUrl = process.env.QUOTATION_TO_SALE_SUPABASE_URL;
const requestedDatabaseUrl = process.env.QUOTATION_TO_SALE_DATABASE_URL;
const fetchTimeoutMs = 15_000;
const interactiveReadinessTimeoutMs = 10_000;
const interactiveShutdownTimeoutMs = 2_000;
const interactiveKillTimeoutMs = 2_000;
const supabaseCommandTimeoutMs = 120_000;
const dockerCommandTimeoutMs = 10_000;

function normalizedHostname(url) {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function requireLoopbackUrl(value, label, protocols) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${label} must use ${protocols.join(" or ")}.`);
  }
  if (!allowedHosts.has(normalizedHostname(parsed))) {
    throw new Error(`${label} refused non-local host ${parsed.hostname}.`);
  }
  const routingParameter = [...parsed.searchParams.keys()]
    .find((key) => ["host", "hostaddr"].includes(key.toLowerCase()));
  if (routingParameter) {
    throw new Error(`${label} refused libpq connection-routing parameters (${routingParameter}).`);
  }
  return parsed;
}

function createBoundedFetch(baseFetch, timeoutMs) {
  assert.equal(typeof baseFetch, "function", "A fetch implementation is required.");
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0, "Fetch timeout must be positive.");
  return async (input, init = {}) => {
    const controller = new AbortController();
    const externalSignal = init.signal;
    const propagateAbort = () => controller.abort(externalSignal.reason);
    if (externalSignal?.aborted) propagateAbort();
    else externalSignal?.addEventListener("abort", propagateAbort, { once: true });
    let timer;
    const timeoutError = new Error(`Supabase request timed out after ${timeoutMs}ms.`);
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);
    });
    try {
      const requestPromise = Promise.resolve().then(() => baseFetch(input, {
        ...init,
        signal: controller.signal,
      }));
      return await Promise.race([requestPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", propagateAbort);
    }
  };
}

async function runWithGuaranteedCleanup(work, cleanup) {
  let result;
  let primaryError;
  let cleanupError;
  try {
    result = await work();
  } catch (error) {
    primaryError = error;
  }
  try {
    await cleanup();
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      "Quotation-to-Sale verification failed and cleanup also failed.",
    );
  }
  if (cleanupError) throw cleanupError;
  if (primaryError) throw primaryError;
  return result;
}

async function runVerifierSelfTests() {
  const createFakeInteractiveChild = ({
    readyOutput,
    closeOnWrite = false,
    errorOnWrite = false,
    closeOnEnd = false,
    closeOnKill = true,
  } = {}) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr.setEncoding = () => {};
    child.stdin = {
      destroyed: false,
      writable: true,
      writes: [],
      write(value) {
        this.writes.push(value);
        if (readyOutput) queueMicrotask(() => child.stdout.emit("data", readyOutput));
        if (closeOnWrite) queueMicrotask(() => child.emit("close", 1));
        if (errorOnWrite) queueMicrotask(() => child.emit("error", new Error("fake child error")));
      },
      end(value) {
        this.writes.push(value);
        this.writable = false;
        this.destroyed = true;
        if (closeOnEnd) queueMicrotask(() => child.emit("close", 0));
      },
    };
    child.killCalls = 0;
    child.kill = () => {
      child.killCalls += 1;
      if (closeOnKill) queueMicrotask(() => child.emit("close", 143));
      return true;
    };
    return child;
  };

  const timedOutLockChild = createFakeInteractiveChild();
  await assert.rejects(
    acquireInteractiveQuotationLock(timedOutLockChild, "00000000-0000-4000-8000-000000000009", {
      readinessTimeoutMs: 5,
      shutdownTimeoutMs: 5,
      killTimeoutMs: 5,
    }),
    /timed out acquiring/i,
  );
  assert.match(timedOutLockChild.stdin.writes.join(""), /rollback;\s*\\q/i);
  assert.equal(timedOutLockChild.stdin.destroyed, true, "Failed acquisition did not close stdin.");
  assert.equal(timedOutLockChild.killCalls, 1, "Failed acquisition did not terminate a wedged child.");

  const invalidPidLockChild = createFakeInteractiveChild({
    readyOutput: "Q2S9_LOCK_READY:99999999999999999999\n",
    closeOnEnd: true,
  });
  await assert.rejects(
    acquireInteractiveQuotationLock(invalidPidLockChild, "00000000-0000-4000-8000-000000000014", {
      readinessTimeoutMs: 5,
      shutdownTimeoutMs: 5,
      killTimeoutMs: 5,
    }),
    /did not report its backend PID/i,
  );
  assert.match(invalidPidLockChild.stdin.writes.join(""), /rollback;\s*\\q/i);

  const earlyExitLockChild = createFakeInteractiveChild({ closeOnWrite: true });
  await assert.rejects(
    acquireInteractiveQuotationLock(earlyExitLockChild, "00000000-0000-4000-8000-000000000015", {
      readinessTimeoutMs: 5,
      shutdownTimeoutMs: 5,
      killTimeoutMs: 5,
    }),
    /closed before acquiring/i,
  );
  assert.match(earlyExitLockChild.stdin.writes.join(""), /rollback;\s*\\q/i);

  const erroredLockChild = createFakeInteractiveChild({ errorOnWrite: true, closeOnEnd: true });
  await assert.rejects(
    acquireInteractiveQuotationLock(erroredLockChild, "00000000-0000-4000-8000-000000000017", {
      readinessTimeoutMs: 5,
      shutdownTimeoutMs: 5,
      killTimeoutMs: 5,
    }),
    /fake child error/i,
  );
  assert.match(erroredLockChild.stdin.writes.join(""), /rollback;\s*\\q/i);

  const releasableLockChild = createFakeInteractiveChild({
    readyOutput: "Q2S9_LOCK_READY:4242\n",
    closeOnEnd: true,
  });
  const releasableLock = await acquireInteractiveQuotationLock(
    releasableLockChild,
    "00000000-0000-4000-8000-000000000010",
    { readinessTimeoutMs: 5, shutdownTimeoutMs: 5, killTimeoutMs: 5 },
  );
  assert.equal(releasableLock.holderPid, 4242);
  await Promise.all([releasableLock.release(), releasableLock.release()]);
  assert.equal(
    releasableLockChild.stdin.writes.filter((value) => /commit;/i.test(value)).length,
    1,
    "Idempotent release wrote COMMIT more than once.",
  );
  assert.equal(releasableLockChild.killCalls, 0);

  const wedgedReleaseChild = createFakeInteractiveChild({
    readyOutput: "Q2S9_LOCK_READY:4243\n",
  });
  const wedgedReleaseLock = await acquireInteractiveQuotationLock(
    wedgedReleaseChild,
    "00000000-0000-4000-8000-000000000016",
    { readinessTimeoutMs: 5, shutdownTimeoutMs: 5, killTimeoutMs: 5 },
  );
  let wedgedReleaseError;
  try {
    await wedgedReleaseLock.release();
  } catch (error) {
    wedgedReleaseError = error;
  }
  assert.ok(wedgedReleaseError instanceof AggregateError);
  assert.match(wedgedReleaseError.errors[0].message, /required process termination/i);
  await assert.rejects(wedgedReleaseLock.release(), (error) => error === wedgedReleaseError);
  assert.equal(wedgedReleaseChild.killCalls, 1, "Wedged release was not terminated exactly once.");

  const remoteDockerCalls = [];
  assert.throws(
    () => validateLocalDockerDaemon({
      environment: { DOCKER_CONTEXT: "remote-self-test" },
      runDocker: (arguments_) => {
        remoteDockerCalls.push(arguments_);
        if (arguments_[0] === "context" && arguments_[1] === "inspect") {
          return JSON.stringify([{
            Name: "remote-self-test",
            Endpoints: { docker: { Host: "tcp://203.0.113.9:2376" } },
          }]);
        }
        throw new Error("Remote Docker context validation contacted the daemon.");
      },
    }),
    /refused non-local Docker endpoint/i,
  );
  assert.deepEqual(remoteDockerCalls, [["context", "inspect", "remote-self-test"]]);

  const remoteDockerHostCalls = [];
  assert.throws(
    () => validateLocalDockerDaemon({
      environment: {
        DOCKER_CONTEXT: "local-self-test",
        DOCKER_HOST: "ssh://docker.example.test",
      },
      runDocker: (arguments_) => {
        remoteDockerHostCalls.push(arguments_);
        if (arguments_[0] === "context" && arguments_[1] === "inspect") {
          return JSON.stringify([{
            Name: "local-self-test",
            Endpoints: { docker: { Host: "npipe:////./pipe/docker_engine" } },
          }]);
        }
        throw new Error("Remote DOCKER_HOST validation contacted the daemon.");
      },
    }),
    /refused non-local Docker endpoint from DOCKER_HOST/i,
  );
  assert.deepEqual(remoteDockerHostCalls, [["context", "inspect", "local-self-test"]]);

  const localDockerCalls = [];
  const localDocker = validateLocalDockerDaemon({
    environment: {},
    runDocker: (arguments_) => {
      localDockerCalls.push(arguments_);
      if (arguments_[0] === "context" && arguments_[1] === "show") return "desktop-linux\n";
      if (arguments_[0] === "context" && arguments_[1] === "inspect") {
        return JSON.stringify([{
          Name: "desktop-linux",
          Endpoints: { docker: { Host: "npipe:////./pipe/dockerDesktopLinuxEngine" } },
        }]);
      }
      if (arguments_[0] === "version") return '"29.6.2"\n';
      throw new Error(`Unexpected Docker self-test call: ${arguments_.join(" ")}`);
    },
  });
  assert.equal(localDocker.endpoint, "npipe:////./pipe/dockerDesktopLinuxEngine");
  assert.deepEqual(localDockerCalls, [
    ["context", "show"],
    ["context", "inspect", "desktop-linux"],
    ["version", "--format", "{{json .Server.Version}}"],
  ]);

  const waiterSql = buildConversionWaiterSql(4242);
  assert.match(waiterSql, /with recursive/i);
  assert.match(waiterSql, /a\.datname\s*=\s*current_database\(\)/i);
  assert.match(waiterSql, /join\s+extensions\.pg_stat_statements\s+statements/i);
  assert.match(waiterSql, /statements\.queryid\s*=\s*a\.query_id/i);
  assert.match(waiterSql, /statements\.query\s+ilike\s+'%create_sale_from_quotation%'/i);
  assert.match(waiterSql, /usename\s*=\s*'authenticator'/i);
  assert.match(waiterSql, /application_name\s+like\s+'PostgREST%'/i);
  assert.match(waiterSql, /count\(distinct waiter_pid\)/i);
  assert.match(waiterSql, /current_pid\s*=\s*4242/i);

  let wedgedRequestSignal;
  const boundedFetch = createBoundedFetch(async (_input, init) => {
    wedgedRequestSignal = init.signal;
    return new Promise(() => {});
  }, 5);
  await assert.rejects(
    boundedFetch("http://127.0.0.1:54321/rest/v1/rpc/self-test"),
    /timed out after 5ms/i,
  );
  assert.equal(wedgedRequestSignal.aborted, true, "A wedged fetch was not aborted on timeout.");

  const boundedSpawnOptions = buildBoundedSpawnOptions(1234, { timeout: 99, stdio: "inherit" });
  assert.equal(boundedSpawnOptions.timeout, 1234, "External process callers could override the deadline.");
  assert.equal(boundedSpawnOptions.stdio, "inherit");

  const cleanupOrder = [];
  const cleanupPlan = buildProductSerialCleanupPlan({
    deleteProductMedia: async () => cleanupOrder.push("product_media"),
    deleteMovementSerialHistory: async () => cleanupOrder.push("movement_serial_history"),
    deleteMovementSerialTracking: async () => cleanupOrder.push("movement_serial_tracking"),
    deleteSerialHistory: async () => cleanupOrder.push("serial_history"),
    deleteSerialTracking: async () => cleanupOrder.push("serial_tracking"),
    deleteSerialNumbers: async () => cleanupOrder.push("serial_numbers"),
    deleteMovementReleaseLinks: async () => cleanupOrder.push("movement_release_links"),
    deleteMovementItems: async () => cleanupOrder.push("movement_items"),
    deleteMovements: async () => cleanupOrder.push("movements"),
    deleteSerialBatches: async () => cleanupOrder.push("serial_batches"),
  });
  await executeCleanupPlan(cleanupPlan);
  assert.deepEqual(cleanupOrder, [
    "product_media",
    "movement_serial_history",
    "movement_serial_tracking",
    "serial_history",
    "serial_tracking",
    "serial_numbers",
    "movement_release_links",
    "movement_items",
    "movements",
    "serial_batches",
  ]);

  for (const value of [
    "postgresql://postgres:postgres@localhost:54322/postgres?host=remote.example",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres?hostaddr=203.0.113.9",
    "postgresql://postgres:postgres@localhost:54322/postgres?host=localhost,remote.example",
    "postgresql://postgres:postgres@localhost:54322/postgres?HOSTADDR=127.0.0.1,203.0.113.9",
  ]) {
    assert.throws(
      () => requireLoopbackUrl(value, "self-test database URL", ["postgres:", "postgresql:"]),
      /connection-routing parameters/i,
    );
  }
  const sensitiveFailure = buildSupabaseFailureMessage(
    ["status", "-o", "env"],
    'SERVICE_ROLE_KEY="self-test-secret"\nAPI_URL="http://127.0.0.1:54321"',
    'ANON_KEY="stderr-secret"',
    true,
  );
  assert.doesNotMatch(sensitiveFailure, /self-test-secret|stderr-secret|SERVICE_ROLE_KEY|ANON_KEY|API_URL/);
  assert.match(sensitiveFailure, /sensitive output omitted/i);

  let allConcurrencyFailures;
  try {
    throwIfConcurrencyFailed({
      barrierError: new Error("barrier self-test failure"),
      releaseError: new Error("release self-test failure"),
      callErrors: [
        new Error("first RPC self-test failure"),
        new Error("second RPC self-test failure"),
      ],
    });
  } catch (error) {
    allConcurrencyFailures = error;
  }
  assert.ok(allConcurrencyFailures instanceof AggregateError);
  assert.equal(allConcurrencyFailures.errors.length, 4);
  assert.deepEqual(
    allConcurrencyFailures.errors.map((error) => error.message),
    [
      "barrier self-test failure",
      "release self-test failure",
      "first RPC self-test failure",
      "second RPC self-test failure",
    ],
  );

  const selfTestActorId = "00000000-0000-4000-8000-000000000011";
  const selfTestCustomerId = "00000000-0000-4000-8000-000000000012";
  const partialSuccessSaleId = "00000000-0000-4000-8000-000000000013";
  const independentlyQueryableSales = new Map([[
    partialSuccessSaleId,
    { created_by: selfTestActorId, customer_profile_id: selfTestCustomerId },
  ]]);
  let rediscoveryCount = 0;
  const partialCleanupOrder = [];
  let combinedFailure;
  try {
    await runWithGuaranteedCleanup(
      async () => {
        const settled = [
          { status: "fulfilled", value: { data: { sale_id: partialSuccessSaleId }, error: null } },
          { status: "fulfilled", value: { data: null, error: new Error("second conversion failed") } },
        ];
        const callErrors = settled.flatMap(({ value }) => value.error ? [value.error] : []);
        throwIfConcurrencyFailed({ barrierError: null, releaseError: null, callErrors });
      },
      async () => {
        rediscoveryCount += 1;
        partialCleanupOrder.push("discover_owned_sales");
        const discovered = [...independentlyQueryableSales]
          .filter(([, sale]) => (
            sale.created_by === selfTestActorId
            || sale.customer_profile_id === selfTestCustomerId
          ))
          .map(([id]) => id);
        partialCleanupOrder.push("sale_children");
        for (const saleId of discovered) independentlyQueryableSales.delete(saleId);
        partialCleanupOrder.push("sales", "fixtures");
        throw new Error("cleanup self-test failure after removing owned fixtures");
      },
    );
  } catch (error) {
    combinedFailure = error;
  }
  assert.ok(combinedFailure instanceof AggregateError);
  assert.match(combinedFailure.message, /verification failed and cleanup also failed/i);
  assert.ok(combinedFailure.errors[0] instanceof AggregateError);
  assert.match(combinedFailure.errors[0].errors[0].message, /second conversion failed/);
  assert.match(combinedFailure.errors[1].message, /cleanup self-test failure/);
  assert.equal(rediscoveryCount, 1);
  assert.equal(independentlyQueryableSales.size, 0, "Independent rediscovery did not remove the partial Sale.");
  assert.deepEqual(partialCleanupOrder, [
    "discover_owned_sales", "sale_children", "sales", "fixtures",
  ]);
  console.log("Quotation-to-Sale verifier self-tests passed.");
}

function assertUnlinkedProject() {
  if (existsSync(linkedProjectMarker)) {
    const projectRef = readFileSync(linkedProjectMarker, "utf8").trim();
    if (projectRef) {
      throw new Error(`Refusing linked Supabase project ${projectRef}.`);
    }
  }
  for (const variable of ["SUPABASE_PROJECT_REF", "SUPABASE_PROJECT_ID"]) {
    if (process.env[variable]?.trim()) {
      throw new Error(`Refusing linked/remote project environment variable ${variable}.`);
    }
  }
}

function buildSupabaseFailureMessage(arguments_, stdout, stderr, sensitiveOutput = false) {
  if (sensitiveOutput) {
    return `Supabase ${arguments_.join(" ")} failed (sensitive output omitted).`;
  }
  const detail = [stdout, stderr].filter(Boolean).join("\n").trim();
  return `Supabase ${arguments_.join(" ")} failed.${detail ? `\n${detail}` : ""}`;
}

function buildBoundedSpawnOptions(timeoutMs, overrides = {}) {
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0, "External process timeout must be positive.");
  const safeOverrides = { ...overrides };
  delete safeOverrides.timeout;
  delete safeOverrides.shell;
  return {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...safeOverrides,
    shell: false,
    timeout: timeoutMs,
  };
}

function runSupabase(arguments_, options = {}) {
  if (npxCli && !existsSync(npxCli)) {
    throw new Error(`Unable to locate the local npx runner at ${npxCli}.`);
  }
  const { sensitiveOutput = false, ...spawnOptions } = options;
  const result = spawnSync(
    npxCli ? process.execPath : "npx",
    npxCli
      ? [npxCli, "supabase", "--workdir", repositoryRoot, ...arguments_]
      : ["supabase", "--workdir", repositoryRoot, ...arguments_],
    buildBoundedSpawnOptions(supabaseCommandTimeoutMs, spawnOptions),
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(buildSupabaseFailureMessage(
      arguments_, result.stdout, result.stderr, sensitiveOutput,
    ));
  }
  return result.stdout;
}

function parseStatusEnvironment(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(?:"([\s\S]*)"|'([\s\S]*)'|([^\s]+))$/.exec(line.trim());
    if (match) values[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  return values;
}

function checkRequestedUrlsBeforeStatus() {
  if (requestedApiUrl) requireLoopbackUrl(requestedApiUrl, "QUOTATION_TO_SALE_SUPABASE_URL", ["http:", "https:"]);
  if (requestedDatabaseUrl) requireLoopbackUrl(requestedDatabaseUrl, "QUOTATION_TO_SALE_DATABASE_URL", ["postgres:", "postgresql:"]);
  assertUnlinkedProject();
}

async function expectNoError(operation, label) {
  const { error } = await operation;
  assert.ifError(error, label);
}

async function countRows(client, table, applyFilter) {
  let query = client.from(table).select("*", { count: "exact", head: true });
  query = applyFilter(query);
  const { count, error } = await query;
  assert.ifError(error);
  return count ?? 0;
}

function runDockerSync(arguments_) {
  const result = spawnSync(
    "docker",
    arguments_,
    buildBoundedSpawnOptions(dockerCommandTimeoutMs),
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Local Docker command failed: ${result.stderr?.trim() || "no diagnostic output"}`);
  }
  return result.stdout;
}

function isAllowedLocalDockerEndpoint(value) {
  const endpoint = value?.trim().toLowerCase();
  return endpoint?.startsWith("npipe://")
    || endpoint?.startsWith("unix:///");
}

function validateLocalDockerDaemon({ environment = process.env, runDocker = runDockerSync } = {}) {
  const contextName = environment.DOCKER_CONTEXT?.trim()
    || runDocker(["context", "show"]).trim();
  assert.ok(contextName, "Docker did not report an active context.");
  const contexts = JSON.parse(runDocker(["context", "inspect", contextName]));
  assert.equal(contexts?.[0]?.Name, contextName, "Docker context inspection returned a different context.");
  const contextEndpoint = contexts?.[0]?.Endpoints?.docker?.Host;
  if (!isAllowedLocalDockerEndpoint(contextEndpoint)) {
    throw new Error(`Refused non-local Docker endpoint for context ${contextName}.`);
  }
  const explicitHost = environment.DOCKER_HOST?.trim();
  if (explicitHost && !isAllowedLocalDockerEndpoint(explicitHost)) {
    throw new Error("Refused non-local Docker endpoint from DOCKER_HOST.");
  }
  const serverVersion = runDocker(["version", "--format", "{{json .Server.Version}}"]).trim();
  assert.ok(serverVersion && serverVersion !== "null", "Local Docker daemon did not report a server version.");
  return { contextName, endpoint: explicitHost || contextEndpoint };
}

function validateLocalDatabaseContainer(databaseUrl) {
  const parsedDatabaseUrl = requireLoopbackUrl(
    databaseUrl,
    "Local Supabase database URL",
    ["postgres:", "postgresql:"],
  );
  const config = readFileSync(resolve(repositoryRoot, "supabase", "config.toml"), "utf8");
  const projectId = /^project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$/m.exec(config)?.[1];
  assert.ok(projectId, "Supabase config.toml does not contain a safe local project_id.");
  const dockerDaemon = validateLocalDockerDaemon();
  const containerName = `supabase_db_${projectId}`;
  const inspected = JSON.parse(runDockerSync(["inspect", containerName]))[0];
  assert.equal(inspected?.Name, `/${containerName}`, "Unexpected Supabase database container name.");
  assert.equal(inspected?.State?.Running, true, "Local Supabase database container is not running.");
  assert.match(inspected?.Config?.Image ?? "", /supabase\/postgres/i);
  const publishedPorts = inspected?.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  assert.ok(
    publishedPorts.some(({ HostPort }) => HostPort === parsedDatabaseUrl.port),
    "Supabase database container is not published on the verified loopback database port.",
  );
  return { containerName, dockerDaemon };
}

function runLocalPsql(containerName, sql) {
  return runDockerSync([
    "exec", containerName,
    "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql,
  ]).trim();
}

async function waitWithDeadline(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function shutdownInteractiveChild(child, exitPromise, stderr, {
  command,
  shutdownTimeoutMs,
  killTimeoutMs,
  requireCleanExit,
}) {
  let stdinError;
  try {
    if (!child.stdin.destroyed) {
      if (child.stdin.writable) child.stdin.end(command);
      else child.stdin.destroy?.();
    }
  } catch (error) {
    stdinError = error;
    try { child.stdin.destroy?.(); } catch { /* teardown continues */ }
  }

  let exitResult;
  let forcedTermination = false;
  try {
    exitResult = await waitWithDeadline(
      exitPromise,
      shutdownTimeoutMs,
      "Timed out waiting for the interactive quotation lock session to exit.",
    );
  } catch (error) {
    forcedTermination = true;
    try {
      child.kill("SIGTERM");
    } catch (killError) {
      throw new AggregateError(
        [error, killError, ...(stdinError ? [stdinError] : [])],
        "Interactive quotation lock teardown could not terminate the child process.",
      );
    }
    try {
      exitResult = await waitWithDeadline(
        exitPromise,
        killTimeoutMs,
        "Timed out waiting for the terminated quotation lock session to exit.",
      );
    } catch (killWaitError) {
      throw new AggregateError(
        [error, killWaitError, ...(stdinError ? [stdinError] : [])],
        "Interactive quotation lock teardown remained wedged after termination.",
      );
    }
  }

  const teardownErrors = [];
  if (stdinError) teardownErrors.push(stdinError);
  if (requireCleanExit && forcedTermination) {
    teardownErrors.push(new Error("Interactive quotation lock release required process termination."));
  }
  if (requireCleanExit && exitResult.error) teardownErrors.push(exitResult.error);
  if (requireCleanExit && exitResult.code !== 0) {
    teardownErrors.push(new Error(
      `Interactive quotation lock session exited ${exitResult.code}: ${stderr().trim()}`,
    ));
  }
  if (teardownErrors.length === 1) throw teardownErrors[0];
  if (teardownErrors.length > 1) {
    throw new AggregateError(teardownErrors, "Interactive quotation lock release failed.");
  }
}

async function acquireInteractiveQuotationLock(child, quotationId, {
  readinessTimeoutMs = interactiveReadinessTimeoutMs,
  shutdownTimeoutMs = interactiveShutdownTimeoutMs,
  killTimeoutMs = interactiveKillTimeoutMs,
} = {}) {
  assert.match(quotationId, /^[0-9a-f-]{36}$/i, "Quotation lock ID must be a UUID.");
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitPromise = new Promise((resolveExit) => {
    child.once("error", (error) => resolveExit({ error, code: null }));
    child.once("close", (code) => resolveExit({ error: null, code }));
  });
  const readyPromise = new Promise((resolveReady, rejectReady) => {
    const inspectOutput = () => {
      if (/Q2S9_LOCK_READY:\d+/.test(stdout)) resolveReady();
    };
    child.stdout.on("data", inspectOutput);
    child.once("close", (code) => {
      if (!/Q2S9_LOCK_READY:\d+/.test(stdout)) {
        rejectReady(new Error(`Quotation lock session closed before acquiring the lock (${code}).`));
      }
    });
    child.once("error", rejectReady);
    inspectOutput();
  });
  try {
    child.stdin.write([
      "begin;",
      `select id from public.quotation_requests where id='${quotationId}'::uuid for update;`,
      "select 'Q2S9_LOCK_READY:'||pg_backend_pid();",
      "",
    ].join("\n"));
    await waitWithDeadline(
      readyPromise,
      readinessTimeoutMs,
      "Timed out acquiring the local quotation contention lock.",
    );
    const holderPid = Number(/Q2S9_LOCK_READY:(\d+)/.exec(stdout)?.[1]);
    assert.ok(Number.isSafeInteger(holderPid) && holderPid > 0, "Local lock session did not report its backend PID.");
    let releasePromise;
    return {
      holderPid,
      release() {
        releasePromise ??= shutdownInteractiveChild(child, exitPromise, () => stderr, {
          command: "commit;\n\\q\n",
          shutdownTimeoutMs,
          killTimeoutMs,
          requireCleanExit: true,
        });
        return releasePromise;
      },
    };
  } catch (primaryError) {
    try {
      await shutdownInteractiveChild(child, exitPromise, () => stderr, {
        command: "rollback;\n\\q\n",
        shutdownTimeoutMs,
        killTimeoutMs,
        requireCleanExit: false,
      });
    } catch (teardownError) {
      throw new AggregateError(
        [primaryError, teardownError],
        "Interactive quotation lock acquisition failed and teardown also failed.",
      );
    }
    throw primaryError;
  }
}

async function holdQuotationLock(containerName, quotationId) {
  const child = spawn(
    "docker",
    [
      "exec", "-i", containerName,
      "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt",
    ],
    { cwd: repositoryRoot, stdio: ["pipe", "pipe", "pipe"], shell: false },
  );
  return acquireInteractiveQuotationLock(child, quotationId);
}

function buildConversionWaiterSql(holderPid) {
  assert.ok(Number.isSafeInteger(holderPid) && holderPid > 0, "Lock holder PID must be a positive integer.");
  return [
    "with recursive candidate_waiters(waiter_pid) as (",
    "select distinct a.pid from pg_stat_activity a",
    "join extensions.pg_stat_statements statements",
    "on statements.queryid = a.query_id",
    "and statements.dbid = (select oid from pg_database where datname=current_database())",
    "where a.pid <> pg_backend_pid()",
    "and a.datname = current_database()",
    "and a.state = 'active'",
    "and a.wait_event_type = 'Lock'",
    "and cardinality(pg_blocking_pids(a.pid)) > 0",
    "and a.usename = 'authenticator'",
    "and a.application_name like 'PostgREST%'",
    "and statements.query ilike '%create_sale_from_quotation%'",
    "), blocking_chain(waiter_pid,current_pid,path) as (",
    "select waiter_pid,waiter_pid,array[waiter_pid] from candidate_waiters",
    "union all",
    "select chain.waiter_pid,blockers.blocker_pid,chain.path||blockers.blocker_pid",
    "from blocking_chain chain",
    "cross join lateral unnest(pg_blocking_pids(chain.current_pid)) blockers(blocker_pid)",
    "where not blockers.blocker_pid=any(chain.path)",
    ") select count(distinct waiter_pid) from blocking_chain",
    `where current_pid = ${holderPid}`,
  ].join(" ");
}

async function waitForTwoConversionWaiters(containerName, holderPid) {
  const waiterSql = buildConversionWaiterSql(holderPid);
  const deadline = Date.now() + 5_000;
  let observed = 0;
  while (Date.now() < deadline) {
    observed = Number(runLocalPsql(containerName, waiterSql));
    if (observed === 2) return observed;
    if (observed > 2) {
      throw new Error(`Expected exactly two blocked conversion calls, observed ${observed}.`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const activity = runLocalPsql(containerName, [
    "select a.pid||'|'||a.usename||'|'||a.application_name||'|'||a.state",
    "||'|'||coalesce(wait_event_type,'')||'|'||coalesce(wait_event,'')",
    "||'|'||pg_blocking_pids(a.pid)::text||'|'||coalesce(a.query_id::text,'no-query-id')",
    "||'|'||coalesce((select length(statements.query)::text from extensions.pg_stat_statements statements",
    "where statements.queryid=a.query_id",
    "and statements.dbid=(select oid from pg_database where datname=current_database()) limit 1),'no-statement')",
    "||'|'||replace(a.query,E'\\n',' ')",
    "from pg_stat_activity a where a.pid<>pg_backend_pid() and a.datname=current_database() order by a.pid",
  ].join(" "));
  throw new Error(`Expected two blocked conversion calls, observed ${observed}. Activity: ${activity}`);
}

function buildProductSerialCleanupPlan(operations) {
  return [
    { name: "product_media", run: operations.deleteProductMedia },
    { name: "movement_serial_history", run: operations.deleteMovementSerialHistory },
    { name: "movement_serial_tracking", run: operations.deleteMovementSerialTracking },
    { name: "serial_history", run: operations.deleteSerialHistory },
    { name: "serial_tracking", run: operations.deleteSerialTracking },
    { name: "serial_numbers", run: operations.deleteSerialNumbers },
    { name: "movement_release_links", run: operations.deleteMovementReleaseLinks },
    { name: "movement_items", run: operations.deleteMovementItems },
    { name: "movements", run: operations.deleteMovements },
    { name: "serial_batches", run: operations.deleteSerialBatches },
  ];
}

async function executeCleanupPlan(plan) {
  for (const step of plan) {
    assert.equal(typeof step.run, "function", `Cleanup step ${step.name} is missing.`);
    await step.run();
  }
}

async function cleanupRunOwnedData(client, context) {
  const { actorId, containerName, customerId, dockerDaemon, ids } = context;
  const errors = [];
  const attempt = async (label, operation, fallback = null) => {
    try {
      const result = await operation();
      if (result?.error) throw result.error;
      return result?.data ?? result ?? fallback;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : (error && typeof error === "object" && "message" in error)
          ? String(error.message)
          : JSON.stringify(error);
      errors.push(`${label}: ${message}`);
      return fallback;
    }
  };
  const selectIds = async (label, table, applyFilter) => {
    const rows = await attempt(label, async () => {
      let query = client.from(table).select("id");
      query = applyFilter(query);
      return query;
    }, []);
    return (rows ?? []).map(({ id }) => id);
  };
  const removeIds = async (table, column, values) => {
    if (!values.length) return;
    await attempt(`delete ${table}`, () => client.from(table).delete().in(column, values));
  };
  const removeExact = async (label, table, applyFilter) => {
    await attempt(label, () => applyFilter(client.from(table).delete()));
  };
  const runCleanupPsql = (sql) => {
    assert.deepEqual(
      validateLocalDockerDaemon(),
      dockerDaemon,
      "Docker context or endpoint changed before local psql cleanup.",
    );
    return runLocalPsql(containerName, sql);
  };

  const discoveredSaleIds = actorId && customerId
    ? await selectIds("discover all run-owned Sales", "sales_orders", (query) => query
      .or(`created_by.eq.${actorId},customer_profile_id.eq.${customerId}`))
    : [];
  const saleIds = [...new Set(discoveredSaleIds)];
  const orderItemIds = await selectIds(
    "discover run-owned Sale items", "sales_order_items", (query) => query.in("order_id", saleIds),
  );
  const shipmentIds = await selectIds(
    "discover run-owned shipments", "shipments", (query) => query.in("order_id", saleIds),
  );
  const shipmentItemIds = await selectIds(
    "discover run-owned shipment items", "shipment_items", (query) => query.in("shipment_id", shipmentIds),
  );
  const stockOutRequestIds = await selectIds(
    "discover run-owned Stock Out requests", "sales_stock_out_requests", (query) => query.in("sales_order_id", saleIds),
  );
  const stockOutRequestItemIds = await selectIds(
    "discover run-owned Stock Out items", "sales_stock_out_request_items", (query) => query.in("request_id", stockOutRequestIds),
  );
  const stockOutRevisionIds = await selectIds(
    "discover run-owned Stock Out revisions", "sales_stock_out_request_revisions", (query) => query.in("request_id", stockOutRequestIds),
  );
  const stockOutReleaseIds = await selectIds(
    "discover run-owned Stock Out releases", "sales_stock_out_releases", (query) => query.in("sales_order_id", saleIds),
  );
  const stockOutReleaseItemIds = await selectIds(
    "discover run-owned Stock Out release items", "sales_stock_out_release_items", (query) => query.in("release_id", stockOutReleaseIds),
  );
  const packageIds = await selectIds(
    "discover run-owned packages", "order_packages", (query) => query.in("order_id", saleIds),
  );
  const allocationIds = await selectIds(
    "discover run-owned serial allocations", "order_serial_allocations", (query) => query.in("order_id", saleIds),
  );
  const paymentIds = await selectIds(
    "discover run-owned Sale payments", "sale_payments", (query) => query.in("order_id", saleIds),
  );
  const journalIds = actorId
    ? await selectIds("discover run-owned journals", "journal_entries", (query) => query.eq("created_by", actorId))
    : [];
  const movementIds = actorId
    ? await selectIds("discover run-owned inventory movements", "inventory_movements", (query) => query.eq("initiated_by", actorId))
    : [];
  const movementItemIds = await selectIds(
    "discover run-owned movement items", "inventory_movement_items", (query) => query.in("movement_id", movementIds),
  );
  const serialNumberIds = await selectIds(
    "discover run-owned serial numbers", "serial_numbers", (query) => query.eq("product_id", ids.product),
  );
  const cartIds = customerId
    ? await selectIds("discover run-owned carts", "shopping_carts", (query) => query.eq("profile_id", customerId))
    : [];

  await removeIds("delivery_location_updates", "shipment_id", shipmentIds);
  await removeIds("delivery_location_sessions", "shipment_id", shipmentIds);
  await removeIds("shipment_serials", "shipment_item_id", shipmentItemIds);
  await removeIds("shipment_documents", "shipment_id", shipmentIds);
  await removeIds("shipment_documents", "order_id", saleIds);
  await removeIds("shipment_route_points", "shipment_id", shipmentIds);
  await removeIds("shipment_tracking_events", "shipment_id", shipmentIds);
  await removeIds("shipment_tracking_events", "order_id", saleIds);
  await removeIds("shipment_packages", "shipment_id", shipmentIds);
  await removeIds("shipment_items", "shipment_id", shipmentIds);
  await removeIds("shipments", "id", shipmentIds);

  if (saleIds.length) {
    for (const value of saleIds) assert.match(value, /^[0-9a-f-]{36}$/i, "Run-owned Sale ID must be a UUID.");
    const saleIdArray = `array[${saleIds.map((value) => `'${value}'::uuid`).join(",")}]`;
    await attempt("delete run-owned RMA return serials", () => runCleanupPsql(
      `delete from public.rma_return_receipt_serials where return_receipt_id in (select id from public.rma_return_receipts where sales_order_id=any(${saleIdArray}))`));
    await attempt("delete run-owned RMA return receipts", () => runCleanupPsql(
      `delete from public.rma_return_receipts where sales_order_id=any(${saleIdArray})`));
    await attempt("clear run-owned serial RMA links", () => runCleanupPsql(
      `update public.serial_numbers set active_rma_claim_id=null where product_id='${ids.product}'::uuid and active_rma_claim_id in (select id from public.rma_claims where sales_order_id=any(${saleIdArray}))`));
    await attempt("delete run-owned RMA events", () => runCleanupPsql(
      `delete from public.rma_events where rma_claim_id in (select id from public.rma_claims where sales_order_id=any(${saleIdArray}))`));
    await attempt("delete run-owned RMA claims", () => runCleanupPsql(
      `delete from public.rma_claims where sales_order_id=any(${saleIdArray})`));
    await attempt("delete run-owned warranties", () => runCleanupPsql(
      `delete from public.warranty_coverages where sales_order_id=any(${saleIdArray})`));
  }

  await removeIds("sales_stock_out_release_serials", "release_item_id", stockOutReleaseItemIds);
  await removeIds("sales_stock_out_release_items", "release_id", stockOutReleaseIds);
  await removeIds("sales_stock_out_serial_changes", "request_item_id", stockOutRequestItemIds);
  await removeIds("sales_stock_out_request_revision_items", "revision_id", stockOutRevisionIds);
  await removeIds("sales_stock_out_releases", "id", stockOutReleaseIds);
  await removeIds("sales_stock_out_request_revisions", "id", stockOutRevisionIds);
  await removeIds("sales_stock_out_request_items", "id", stockOutRequestItemIds);
  await removeIds("sales_stock_out_requests", "id", stockOutRequestIds);

  await removeIds("order_packed_items", "package_id", packageIds);
  await removeIds("shipment_serials", "allocation_id", allocationIds);
  await removeIds("sales_stock_out_release_serials", "allocation_id", allocationIds);
  await removeIds("order_serial_allocations", "id", allocationIds);
  await removeIds("order_packages", "id", packageIds);

  await removeIds("cashbook_entries", "sale_payment_id", paymentIds);
  if (actorId) {
    await removeExact("delete run actor cashbook entries", "cashbook_entries", (query) => query.eq("created_by", actorId));
  }
  await removeIds("journal_lines", "journal_entry_id", journalIds);
  await removeIds("journal_entries", "id", journalIds);
  await removeIds("sale_payments", "id", paymentIds);
  await removeIds("payment_transactions", "order_id", saleIds);

  await executeCleanupPlan(buildProductSerialCleanupPlan({
    deleteProductMedia: () => removeExact(
      "delete run product media", "product_media", (query) => query.eq("product_id", ids.product),
    ),
    deleteMovementSerialHistory: () => removeIds("serial_number_history", "movement_id", movementIds),
    deleteMovementSerialTracking: () => removeIds("serial_tracking_events", "movement_id", movementIds),
    deleteSerialHistory: () => removeIds("serial_number_history", "serial_number_id", serialNumberIds),
    deleteSerialTracking: () => removeIds("serial_tracking_events", "serial_number_id", serialNumberIds),
    deleteSerialNumbers: () => removeIds("serial_numbers", "id", serialNumberIds),
    deleteMovementReleaseLinks: () => removeIds(
      "sales_stock_out_release_items", "inventory_movement_item_id", movementItemIds,
    ),
    deleteMovementItems: () => removeIds("inventory_movement_items", "id", movementItemIds),
    deleteMovements: () => removeIds("inventory_movements", "id", movementIds),
    deleteSerialBatches: () => removeExact(
      "delete run-owned serial batches", "serial_generation_batches", (query) => query.eq("product_id", ids.product),
    ),
  }));

  await removeIds("inventory_reservations", "order_id", saleIds);
  await removeIds("sale_documents", "order_id", saleIds);
  await removeIds("sale_price_adjustments", "order_id", saleIds);
  await removeIds("order_status_events", "order_id", saleIds);
  await removeIds("shopping_cart_items", "cart_id", cartIds);
  await removeIds("shopping_carts", "id", cartIds);

  await attempt("clear run quotation links", () => client.from("quotation_requests")
    .update({ converted_order_id: null, converted_invoice_id: null })
    .eq("id", ids.quotation));
  await removeIds("sales_order_items", "id", orderItemIds);
  await removeIds("sales_orders", "id", saleIds);

  await removeExact("delete run quotation audits", "audit_logs", (query) => query
    .eq("entity_type", "quotation_request").eq("entity_id", ids.quotation));
  if (actorId) {
    await removeExact("delete run actor audits", "audit_logs", (query) => query.eq("actor_id", actorId));
    await removeExact("delete audits targeting run actor", "audit_logs", (query) => query.eq("target_profile_id", actorId));
  }
  if (customerId) {
    await removeExact("delete audits targeting run customer", "audit_logs", (query) => query.eq("target_profile_id", customerId));
    await removeExact("delete run customer notifications", "customer_notifications", (query) => query.eq("profile_id", customerId));
  }
  await removeExact("delete run quotation notifications", "customer_notifications", (query) => query
    .eq("entity_type", "quotation_request").eq("entity_id", ids.quotation));
  await removeExact("delete run quotation items", "quotation_request_items", (query) => query.eq("quotation_id", ids.quotation));
  await removeExact("delete run quotation", "quotation_requests", (query) => query
    .eq("id", ids.quotation));

  await removeExact("delete run balance", "inventory_balances", (query) => query.eq("id", ids.balance));
  await removeExact("delete run address", "customer_addresses", (query) => query.eq("id", ids.address));
  await removeExact("delete run variation values", "variation_attribute_values", (query) => query.eq("variation_id", ids.variation));
  await removeExact("delete run product identifiers", "product_identifier_history", (query) => query.eq("product_id", ids.product));
  await removeExact("delete run product revisions", "product_revisions", (query) => query.eq("product_id", ids.product));
  await removeExact("delete run product category assignments", "product_category_assignments", (query) => query.eq("product_id", ids.product));
  await removeExact("delete run product tag assignments", "product_tag_assignments", (query) => query.eq("product_id", ids.product));
  await removeExact("delete run product attributes", "product_attributes", (query) => query.eq("product_id", ids.product));
  await removeExact("delete run product-owned attributes", "attributes", (query) => query.eq("owner_product_id", ids.product));
  await removeExact("delete run variation", "product_variations", (query) => query.eq("id", ids.variation));
  await removeExact("delete run product", "products", (query) => query.eq("id", ids.product));
  await removeExact("delete run warehouse", "warehouses", (query) => query.eq("id", ids.warehouse));

  if (customerId) {
    await attempt("delete run customer auth user", () => client.auth.admin.deleteUser(customerId));
  }
  if (actorId) {
    await attempt("delete run actor auth user", () => client.auth.admin.deleteUser(actorId));
  }
  if (errors.length) {
    throw new Error(`Task 9 cleanup failed for ${errors.length} operation(s): ${errors.join("; ")}`);
  }
}

function throwIfConcurrencyFailed({ barrierError, releaseError, callErrors }) {
  const errors = [barrierError, releaseError, ...callErrors].filter(Boolean);
  if (errors.length) {
    throw new AggregateError(
      errors,
      "Quotation-to-Sale contention barrier, release, or concurrent RPC failed.",
    );
  }
}

async function runConcurrentVerification(apiUrl, databaseUrl, serviceRoleKey) {
  const { containerName, dockerDaemon } = validateLocalDatabaseContainer(databaseUrl);
  const client = createClient(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: createBoundedFetch(globalThis.fetch, fetchTimeoutMs) },
  });
  const runId = randomUUID();
  const prefix = `q2s9-${runId.slice(0, 12)}`;
  const ids = {
    warehouse: randomUUID(),
    product: randomUUID(),
    variation: randomUUID(),
    balance: randomUUID(),
    address: randomUUID(),
    quotation: randomUUID(),
    quotationItem: randomUUID(),
  };
  const context = {
    actorId: null,
    containerName,
    customerId: null,
    dockerDaemon,
    ids,
  };

  await runWithGuaranteedCleanup(async () => {
    const actorResult = await client.auth.admin.createUser({
      email: `${prefix}-actor@local.test`,
      password: `${runId}Aa1!`,
      email_confirm: true,
      user_metadata: { full_name: "Quotation Sale Concurrency Actor" },
    });
    assert.ifError(actorResult.error);
    context.actorId = actorResult.data.user.id;
    const customerResult = await client.auth.admin.createUser({
      email: `${prefix}-customer@local.test`,
      password: `${runId}Bb2!`,
      email_confirm: true,
      user_metadata: { full_name: "Quotation Sale Concurrency Customer" },
    });
    assert.ifError(customerResult.error);
    context.customerId = customerResult.data.user.id;
    const { actorId, customerId } = context;

    await expectNoError(client.from("profiles").update({ role: "admin", status: "active" }).eq("id", actorId), "actor profile");
    await expectNoError(client.from("profiles").update({
      role: "customer", status: "active", phone: "01700000009", company_name: `${prefix} Customer`,
    }).eq("id", customerId), "customer profile");
    await expectNoError(client.from("warehouses").insert({
      id: ids.warehouse, code: `Q2S9-${runId.slice(0, 8)}`, name: `${prefix} Warehouse`,
      country_code: "BD", country_name: "Bangladesh", is_active: true,
    }), "warehouse fixture");
    await expectNoError(client.from("products").insert({
      id: ids.product, name: `${prefix} Variable Product`, slug: `${prefix}-variable-product`,
      sku: `Q2S9-P-${runId.slice(0, 8)}`, product_type: "variable", status: "active",
      regular_price: 999, sale_price: 888, currency: "BDT", manage_stock: false,
      serial_tracking_required: false, default_warehouse_id: ids.warehouse,
      public_catalogue_visible: true, created_by: actorId, updated_by: actorId,
    }), "product fixture");
    await expectNoError(client.from("product_variations").insert({
      id: ids.variation, product_id: ids.product, sku: `Q2S9-V-${runId.slice(0, 8)}`,
      status: "active", regular_price: 999, sale_price: 888, manage_stock: true,
      combination_key: `q2s9-${runId.slice(0, 8)}`,
    }), "variation fixture");
    await expectNoError(client.from("inventory_balances").insert({
      id: ids.balance, warehouse_id: ids.warehouse, product_id: ids.product,
      variation_id: ids.variation, on_hand: 25, reserved: 0,
    }), "inventory fixture");
    const addressSnapshot = {
      recipient_name: `${prefix} Customer`, phone: "01700000009", alternate_phone: "01800000009",
      address_line_1: "Concurrency Road 9", address_line_2: "Concurrency Floor 9",
      area: "Task 9 Area", city: "Dhaka", region: "Dhaka Division", postal_code: "1209",
      country_code: "BD", delivery_instructions: "Concurrency delivery instructions",
      map_label: "Concurrency map label",
    };
    await expectNoError(client.from("customer_addresses").insert({
      id: ids.address, profile_id: customerId, ...addressSnapshot,
      created_by: actorId, updated_by: actorId,
    }), "address fixture");
    await expectNoError(client.from("quotation_requests").insert({
      id: ids.quotation, reference: `Q2S9-${runId.slice(0, 12)}`, profile_id: customerId,
      created_by: actorId, status: "accepted", subject: `${prefix} accepted quotation`,
      currency: "BDT", shipping_address_id: ids.address, billing_address_id: ids.address,
      shipping_address_snapshot: addressSnapshot, billing_address_snapshot: addressSnapshot,
      required_by: "2026-09-30", expiration_date: "2099-12-31", subtotal: 246.9,
      discount_amount: 5.55, tax_amount: 7.89, total_amount: 249.24,
      internal_notes: `${prefix} internal`, customer_notes: `${prefix} customer`,
      customer_accepted_at: new Date().toISOString(), customer_accepted_by: actorId,
    }), "quotation fixture");
    await expectNoError(client.from("quotation_request_items").insert({
      id: ids.quotationItem, quotation_id: ids.quotation, product_id: ids.product,
      variation_id: ids.variation, product_name_snapshot: `${prefix} Variable Product`,
      sku_snapshot: `Q2S9-V-${runId.slice(0, 8)}`, quantity: 2, target_price: 123.45,
      unit_price: 123.45, discount_amount: 5.55, tax_amount: 7.89,
      line_subtotal: 246.9, line_total: 249.24, currency: "BDT",
    }), "quotation item fixture");

    const rpcArguments = {
      actor_profile_id: actorId,
      requested_quotation_id: ids.quotation,
      requested_customer_id: customerId,
      requested_address_id: ids.address,
      requested_address: null,
      requested_billing_address_id: ids.address,
      requested_billing_address: null,
      requested_warehouse_id: ids.warehouse,
      requested_source: "direct_office",
      requested_expected_delivery_date: "2026-09-30",
      requested_discount: 5.55,
      requested_shipping: 0,
      requested_service: 0,
      requested_tax: 7.89,
      requested_internal_notes: `${prefix} internal`,
      requested_customer_notes: `${prefix} customer`,
      requested_items: [{
        source_quotation_item_id: ids.quotationItem,
        product_id: ids.product,
        variation_id: ids.variation,
        warehouse_id: ids.warehouse,
        quantity: 2,
        unit_price: 123.45,
        line_discount: 5.55,
        line_tax: 7.89,
      }],
      requested_adjustments: [],
    };

    const lock = await holdQuotationLock(containerName, ids.quotation);
    const concurrentCalls = [
      Promise.resolve(client.rpc("create_sale_from_quotation", rpcArguments)),
      Promise.resolve(client.rpc("create_sale_from_quotation", rpcArguments)),
    ];
    let barrierError;
    let releaseError;
    try {
      const waiterCount = await waitForTwoConversionWaiters(containerName, lock.holderPid);
      assert.equal(waiterCount, 2, "The PostgreSQL contention barrier did not observe both conversion calls.");
      console.log("PostgreSQL contention barrier observed exactly two blocked conversion RPCs before release.");
    } catch (error) {
      barrierError = error;
    }
    try {
      await lock.release();
    } catch (error) {
      releaseError = error;
    }
    const settledCalls = await Promise.allSettled(concurrentCalls);
    const concurrentCallErrors = settledCalls.flatMap((settled, index) => {
      if (settled.status === "rejected") {
        return [new Error(`Concurrent RPC ${index + 1} rejected: ${settled.reason instanceof Error ? settled.reason.message : String(settled.reason)}`)];
      }
      if (settled.value.error) {
        return [new Error(`Concurrent RPC ${index + 1} failed: ${settled.value.error.message}`)];
      }
      return [];
    });
    throwIfConcurrencyFailed({ barrierError, releaseError, callErrors: concurrentCallErrors });
    assert.ok(settledCalls.every(({ status }) => status === "fulfilled"), "A concurrent HTTP call rejected.");
    const [first, second] = settledCalls.map(({ value }) => value);
    assert.ifError(first.error);
    assert.ifError(second.error);
    assert.equal(first.data.sale_id, second.data.sale_id, "Concurrent calls must resolve to one Sale.");
    assert.equal(first.data.order_number, second.data.order_number, "Concurrent calls must resolve to one Sale number.");
    assert.deepEqual([first.data.existing, second.data.existing].sort(), [false, true]);
    const convertedSaleId = first.data.sale_id;

    const retry = await client.rpc("create_sale_from_quotation", rpcArguments);
    assert.ifError(retry.error);
    assert.equal(retry.data.sale_id, convertedSaleId);
    assert.equal(retry.data.existing, true);

    assert.equal(await countRows(client, "sales_orders", (query) => query
      .or(`created_by.eq.${actorId},customer_profile_id.eq.${customerId}`)), 1, "Run ownership query found a duplicate converted Sale.");
    assert.equal(await countRows(client, "sales_order_items", (query) => query.eq("order_id", convertedSaleId)), 1);
    assert.equal(await countRows(client, "audit_logs", (query) => query
      .eq("entity_type", "quotation_request").eq("entity_id", ids.quotation)
      .eq("action", "quotation.converted_to_sale")), 1);
    assert.equal(await countRows(client, "order_status_events", (query) => query
      .eq("order_id", convertedSaleId).ilike("note", "Draft Sale created from accepted quotation%")), 1);
    assert.equal(await countRows(client, "quotation_requests", (query) => query
      .eq("id", ids.quotation).eq("converted_order_id", convertedSaleId)), 1);
    assert.equal(await countRows(client, "inventory_reservations", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "sale_documents", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "sale_payments", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "sales_stock_out_requests", (query) => query.eq("sales_order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "shipments", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "payment_transactions", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "inventory_movements", (query) => query.eq("initiated_by", actorId)), 0);

    const quotation = await client.from("quotation_requests")
      .select("status,converted_order_id").eq("id", ids.quotation).single();
    assert.ifError(quotation.error);
    assert.deepEqual(quotation.data, { status: "converted_to_sale", converted_order_id: convertedSaleId });
    const balance = await client.from("inventory_balances")
      .select("on_hand,reserved,available").eq("id", ids.balance).single();
    assert.ifError(balance.error);
    assert.deepEqual(
      Object.fromEntries(Object.entries(balance.data).map(([key, value]) => [key, Number(value)])),
      { on_hand: 25, reserved: 0, available: 25 },
    );

    const manual = await client.rpc("create_minimal_sale", {
      actor_profile_id: actorId,
      requested_customer_id: customerId,
      requested_address_id: ids.address,
      requested_address: null,
      requested_billing_address_id: ids.address,
      requested_billing_address: null,
      requested_warehouse_id: ids.warehouse,
      requested_source: "phone",
      requested_expected_delivery_date: "2026-10-01",
      requested_discount: 0,
      requested_shipping: 0,
      requested_service: 0,
      requested_tax: 0,
      requested_internal_notes: `${prefix} manual`,
      requested_customer_notes: `${prefix} manual customer`,
      requested_items: [{
        product_id: ids.product, variation_id: ids.variation, warehouse_id: ids.warehouse,
        quantity: 1, unit_price: 888, line_discount: 0, line_tax: 0,
      }],
      requested_adjustments: [],
    });
    assert.ifError(manual.error);
    const manualSaleId = manual.data;
    assert.equal(await countRows(client, "quotation_requests", (query) => query.eq("converted_order_id", manualSaleId)), 0);
    await expectNoError(client.rpc("confirm_sales_order", {
      actor_profile_id: actorId, requested_order_id: manualSaleId,
    }), "manual Sale confirmation");
    const activeReservation = await client.from("inventory_reservations")
      .select("product_id,variation_id,warehouse_id,quantity,status")
      .eq("order_id", manualSaleId).eq("status", "active").single();
    assert.ifError(activeReservation.error);
    assert.deepEqual(
      { ...activeReservation.data, quantity: Number(activeReservation.data.quantity) },
      {
        product_id: ids.product, variation_id: ids.variation, warehouse_id: ids.warehouse,
        quantity: 1, status: "active",
      },
    );
    const reservedAfterConfirmation = await client.from("inventory_balances")
      .select("reserved").eq("id", ids.balance).single();
    assert.ifError(reservedAfterConfirmation.error);
    assert.equal(Number(reservedAfterConfirmation.data.reserved), 1);
    assert.equal(await countRows(client, "quotation_requests", (query) => query.eq("converted_order_id", manualSaleId)), 0);

    await expectNoError(client.rpc("cancel_sales_order", {
      actor_profile_id: actorId, requested_order_id: manualSaleId,
      requested_reason: "Task 9 rollback-only manual workflow verification",
    }), "manual Sale cancellation");
    const manualOrder = await client.from("sales_orders").select("status").eq("id", manualSaleId).single();
    assert.ifError(manualOrder.error);
    assert.equal(manualOrder.data.status, "cancelled");
    assert.equal(await countRows(client, "inventory_reservations", (query) => query
      .eq("order_id", manualSaleId).eq("status", "cancelled")), 1);
    const reservedAfterCancellation = await client.from("inventory_balances")
      .select("reserved").eq("id", ids.balance).single();
    assert.ifError(reservedAfterCancellation.error);
    assert.equal(Number(reservedAfterCancellation.data.reserved), 0);
    assert.equal(await countRows(client, "quotation_requests", (query) => query.eq("converted_order_id", manualSaleId)), 0);
  }, async () => cleanupRunOwnedData(client, context));
}

if (process.argv.includes("--self-test")) {
  await runVerifierSelfTests();
  process.exit(0);
}

checkRequestedUrlsBeforeStatus();
const status = parseStatusEnvironment(runSupabase(
  ["status", "-o", "env"],
  { sensitiveOutput: true },
));
const apiUrl = requestedApiUrl ?? status.API_URL;
const databaseUrl = requestedDatabaseUrl ?? status.DB_URL;
const serviceRoleKey = status.SERVICE_ROLE_KEY;
assert.ok(apiUrl, "Local Supabase status did not provide API_URL.");
assert.ok(databaseUrl, "Local Supabase status did not provide DB_URL.");
assert.ok(serviceRoleKey, "Local Supabase status did not provide SERVICE_ROLE_KEY.");
requireLoopbackUrl(apiUrl, "Local Supabase API URL", ["http:", "https:"]);
requireLoopbackUrl(databaseUrl, "Local Supabase database URL", ["postgres:", "postgresql:"]);
assertUnlinkedProject();

if (process.argv.includes("--apply-local-migrations")) {
  runSupabase(["db", "reset", "--local", "--no-seed", "--yes"], { stdio: "inherit" });
  assertUnlinkedProject();
}

const migrationList = JSON.parse(runSupabase([
  "migration", "list", "--local", "--output-format", "json",
]));
assert.ok(
  migrationList.migrations?.some((migration) => (
    migration.local === "202608230004" && migration.remote === "202608230004"
  )),
  "The Task 3 quotation-to-Sale migration is not applied locally.",
);
runSupabase(["test", "db", "--local", "supabase/tests/quotation_to_sale.sql"], { stdio: "inherit" });
await runConcurrentVerification(apiUrl, databaseUrl, serviceRoleKey);

console.log("Quotation-to-Sale database verification passed: migration application, rollback, permissions, exact transfer, zero premature side effects, retry, concurrency, and manual Sales workflow.");
