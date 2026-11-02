// Logger options for Fastify (pino): header and field redaction by pino, plus a stream that removes every known
// secret VALUE from each serialized line, wherever it appears.
import { Writable } from "node:stream";
import { REDACTED, redactString } from "./redact.js";

export function createRedactingStream(secrets, destination = process.stdout) {
  return new Writable({
    write(chunk, _enc, cb) { destination.write(redactString(chunk.toString("utf8"), secrets)); cb(); },
  });
}

export function createLoggerOptions({ level, secrets, destination }) {
  return {
    level,
    stream: createRedactingStream(secrets, destination),
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "req.headers['x-api-key']", "res.headers['set-cookie']", "*.password", "*.token", "*.secret", "*.key", "*.apiKey", "*.env"],
      censor: REDACTED,
    },
  };
}
