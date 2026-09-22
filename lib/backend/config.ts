export type BackendMode = "native" | "supabase";

type Environment = Readonly<Record<string, string | undefined>>;

export type LocalDatabaseConfig = {
  databaseUrl: URL;
  sessionSecret: string;
  dataRoot: string;
  publicOrigin: URL;
  postgrestUrl: URL;
  bindHost: string;
  port: number;
};

const localDatabaseHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function backendMode(environment: Environment = process.env): BackendMode {
  const value = String(environment.SEN_BACKEND ?? "supabase").trim().toLowerCase();
  if (value === "native" || value === "supabase") return value;
  throw new Error("SEN_BACKEND must be either native or supabase.");
}

function required(environment: Environment, key: string) {
  const value = String(environment[key] ?? "").trim();
  if (!value) throw new Error(`${key} is required in native mode.`);
  return value;
}

export function localDatabaseConfig(environment: Environment = process.env): LocalDatabaseConfig {
  if (backendMode(environment) !== "native") {
    throw new Error("Local database configuration is available only in native mode.");
  }

  const databaseUrl = new URL(required(environment, "DATABASE_URL"));
  if (!new Set(["postgres:", "postgresql:"]).has(databaseUrl.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }
  if (!localDatabaseHosts.has(databaseUrl.hostname)) {
    throw new Error("DATABASE_URL must use a local database host on the Windows server.");
  }

  const sessionSecret = required(environment, "SESSION_SECRET");
  if (sessionSecret.length < 48) throw new Error("SESSION_SECRET must contain at least 48 characters.");

  const port = Number(environment.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port.");

  const postgrestUrl = new URL(String(environment.SEN_POSTGREST_URL ?? "http://127.0.0.1:3002"));
  if (!localDatabaseHosts.has(postgrestUrl.hostname)) {
    throw new Error("SEN_POSTGREST_URL must use a loopback host on the Windows server.");
  }

  return {
    databaseUrl,
    sessionSecret,
    dataRoot: required(environment, "SEN_DATA_ROOT"),
    publicOrigin: new URL(required(environment, "SEN_PUBLIC_ORIGIN")),
    postgrestUrl,
    bindHost: String(environment.SEN_BIND_HOST ?? "0.0.0.0").trim() || "0.0.0.0",
    port,
  };
}
