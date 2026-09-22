import assert from "node:assert/strict";
import test from "node:test";

import {
  backendMode,
  localDatabaseConfig,
} from "../lib/backend/config.ts";

test("native mode requires a local PostgreSQL URL and session secret", () => {
  assert.throws(
    () => localDatabaseConfig({ SEN_BACKEND: "native" }),
    /DATABASE_URL/i,
  );
  assert.throws(
    () => localDatabaseConfig({
      SEN_BACKEND: "native",
      DATABASE_URL: "mysql://localhost/sen",
      SESSION_SECRET: "x".repeat(48),
    }),
    /PostgreSQL/i,
  );
  assert.throws(
    () => localDatabaseConfig({
      SEN_BACKEND: "native",
      DATABASE_URL: "postgresql://sen:secret@db.example.com/sen",
      SESSION_SECRET: "x".repeat(48),
    }),
    /local database host/i,
  );
});

test("native mode accepts loopback PostgreSQL and normalizes LAN settings", () => {
  const config = localDatabaseConfig({
    SEN_BACKEND: "native",
    DATABASE_URL: "postgresql://sen:secret@127.0.0.1:5432/sen",
    SESSION_SECRET: "a".repeat(48),
    SEN_DATA_ROOT: "D:\\SEN Data",
    SEN_PUBLIC_ORIGIN: "http://192.168.1.20:3000",
    SEN_POSTGREST_URL: "http://127.0.0.1:3002",
    SEN_BIND_HOST: "0.0.0.0",
    PORT: "3000",
  });
  assert.equal(backendMode({ SEN_BACKEND: "native" }), "native");
  assert.equal(config.databaseUrl.hostname, "127.0.0.1");
  assert.equal(config.bindHost, "0.0.0.0");
  assert.equal(config.port, 3000);
  assert.equal(config.publicOrigin.origin, "http://192.168.1.20:3000");
  assert.equal(config.postgrestUrl.origin, "http://127.0.0.1:3002");
});

test("cloud preview mode accepts an isolated managed PostgreSQL host", () => {
  const config = localDatabaseConfig({
    SEN_BACKEND: "native",
    SEN_RUNTIME_SCOPE: "cloud-preview",
    DATABASE_URL: "postgresql://sen_preview:secret@preview-db.internal/sen_preview",
    SESSION_SECRET: "b".repeat(48),
    SEN_DATA_ROOT: "/tmp/sen-data",
    RENDER_EXTERNAL_URL: "https://sen-offline-preview.onrender.com",
    SEN_POSTGREST_URL: "http://127.0.0.1:3002",
    PORT: "10000",
  });
  assert.equal(config.databaseUrl.hostname, "preview-db.internal");
  assert.equal(config.publicOrigin.origin, "https://sen-offline-preview.onrender.com");
  assert.equal(config.postgrestUrl.origin, "http://127.0.0.1:3002");
});

test("Supabase remains an explicit migration-only compatibility mode", () => {
  assert.equal(backendMode({ SEN_BACKEND: "supabase" }), "supabase");
  assert.throws(() => backendMode({ SEN_BACKEND: "unknown" }), /SEN_BACKEND/i);
});
