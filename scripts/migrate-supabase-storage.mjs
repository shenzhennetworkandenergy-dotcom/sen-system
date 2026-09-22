import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const [baseUrl, serviceKey, dataRoot] = process.argv.slice(2);
if (!baseUrl || !serviceKey || !dataRoot) throw new Error("Supabase URL, service key and data root are required.");
const headers = { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "content-type": "application/json" };
const request = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  return response;
};
const safeTarget = (bucket, name) => {
  const root = resolve(dataRoot, "storage");
  const target = resolve(root, bucket, ...name.split("/"));
  if (!target.startsWith(root + sep)) throw new Error("Unsafe storage object path.");
  return target;
};
const buckets = await (await request(`${baseUrl.replace(/\/$/, "")}/storage/v1/bucket`)).json();
for (const bucket of buckets) {
  let offset = 0;
  while (true) {
    const objects = await (await request(`${baseUrl.replace(/\/$/, "")}/storage/v1/object/list/${encodeURIComponent(bucket.id)}`, {
      method: "POST", body: JSON.stringify({ prefix: "", limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    })).json();
    if (!objects.length) break;
    for (const object of objects) {
      if (!object.id || !object.name) continue;
      const response = await request(`${baseUrl.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucket.id)}/${object.name.split("/").map(encodeURIComponent).join("/")}`);
      const target = safeTarget(bucket.id, object.name);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await response.arrayBuffer()));
    }
    offset += objects.length;
    if (objects.length < 1000) break;
  }
}
console.log("Supabase storage copied to protected local storage.");
