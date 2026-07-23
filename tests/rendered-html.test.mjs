import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateOutreach } from "../shared/outreach-model.mjs";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished AI Orbit learning shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>AI Orbit Local Lab/);
  assert.match(html, /AI ORBIT/);
  assert.match(html, /LOCAL LEARNING LAB/);
  assert.match(html, /正在校准本地 AI 账号星图/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|SkeletonPreview/);
});

test("keeps the learning algorithms and full snapshot in the project", async () => {
  const [algorithm, snapshotText] = await Promise.all([
    readFile(new URL("../app/graph.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/data/graph.json", import.meta.url), "utf8"),
  ]);
  const snapshot = JSON.parse(snapshotText);
  assert.match(algorithm, /fibonacciDirections/);
  assert.match(algorithm, /placeCommunityCenters/);
  assert.match(algorithm, /placeNodesOnSpheres/);
  assert.equal(snapshot.nodes.length, 1809);
  assert.equal(snapshot.links.length, 2410);
  const officialNodes = snapshot.nodes.filter((node) => node.isSeed);
  const priorityNodes = snapshot.nodes.filter((node) => node.identityScope === "priority-public");
  const anonymousNodes = snapshot.nodes.filter((node) => node.identityScope === "anonymous");
  assert.equal(officialNodes.length, 16);
  assert.equal(snapshot.privacy.level, "hybrid-public-priority");
  assert.equal(snapshot.privacy.officialAccountsPreserved, true);
  assert.deepEqual(snapshot.privacy.priorityTiersPreserved, ["S", "A"]);
  assert.equal(snapshot.privacy.nonPriorityIdentifiersRemoved, true);
  assert.equal(priorityNodes.length, snapshot.meta.publicPriorityAccounts);
  assert.equal(anonymousNodes.length, snapshot.meta.anonymousAccounts);
  assert.ok(officialNodes.every((node) => node.url?.startsWith("https://x.com/") && node.avatar?.startsWith("/avatars/official/")));
  assert.ok(priorityNodes.every((node) => node.url?.startsWith("https://x.com/") && node.avatar?.startsWith("/avatars/priority/")));
  assert.ok(priorityNodes.every((node) => ["S", "A"].includes(node.preservedTier)));
  assert.ok(priorityNodes.every((node) => calculateOutreach(node).tier === node.preservedTier));
  assert.ok(anonymousNodes.every((node) => !node.url && !node.avatar && !node.profilePicture));
  assert.ok(anonymousNodes.every((node) => /^account_\d+$/.test(node.id)));
});
