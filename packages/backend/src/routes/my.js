// A hosting account's own space. Every route resolves the tenant from the signed-in user, never from the request.
import { PanelError } from "../errors.js";
import { MAX_UPLOAD_BYTES } from "../services/sites.js";

const body = req => (req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {});
const at = permission => ({ config: { access: "full", permission } });

export function registerMyRoutes(app, { hosting, accounts, sites, baseDomain }) {
  // A project arrives as the raw body of the request (a zip): no multipart parser and no extra dependency. The size cap
  // is enforced by the server before the body is buffered.
  app.addContentTypeParser(["application/zip", "application/x-zip-compressed", "application/octet-stream"], { parseAs: "buffer", bodyLimit: MAX_UPLOAD_BYTES }, (req, payload, done) => done(null, payload));

  const tenantId = req => {
    const id = req.auth.user.tenant_id;
    if (!id) throw new PanelError("forbidden", "This account has no hosting space.");
    return id;
  };
  const ctx = req => ({ actor: req.auth.user.email, userId: req.auth.user.id });

  // The account name and the base domain let the page show the address a new site would get.
  app.get("/api/my/overview", at("my.read"), async req => ({ ...(await hosting.overview(tenantId(req), accounts.quotaOf(tenantId(req)))), account: accounts.tenantInfo(tenantId(req)), baseDomain }));
  app.get("/api/my/sites", at("my.read"), async req => ({ sites: await hosting.sites(tenantId(req), { fresh: req.query?.fresh === "1" }) }));
  app.get("/api/my/sites/:id/state", at("my.read"), async req => hosting.state(tenantId(req), req.params.id));
  app.get("/api/my/sites/:id/logs", at("my.read"), async req => hosting.logs(tenantId(req), { applicationId: req.params.id, type: req.query?.type, tail: req.query?.tail, since: req.query?.since }));
  const zipOf = req => (Buffer.isBuffer(req.body) ? req.body : null);
  const templateOf = req => (typeof req.query?.template === "string" && req.query.template ? req.query.template : undefined);
  // Creating a site is a background job (a build can take minutes): the answer is a job id, and the page asks for its state.
  app.post("/api/my/sites", { ...at("my.create"), bodyLimit: MAX_UPLOAD_BYTES }, async (req, reply) => {
    const job = await sites.createSite(ctx(req), tenantId(req), { name: req.query?.name, template: templateOf(req), zip: zipOf(req) });
    return reply.code(202).send(job);
  });
  app.post("/api/my/sites/inspect", { ...at("my.create"), bodyLimit: MAX_UPLOAD_BYTES }, async req => sites.inspect(tenantId(req), { zip: zipOf(req), template: templateOf(req) }));
  app.get("/api/my/jobs/:id", at("my.read"), async req => sites.job(tenantId(req), req.params.id));
  app.post("/api/my/sites/:id/actions", at("my.manage"), async req => hosting.action(ctx(req), tenantId(req), req.params.id, body(req).action));
  app.delete("/api/my/sites/:id", at("my.delete"), async req => hosting.deleteSite(ctx(req), tenantId(req), { applicationId: req.params.id, confirmName: body(req).confirmName }));
}
