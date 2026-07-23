import type {
  Community,
  GraphFilter,
  OrbitNode,
  OutreachScore,
  PreparedGraph,
  RawGraph,
} from "./types";
import { calculateOutreach } from "../shared/outreach-model.mjs";

export const nodeId = (value: string | OrbitNode | undefined) =>
  typeof value === "string" ? value.toLowerCase() : String(value?.id ?? "").toLowerCase();

const pairKey = (left: string, right: string) =>
  left < right ? `${left}|${right}` : `${right}|${left}`;

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const scoreOutreach = (node: OrbitNode): OutreachScore =>
  calculateOutreach(node) as OutreachScore;

const fibonacciDirections = (count = 72) => {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / count;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = goldenAngle * index;
    return { x: Math.cos(angle) * radial, y, z: Math.sin(angle) * radial };
  });
};

const sphereRadius = (nodeCount: number) => Math.max(32, Math.sqrt(Math.max(1, nodeCount)) * 6.4);

const communityGap = (left: Community, right: Community) => {
  const scale = Math.sqrt(Math.max(2, left.nodeCount + right.nodeCount));
  return 72 + Math.min(56, scale * 2.4);
};

const placeCommunityCenters = (communities: Community[], affinities: Map<string, number>) => {
  const directions = fibonacciDirections();
  const placed: Community[] = [];
  const affinity = (left: string, right: string) => affinities.get(pairKey(left, right)) ?? 0;

  communities.forEach((community, communityIndex) => {
    if (communityIndex === 0) {
      community.center = { x: 0, y: 0, z: 0 };
      placed.push(community);
      return;
    }

    let best: { x: number; y: number; z: number } | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let expansion = 0; expansion < 6 && !best; expansion += 1) {
      placed.forEach((anchor, anchorIndex) => {
        const distance = community.radius + anchor.radius + communityGap(community, anchor) + expansion * 48;
        directions.forEach((direction, directionIndex) => {
          const candidate = {
            x: anchor.center.x + direction.x * distance,
            y: anchor.center.y + direction.y * distance,
            z: anchor.center.z + direction.z * distance,
          };
          const overlaps = placed.some((other) => {
            const separation = Math.hypot(
              candidate.x - other.center.x,
              candidate.y - other.center.y,
              candidate.z - other.center.z,
            );
            return separation < community.radius + other.radius + communityGap(community, other) - 0.01;
          });
          if (overlaps) return;

          const relationshipPull = placed.reduce((total, other) => {
            const separation = Math.hypot(
              candidate.x - other.center.x,
              candidate.y - other.center.y,
              candidate.z - other.center.z,
            );
            return total + (affinity(community.id, other.id) * 4_200) / Math.max(1, separation);
          }, 0);
          const radialPenalty = Math.hypot(candidate.x, candidate.y, candidate.z) * 0.032;
          const tieBreak = (anchorIndex * directions.length + directionIndex) * 0.0000001;
          const score = relationshipPull - radialPenalty - tieBreak;
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        });
      });
    }

    community.center = best ?? {
      x: (communityIndex + 1) * (community.radius + 96),
      y: 0,
      z: 0,
    };
    placed.push(community);
  });
};

const buildCommunities = (graph: RawGraph) => {
  const seeds = graph.nodes.filter((node) => node.isSeed);
  const seedIds = new Set(seeds.map((node) => node.id));
  const seedFollowing = new Map(seeds.map((seed) => [seed.id, new Set<string>()]));
  const originsByNode = new Map<string, string[]>();

  graph.links.forEach((link) => {
    const source = nodeId(link.source);
    const target = nodeId(link.target);
    if (!seedIds.has(source)) return;
    seedFollowing.get(source)?.add(target);
    const origins = originsByNode.get(target) ?? [];
    origins.push(source);
    originsByNode.set(target, origins);
  });

  const seedAffinities = new Map<string, number>();
  for (let leftIndex = 0; leftIndex < seeds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < seeds.length; rightIndex += 1) {
      const left = seeds[leftIndex].id;
      const right = seeds[rightIndex].id;
      const leftFollowing = seedFollowing.get(left) ?? new Set<string>();
      const rightFollowing = seedFollowing.get(right) ?? new Set<string>();
      let shared = 0;
      leftFollowing.forEach((id) => {
        if (rightFollowing.has(id)) shared += 1;
      });
      seedAffinities.set(pairKey(left, right), shared);
    }
  }

  const assignment = new Map(seeds.map((seed) => [seed.id, seed.id]));
  const assignedCounts = new Map(seeds.map((seed) => [seed.id, 1]));

  graph.nodes
    .filter((node) => !node.isSeed)
    .toSorted((left, right) => stableHash(left.id) - stableHash(right.id) || left.id.localeCompare(right.id))
    .forEach((node) => {
      const origins = [...new Set((node.originSeedIds?.length ? node.originSeedIds : originsByNode.get(node.id) ?? []))]
        .map((id) => id.toLowerCase())
        .filter((id) => seedIds.has(id));

      if (!origins.length) {
        const fallback = seeds[0]?.id ?? "unmapped";
        assignment.set(node.id, fallback);
        assignedCounts.set(fallback, (assignedCounts.get(fallback) ?? 0) + 1);
        return;
      }

      const winner = origins
        .map((candidate) => ({
          id: candidate,
          affinity: origins.reduce(
            (total, origin) => total + (origin === candidate ? 0 : seedAffinities.get(pairKey(candidate, origin)) ?? 0),
            0,
          ),
          assignedCount: assignedCounts.get(candidate) ?? 0,
        }))
        .toSorted(
          (left, right) =>
            right.affinity - left.affinity || left.assignedCount - right.assignedCount || left.id.localeCompare(right.id),
        )[0].id;

      assignment.set(node.id, winner);
      assignedCounts.set(winner, (assignedCounts.get(winner) ?? 0) + 1);
    });

  const groupedNodes = new Map(seeds.map((seed) => [seed.id, [] as OrbitNode[]]));
  graph.nodes.forEach((node) => {
    const communityId = assignment.get(node.id) ?? seeds[0]?.id ?? "unmapped";
    node.communityId = communityId;
    const group = groupedNodes.get(communityId) ?? [];
    group.push(node);
    groupedNodes.set(communityId, group);
  });

  const seedById = new Map(seeds.map((seed) => [seed.id, seed]));
  const communities = [...groupedNodes.entries()]
    .map(([id, nodes]) => {
      const seed = seedById.get(id);
      return {
        id,
        label: seed?.labelZh ?? seed?.name ?? id,
        handle: seed?.userName ?? id,
        category: seed?.category ?? "followed",
        nodeIds: nodes.map((node) => node.id),
        nodeCount: nodes.length,
        radius: sphereRadius(nodes.length),
        center: { x: 0, y: 0, z: 0 },
      } satisfies Community;
    })
    .toSorted((left, right) => right.nodeCount - left.nodeCount || left.id.localeCompare(right.id));

  const crossCommunityAffinities = new Map<string, number>();
  graph.links.forEach((link) => {
    const sourceCommunity = assignment.get(nodeId(link.source));
    const targetCommunity = assignment.get(nodeId(link.target));
    if (!sourceCommunity || !targetCommunity || sourceCommunity === targetCommunity) return;
    const key = pairKey(sourceCommunity, targetCommunity);
    crossCommunityAffinities.set(key, (crossCommunityAffinities.get(key) ?? 0) + 1);
  });

  placeCommunityCenters(communities, crossCommunityAffinities);
  return { communities, assignment, crossCommunityAffinities };
};

const placeNodesOnSpheres = (graph: RawGraph, communities: Community[]) => {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  communities.forEach((community) => {
    const ids = [...community.nodeIds].sort(
      (left, right) => stableHash(left) - stableHash(right) || left.localeCompare(right),
    );
    ids.forEach((id, index) => {
      const node = nodeById.get(id);
      if (!node) return;
      const y = 1 - (2 * (index + 0.5)) / ids.length;
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = goldenAngle * index;
      const position = {
        x: community.center.x + Math.cos(angle) * radial * community.radius,
        y: community.center.y + y * community.radius,
        z: community.center.z + Math.sin(angle) * radial * community.radius,
      };
      Object.assign(node, position, {
        fx: position.x,
        fy: position.y,
        fz: position.z,
        communityId: community.id,
      });
    });
  });
};

export const prepareGraph = (raw: RawGraph): PreparedGraph => {
  const graph: RawGraph = {
    ...raw,
    nodes: raw.nodes.map((node) => ({
      ...node,
      id: node.id.toLowerCase(),
      originSeedIds: (node.originSeedIds ?? []).map((id) => id.toLowerCase()),
    })),
    links: raw.links.map((link) => ({
      ...link,
      source: nodeId(link.source),
      target: nodeId(link.target),
    })),
  };
  graph.nodes.forEach((node) => {
    node.outreach = scoreOutreach(node);
  });
  const { communities, crossCommunityAffinities } = buildCommunities(graph);
  placeNodesOnSpheres(graph, communities);

  return {
    ...graph,
    communities,
    communityAffinities: Object.fromEntries(crossCommunityAffinities),
  };
};

export const filterGraph = (graph: PreparedGraph, filter: GraphFilter) => {
  if (filter === "all") return { nodes: graph.nodes, links: graph.links };

  if (filter === "priority") {
    const priorityIds = new Set(graph.nodes.filter((node) => node.outreach?.isPriority).map((node) => node.id));
    const links = graph.links.filter((link) => priorityIds.has(nodeId(link.target)));
    const visibleIds = new Set(priorityIds);
    links.forEach((link) => visibleIds.add(nodeId(link.source)));
    return { nodes: graph.nodes.filter((node) => visibleIds.has(node.id)), links };
  }

  const seedIds = new Set(
    graph.nodes
      .filter(
        (node) =>
          node.isSeed &&
          (filter === "core" || (node.categories ?? [node.category]).includes(filter)),
      )
      .map((node) => node.id),
  );
  const links = graph.links.filter((link) => {
    const source = nodeId(link.source);
    const target = nodeId(link.target);
    return filter === "core" ? seedIds.has(source) && seedIds.has(target) : seedIds.has(source);
  });
  const visibleIds = new Set(seedIds);
  links.forEach((link) => visibleIds.add(nodeId(link.target)));
  return { nodes: graph.nodes.filter((node) => visibleIds.has(node.id)), links };
};

export const formatCompact = (value?: number) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value ?? 0)
    : "—";

export const avatarUrl = (node: OrbitNode) => {
  if (node.avatar?.startsWith("data:") || node.avatar?.startsWith("/")) return node.avatar;
  if (node.profilePicture?.startsWith("data:")) return node.profilePicture;

  const color = node.isSeed
    ? "#7ee8cf"
    : node.category === "image"
      ? "#95b8ff"
      : node.category === "video"
        ? "#c29cff"
        : node.category === "agent"
          ? "#ffb783"
          : "#728086";
  const label = node.isSeed ? "CORE" : node.userName.split("_").at(-1)?.slice(-2) ?? "AI";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#111821"/><circle cx="64" cy="64" r="57" fill="none" stroke="${color}" stroke-opacity=".55" stroke-width="2"/><circle cx="64" cy="64" r="42" fill="${color}" fill-opacity=".1"/><text x="64" y="70" text-anchor="middle" fill="${color}" font-family="Arial,sans-serif" font-size="${node.isSeed ? 19 : 28}" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
