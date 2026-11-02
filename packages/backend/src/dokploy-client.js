// The only module that talks HTTP to Dokploy. A timeout on every call; the key is sent in x-api-key and never
// appears in errors. Nothing outside the gateway should call this directly.
import { PanelError, errorFromUpstream } from "./errors.js";

export class DokployClient {
  #key;
  constructor({ url, key, timeoutMs = 10_000, fetchImpl = globalThis.fetch }) {
    this.baseUrl = url.replace(/\/+$/, "");
    this.#key = key;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async request(method, procedure, { query, body, form, timeoutMs = this.timeoutMs } = {}) {
    const url = new URL(`${this.baseUrl}/api/${procedure}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    const headers = { "x-api-key": this.#key };
    if (body !== undefined && !form) headers["content-type"] = "application/json";
    let res;
    try {
      res = await this.fetch(url, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") throw new PanelError("upstream_timeout", `Dokploy did not answer ${procedure} within ${timeoutMs / 1000}s.`, { cause: e });
      throw new PanelError("upstream_unreachable", `Cannot reach Dokploy (${e?.cause?.code ?? "network error"}).`, { cause: e });
    }
    if (!res.ok) throw errorFromUpstream(res.status, procedure);
    const text = await res.text();
    if (text === "") return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  get(procedure, query) { return this.request("GET", procedure, { query }); }
  post(procedure, body) { return this.request("POST", procedure, { body }); }
  // A multipart upload (the build context of a site); it gets a longer timeout than a normal call.
  postForm(procedure, form, timeoutMs = 120_000) { return this.request("POST", procedure, { form, timeoutMs }); }
}
