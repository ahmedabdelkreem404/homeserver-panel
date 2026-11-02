// Shared Postgres: one Dokploy service for every project, one database and one role per project inside it.
// Everything that reaches SQL or a shell is validated here first, and SQL travels over stdin so passwords never sit in a command line.
import { HsError } from "./errors.js";

export const SHARED_PROJECT = "shared-services";
export const SHARED_SERVICE = "shared-postgres";

export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const IDENT = /^[a-z0-9_]{1,48}$/;
const DOCKER_NAME = /^[a-zA-Z0-9._-]{1,63}$/;
const HEX = /^[a-f0-9]{16,64}$/;

// One database and role per (Dokploy project, app): two projects can both have an app called "web".
export function sharedNames(project, app) {
  const base = `${slug(project)}_${slug(app)}`.slice(0, 40).replace(/_+$/, "");
  const database = `${base}_db`, role = `${base}_user`;
  if (!IDENT.test(database) || !IDENT.test(role)) throw new HsError("usage", `Cannot derive safe database names from "${project}" / "${app}".`);
  return { database, role };
}

const check = (value, pattern, what) => { if (!pattern.test(value)) throw new HsError("failed", `Refusing to use an unsafe ${what}.`); return value; };

export function provisionSql({ database, role, password }) {
  check(database, IDENT, "database name"); check(role, IDENT, "role name"); check(password, HEX, "password");
  return [
    `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE "${role}" LOGIN; END IF; END $$;`,
    `ALTER ROLE "${role}" WITH LOGIN PASSWORD '${password}';`,
    `SELECT 'CREATE DATABASE "${database}" OWNER "${role}"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${database}')\\gexec`,
    `REVOKE ALL ON DATABASE "${database}" FROM PUBLIC;`,
    "",
  ].join("\n");
}

// Drops only a database that this role owns, then the role. Anything else is left alone.
export function dropSql({ database, role }) {
  check(database, IDENT, "database name"); check(role, IDENT, "role name");
  return [
    `SELECT 'DROP DATABASE "${database}" WITH (FORCE)' FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE d.datname = '${database}' AND r.rolname = '${role}'\\gexec`,
    `SELECT 'DROP ROLE "${role}"' FROM pg_roles WHERE rolname = '${role}' AND NOT EXISTS (SELECT FROM pg_database d WHERE d.datdba = pg_roles.oid)\\gexec`,
    "",
  ].join("\n");
}

// The remote command that feeds stdin to psql inside the shared container (local socket, so no password is needed).
export function psqlCommand(appName, superUser) {
  check(appName, DOCKER_NAME, "container name"); check(superUser, DOCKER_NAME, "database user");
  return `docker exec -i "$(docker ps -q --filter name=${appName} | head -n 1)" psql -U ${superUser} -d postgres -v ON_ERROR_STOP=1 -q`;
}
