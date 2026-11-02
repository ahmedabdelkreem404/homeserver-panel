// Prints the OWNER_PASSWORD_HASH value for a password read from stdin (so it never appears in a command line):
//   printf '%s' "the password" | node scripts/hash-password.js
import { hashPassword, passwordProblem } from "../src/auth/password.js";

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
const problem = passwordProblem(password);
if (problem) { console.error(problem); process.exit(1); }
process.stdout.write(hashPassword(password) + "\n");
