import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { calculateOutreach, keepsPublicIdentity } from "../shared/outreach-model.mjs";

const [inputArg, outputArg] = process.argv.slice(2);

if (!inputArg || !outputArg) {
  console.error("用法：node scripts/sanitize-graph.mjs <原始图谱.json> <脱敏图谱.json>");
  process.exit(1);
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const raw = JSON.parse(await readFile(inputPath, "utf8"));

const hash = (value) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

const perturbMetric = (value, id) => {
  const safe = Math.max(0, Number(value) || 0);
  if (!safe) return 0;
  const multiplier = 0.78 + (hash(id) % 4500) / 10000;
  const perturbed = safe * multiplier;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(perturbed)) - 1);
  return Math.max(1, Math.round(perturbed / magnitude) * magnitude);
};

const categoryLabels = {
  image: "图像生成",
  video: "视频生成",
  agent: "智能体产品",
  followed: "AI 创作",
};

const seedNodes = raw.nodes.filter((node) => node.isSeed);
const followedNodes = raw.nodes.filter((node) => !node.isSeed);
const outreachById = new Map(
  followedNodes.map((node) => [String(node.id).toLowerCase(), calculateOutreach(node)]),
);
const publicPriorityIds = new Set(
  followedNodes.filter(keepsPublicIdentity).map((node) => String(node.id).toLowerCase()),
);
const seedAliases = new Map(
  seedNodes.map((node) => [String(node.id).toLowerCase(), String(node.id).toLowerCase()]),
);
let anonymousIndex = 0;
const followedAliases = new Map(
  followedNodes.map((node) => {
    const sourceId = String(node.id).toLowerCase();
    if (publicPriorityIds.has(sourceId)) return [sourceId, sourceId];
    anonymousIndex += 1;
    return [sourceId, `account_${String(anonymousIndex).padStart(4, "0")}`];
  }),
);
const aliases = new Map([...seedAliases, ...followedAliases]);
const aliasOf = (value) => aliases.get(String(value).toLowerCase());

const nodes = raw.nodes.map((node) => {
  const id = aliasOf(node.id);
  if (!id) throw new Error(`找不到节点映射：${node.id}`);
  const category = node.category ?? "followed";
  const categoryLabel = categoryLabels[category] ?? categoryLabels.followed;
  const serial = id.split("_").at(-1);
  const isSeed = Boolean(node.isSeed);
  const outreach = isSeed ? calculateOutreach(node) : outreachById.get(String(node.id).toLowerCase());
  const preserveIdentity = isSeed || outreach?.isPriority;

  if (preserveIdentity) {
    const avatarGroup = isSeed ? "official" : "priority";
    return {
      id,
      userName: node.userName ?? node.id,
      name: node.name ?? node.userName ?? node.id,
      labelZh: node.labelZh ?? null,
      category,
      categories: Array.isArray(node.categories) ? node.categories : [category],
      products: Array.isArray(node.products) ? node.products : [],
      region: node.region ?? null,
      isSeed,
      nodeKind: isSeed ? "seed" : "followed",
      originSeedIds: isSeed ? [] : (node.originSeedIds ?? []).map(aliasOf).filter(Boolean),
      avatar: `/avatars/${avatarGroup}/${id}.jpg`,
      description: node.description ?? `${categoryLabel}${isSeed ? "官方" : "优先候选"}公开账号。`,
      followers: Math.max(0, Number(node.followers) || 0),
      following: Math.max(0, Number(node.following) || 0),
      verified: Boolean(node.verified),
      location: node.location ?? "",
      url: node.url ?? `https://x.com/${node.userName ?? node.id}`,
      dataStatus: isSeed ? "public-official" : "public-priority",
      relationCoverage: node.relationCoverage === "complete" ? "complete" : "not_scanned",
      pagesScanned: Math.max(0, Number(node.pagesScanned) || 0),
      identityScope: isSeed ? "official-public" : "priority-public",
      preservedTier: isSeed ? "CORE" : outreach?.tier,
    };
  }

  return {
    id,
    userName: id,
    name: `创作者账号 ${serial}`,
    labelZh: null,
    category,
    categories: Array.isArray(node.categories) ? node.categories : [category],
    products: [],
    region: null,
    isSeed: false,
    nodeKind: "followed",
    originSeedIds: (node.originSeedIds ?? []).map(aliasOf).filter(Boolean),
    description: `AI creator / ${categoryLabel}方向匿名样本。仅用于关系图谱原型学习。`,
    followers: perturbMetric(node.followers, `${node.id}:followers`),
    following: perturbMetric(node.following, `${node.id}:following`),
    verified: Boolean(node.verified),
    dataStatus: "anonymized",
    relationCoverage: node.relationCoverage === "complete" ? "complete" : "not_scanned",
    pagesScanned: node.pagesScanned ? 1 : 0,
    identityScope: "anonymous",
  };
});

const links = raw.links.map((link, index) => {
  const source = aliasOf(typeof link.source === "object" ? link.source.id : link.source);
  const target = aliasOf(typeof link.target === "object" ? link.target.id : link.target);
  if (!source || !target) throw new Error(`找不到关系映射：${link.id ?? index}`);
  return { id: `relation_${String(index + 1).padStart(4, "0")}`, source, target, type: "following" };
});

const seedAccounts = nodes.filter((node) => node.isSeed).length;
const discoveredAccounts = nodes.length - seedAccounts;
const sharedAccounts = nodes.filter((node) => node.originSeedIds.length > 1).length;
const sAccounts = nodes.filter((node) => node.preservedTier === "S").length;
const aAccounts = nodes.filter((node) => node.preservedTier === "A").length;
const anonymousAccounts = nodes.filter((node) => node.identityScope === "anonymous").length;

const sanitized = {
  generatedAt: raw.generatedAt ?? new Date().toISOString(),
  refreshedAt: new Date().toISOString(),
  source: {
    provider: "Hybrid public-priority learning snapshot",
    status: "snapshot",
    message: "Official, S-tier, and A-tier profiles are retained; lower-tier account identities are removed and exact metrics are perturbed.",
  },
  privacy: {
    level: "hybrid-public-priority",
    officialAccountsPreserved: true,
    priorityTiersPreserved: ["S", "A"],
    sAccountsPreserved: sAccounts,
    aAccountsPreserved: aAccounts,
    nonPriorityIdentifiersRemoved: true,
    officialUrlsRetained: true,
    priorityUrlsRetained: true,
    nonPriorityExternalUrlsRemoved: true,
    externalAvatarsRemoved: true,
    nonPriorityExactMetricsPerturbed: true,
    topologyRetained: true,
  },
  meta: {
    totalAccounts: nodes.length,
    seedAccounts,
    discoveredAccounts,
    sharedAccounts,
    sAccounts,
    aAccounts,
    publicPriorityAccounts: sAccounts + aAccounts,
    anonymousAccounts,
    totalRelationships: links.length,
  },
  nodes,
  links,
};

await writeFile(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
console.log(`脱敏完成：${nodes.length} 个账号，${links.length} 条关系 -> ${outputPath}`);
