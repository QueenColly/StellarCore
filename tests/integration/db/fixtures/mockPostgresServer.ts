import net from "node:net";

export type MockServerMode =
  | "NORMAL"
  | "DROP_ON_QUERY"
  | "DROP_ON_COMMIT"
  | "ADMIN_SHUTDOWN"
  | "BLACKHOLE";

export interface MockPostgresServer {
  readonly port: number;
  readonly connectionString: string;
  setMode(mode: MockServerMode): void;
  getActiveConnectionsCount(): number;
  getTotalConnectionsCount(): number;
  getQueryCount(): number;
  simulateCrash(): void;
  close(): Promise<void>;
}

export async function createMockPostgresServer(
  preferredPort = 0,
): Promise<MockPostgresServer> {
  let mode: MockServerMode = "NORMAL";
  const activeSockets = new Set<net.Socket>();
  let totalConnections = 0;
  let queryCount = 0;

  const server = net.createServer((socket) => {
    totalConnections += 1;
    activeSockets.add(socket);

    socket.on("close", () => {
      activeSockets.delete(socket);
    });

    socket.on("data", (data) => {
      if (mode === "BLACKHOLE") {
        // Do not respond at all
        return;
      }

      // Check for SSL request (length = 8, code = 80877103)
      if (data.length === 8 && data.readInt32BE(4) === 80877103) {
        socket.write(Buffer.from("N"));
        return;
      }

      // Check for StartupMessage (protocol version 3.0 = 196608)
      if (data.length > 8 && data.readInt32BE(4) === 196608) {
        if (mode === "ADMIN_SHUTDOWN") {
          sendErrorResponse(socket, "57P01", "FATAL: terminating connection due to administrator command");
          socket.destroy();
          return;
        }

        // AuthenticationOk ('R' + len 8 + code 0)
        const authOk = Buffer.alloc(9);
        authOk.write("R", 0);
        authOk.writeInt32BE(8, 1);
        authOk.writeInt32BE(0, 5);

        // ReadyForQuery ('Z' + len 5 + status 'I')
        const ready = Buffer.alloc(6);
        ready.write("Z", 0);
        ready.writeInt32BE(5, 1);
        ready.write("I", 5);

        socket.write(Buffer.concat([authOk, ready]));
        return;
      }

      // Query message ('Q')
      const type = String.fromCharCode(data[0]);
      if (type === "Q") {
        queryCount += 1;
        const queryText = data.subarray(5, data.length - 1).toString().trim().toUpperCase();

        if (mode === "DROP_ON_QUERY") {
          socket.destroy();
          return;
        }

        if (mode === "ADMIN_SHUTDOWN") {
          sendErrorResponse(socket, "57P01", "FATAL: terminating connection due to administrator command");
          socket.destroy();
          return;
        }

        if (mode === "DROP_ON_COMMIT" && queryText === "COMMIT") {
          // Sever connection mid-commit
          socket.destroy();
          return;
        }

        // Normal query response
        if (queryText === "BEGIN") {
          const cmd = Buffer.from("C\0\0\0\x0aBEGIN\0", "binary");
          const ready = Buffer.from("Z\0\0\0\x05T", "binary");
          socket.write(Buffer.concat([cmd, ready]));
          return;
        }

        if (queryText === "COMMIT") {
          const cmd = Buffer.from("C\0\0\0\x0bCOMMIT\0", "binary");
          const ready = Buffer.from("Z\0\0\0\x05I", "binary");
          socket.write(Buffer.concat([cmd, ready]));
          return;
        }

        if (queryText === "ROLLBACK") {
          const cmd = Buffer.from("C\0\0\0\x0dROLLBACK\0", "binary");
          const ready = Buffer.from("Z\0\0\0\x05I", "binary");
          socket.write(Buffer.concat([cmd, ready]));
          return;
        }

        // Generic SELECT / statement
        const cmd = Buffer.from("C\0\0\0\x0dSELECT 1\0", "binary");
        const ready = Buffer.from("Z\0\0\0\x05I", "binary");
        socket.write(Buffer.concat([cmd, ready]));
      }
    });
  });

  function sendErrorResponse(socket: net.Socket, code: string, message: string) {
    const severityField = Buffer.from("SFATAL\0", "utf8");
    const codeField = Buffer.from(`C${code}\0`, "utf8");
    const msgField = Buffer.from(`M${message}\0`, "utf8");
    const term = Buffer.from("\0", "utf8");

    const payload = Buffer.concat([severityField, codeField, msgField, term]);
    const header = Buffer.alloc(5);
    header.write("E", 0);
    header.writeInt32BE(payload.length + 4, 1);

    socket.write(Buffer.concat([header, payload]));
  }

  await new Promise<void>((resolve) => {
    server.listen(preferredPort, "127.0.0.1", () => resolve());
  });

  const address = server.address() as net.AddressInfo;
  const port = address.port;
  const connectionString = `postgresql://postgres:postgres@127.0.0.1:${port}/testdb?sslmode=disable`;

  return {
    port,
    connectionString,
    setMode(newMode: MockServerMode) {
      mode = newMode;
    },
    getActiveConnectionsCount() {
      return activeSockets.size;
    },
    getTotalConnectionsCount() {
      return totalConnections;
    },
    getQueryCount() {
      return queryCount;
    },
    simulateCrash() {
      for (const socket of activeSockets) {
        socket.destroy();
      }
      activeSockets.clear();
      server.close();
    },
    async close() {
      for (const socket of activeSockets) {
        socket.destroy();
      }
      activeSockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
