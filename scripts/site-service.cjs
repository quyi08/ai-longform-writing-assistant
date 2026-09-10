const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const defaultCwd = path.resolve(__dirname, "..");
const defaultPort = Number(process.env.PORT || 3000);
const defaultHost = process.env.HOST || "127.0.0.1";

function createHealthUrl(port = defaultPort, host = "127.0.0.1") {
  const healthHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return `http://${healthHost}:${port}/`;
}

function createStartCommand({ cwd = defaultCwd, port = defaultPort, host = defaultHost } = {}) {
  return {
    command: process.execPath,
    args: [
      path.join(cwd, "node_modules", "next", "dist", "bin", "next"),
      "start",
      "-p",
      String(port),
      "-H",
      host,
    ],
    options: {
      cwd,
      windowsHide: true,
    },
  };
}

function checkServer(port = defaultPort, timeoutMs = 2500, host = defaultHost) {
  return new Promise((resolve) => {
    const request = http.get(createHealthUrl(port, host), (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(port = defaultPort, timeoutMs = 60000, host = defaultHost) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await checkServer(port, 2500, host)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

function ensureLogDir(cwd = defaultCwd) {
  const logDir = path.join(cwd, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  return logDir;
}

function startServer({ cwd = defaultCwd, port = defaultPort, host = defaultHost, stdio = "inherit" } = {}) {
  const startCommand = createStartCommand({ cwd, port, host });

  const child = spawn(startCommand.command, startCommand.args, {
    ...startCommand.options,
    stdio,
  });

  return child;
}

async function runForeground() {
  const cwd = defaultCwd;
  const port = defaultPort;
  const host = defaultHost;

  if (await checkServer(port, 2500, host)) {
    console.log(`already running ${createHealthUrl(port, host)}`);
    return;
  }

  const child = startServer({ cwd, port, host });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
      return;
    }
    process.exit(code ?? 0);
  });
}

if (require.main === module) {
  const command = process.argv[2] || "run";

  if (command === "status") {
    checkServer(defaultPort, 2500, defaultHost).then((isReady) => {
      console.log(isReady ? `ready ${createHealthUrl(defaultPort, defaultHost)}` : "not running");
      process.exitCode = isReady ? 0 : 1;
    });
  } else if (command === "run") {
    runForeground().catch((error) => {
      ensureLogDir(defaultCwd);
      fs.appendFileSync(
        path.join(defaultCwd, "logs", "site-service.err.log"),
        `${new Date().toISOString()} ${error.stack || error}\n`,
      );
      process.exitCode = 1;
    });
  } else {
    console.error(`unknown command: ${command}`);
    process.exitCode = 2;
  }
}

module.exports = {
  checkServer,
  createHealthUrl,
  createStartCommand,
  runForeground,
  startServer,
  waitForServer,
};
