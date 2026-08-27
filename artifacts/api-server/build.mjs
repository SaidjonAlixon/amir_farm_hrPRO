import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rm } from "node:fs/promises";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(artifactDir, "../..");

// Resolve build tools from package or hoisted workspace root (Vercel monorepo)
const requireFromPkg = createRequire(path.join(artifactDir, "package.json"));
const requireFromRoot = createRequire(path.join(workspaceRoot, "package.json"));

function resolveDep(name) {
  try {
    return requireFromPkg.resolve(name);
  } catch {
    return requireFromRoot.resolve(name);
  }
}

const { build: esbuild } = await import(pathToFileURL(resolveDep("esbuild")).href);
const esbuildPluginPino = (await import(pathToFileURL(resolveDep("esbuild-plugin-pino")).href))
  .default;

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = requireFromPkg;

/** Map @workspace/* to source files — Vercel often has no package node_modules links */
const workspacePackages = {
  "@workspace/db": path.resolve(workspaceRoot, "lib/db"),
  "@workspace/api-zod": path.resolve(workspaceRoot, "lib/api-zod"),
};

function workspaceResolvePlugin() {
  return {
    name: "workspace-resolve",
    setup(build) {
      build.onResolve({ filter: /^@workspace\// }, (args) => {
        const match = args.path.match(/^(@workspace\/[^/]+)(?:\/(.*))?$/);
        if (!match) return null;
        const pkgDir = workspacePackages[match[1]];
        if (!pkgDir) return null;
        const sub = match[2];
        if (!sub || sub === ".") {
          return { path: path.join(pkgDir, "src/index.ts") };
        }
        if (sub === "schema") {
          return { path: path.join(pkgDir, "src/schema/index.ts") };
        }
        return { path: path.join(pkgDir, "src", `${sub}.ts`) };
      });
    },
  };
}

const sharedExternal = [
  "*.node",
  "sharp",
  "better-sqlite3",
  "sqlite3",
  "canvas",
  "bcrypt",
  "argon2",
  "fsevents",
  "re2",
  "farmhash",
  "xxhash-addon",
  "bufferutil",
  "utf-8-validate",
  "ssh2",
  "cpu-features",
  "dtrace-provider",
  "isolated-vm",
  "lightningcss",
  "pg",
  "pg-native",
  "oracledb",
  "mongodb-client-encryption",
  "nodemailer",
  "handlebars",
  "knex",
  "typeorm",
  "protobufjs",
  "onnxruntime-node",
  "@tensorflow/*",
  "@prisma/client",
  "@mikro-orm/*",
  "@grpc/*",
  "@swc/*",
  "@aws-sdk/*",
  "@azure/*",
  "@opentelemetry/*",
  "@google-cloud/*",
  "@google/*",
  "googleapis",
  "firebase-admin",
  "@parcel/watcher",
  "@sentry/profiling-node",
  "@tree-sitter/*",
  "aws-sdk",
  "classic-level",
  "dd-trace",
  "ffi-napi",
  "grpc",
  "hiredis",
  "kerberos",
  "leveldown",
  "miniflare",
  "mysql2",
  "newrelic",
  "odbc",
  "piscina",
  "realm",
  "ref-napi",
  "rocksdb",
  "sass-embedded",
  "sequelize",
  "serialport",
  "snappy",
  "tinypool",
  "usb",
  "workerd",
  "wrangler",
  "zeromq",
  "zeromq-prebuilt",
  "playwright",
  "puppeteer",
  "puppeteer-core",
  "electron",
];

const banner = {
  js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
};

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: {
      index: path.resolve(artifactDir, "src/index.ts"),
      vercel: path.resolve(artifactDir, "src/vercel.ts"),
    },
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    external: sharedExternal,
    sourcemap: "linked",
    absWorkingDir: workspaceRoot,
    plugins: [workspaceResolvePlugin(), esbuildPluginPino({ transports: ["pino-pretty"] })],
    banner,
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
