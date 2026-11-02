// All Dokploy access for the rest of the panel goes through here: allowlist, protection policy, audit, scrubbed output.
// Reads are not audited. Every other call (allowed mutation or not) writes exactly one audit row.
import { PanelError, REFUSAL_CODES } from "./errors.js";
import { scrub } from "./redact.js";
import { normalizeApiKeys, normalizeProjects } from "./dokploy-shapes.js";

// Only identifiers and names are described in the audit row; never bodies.
function describeTarget(args) {
  if (!args || typeof args !== "object") return null;
  return Object.entries(args).filter(([k, v]) => /(Id|name)$/.test(k) && typeof v === "string").slice(0, 3).map(([k, v]) => `${k}=${v}`).join(" ") || null;
}

export function createGateway({ client, policy, audit, protectedKeyNames = new Set(), secrets = [] }) {
  async function read(procedure, args) {
    if (!policy.isReadAllowed(procedure)) throw new PanelError("procedure_not_allowed", `The panel does not allow ${procedure}.`);
    return scrub(await client.get(procedure, args), { secrets });
  }

  async function mutate(ctx, procedure, args, { buildBody = a => a, allowInOutput = [] } = {}) {
    const id = audit.begin({ actor: ctx?.actor ?? "unknown", action: procedure, target: describeTarget(args) }); // if this throws, nothing runs
    try {
      const owners = await policy.check(procedure, args);
      const data = await client.post(procedure, await buildBody(args));
      audit.finish(id, "ok", { owners: owners.map(o => o.name) });
      return scrub(data, { allow: allowInOutput, secrets });
    } catch (e) {
      audit.finish(id, REFUSAL_CODES.has(e?.code) ? "refused" : "error", { code: e?.code ?? "internal_error", message: String(e?.message ?? e).slice(0, 300) });
      throw e;
    }
  }

  return {
    read,
    // Generic entry: an allowlisted read, otherwise a mutation (and anything not allowlisted is refused and audited).
    call: (ctx, procedure, args = {}) => (policy.isReadAllowed(procedure) ? read(procedure, args) : mutate(ctx, procedure, args)),
    async listProjects() { return normalizeProjects(await client.get("project.all")); },
    async listApiKeys() { return normalizeApiKeys(await client.get("user.get"), protectedKeyNames); },
    // Always rateLimitEnabled:false (D7). The secret is returned once to the caller and never stored or audited.
    createApiKey(ctx, { name }) {
      return mutate(ctx, "user.createApiKey", { name, rateLimitEnabled: false }, {
        allowInOutput: ["key"],
        buildBody: async args => {
          const session = await client.get("user.session");
          const organizationId = session?.session?.activeOrganizationId ?? session?.activeOrganizationId;
          if (!organizationId) throw new PanelError("upstream_error", "Dokploy did not return an organization for the key.");
          return { ...args, metadata: { organizationId } };
        },
      });
    },
    deleteApiKey: (ctx, { apiKeyId }) => mutate(ctx, "user.deleteApiKey", { apiKeyId }),
  };
}
