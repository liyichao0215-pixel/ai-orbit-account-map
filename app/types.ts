export type Category = "image" | "video" | "agent" | "followed";

export type OutreachTier = "CORE" | "S" | "A" | "B" | "C" | "WATCH";

export interface OutreachFactor {
  key: "influence" | "consensus" | "relevance";
  label: string;
  value: number;
  max: number;
}

export interface OutreachScore {
  score: number | null;
  tier: OutreachTier;
  tierLabel: string;
  isPriority: boolean;
  isCandidate: boolean;
  factors: OutreachFactor[];
  fitLabels: string[];
  reasons: string[];
}

export interface OrbitNode {
  id: string;
  userName: string;
  name: string;
  labelZh?: string | null;
  category: Category;
  categories?: Category[];
  products?: string[];
  region?: string | null;
  isSeed: boolean;
  nodeKind: "seed" | "followed";
  originSeedIds: string[];
  avatar?: string;
  profilePicture?: string;
  coverPicture?: string;
  description?: string;
  followers?: number;
  following?: number;
  verified?: boolean;
  location?: string;
  url?: string;
  dataStatus?: string;
  identityScope?: "official-public" | "priority-public" | "anonymous";
  preservedTier?: OutreachTier;
  relationCoverage?: string;
  pagesScanned?: number;
  outreach?: OutreachScore;
  communityId?: string;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

export interface OrbitLink {
  id: string;
  source: string | OrbitNode;
  target: string | OrbitNode;
  type: "following";
}

export interface Community {
  id: string;
  label: string;
  handle: string;
  category: Category;
  nodeIds: string[];
  nodeCount: number;
  radius: number;
  center: { x: number; y: number; z: number };
}

export interface RawGraph {
  generatedAt: string;
  refreshedAt?: string;
  source: {
    provider: string;
    status: "live" | "partial" | "snapshot";
    message: string;
  };
  privacy?: {
    level: "anonymized-demo" | "hybrid-public-officials" | "hybrid-public-priority";
    identifiersRemoved?: boolean;
    externalUrlsRemoved?: boolean;
    exactMetricsPerturbed?: boolean;
    officialAccountsPreserved?: boolean;
    followedIdentifiersRemoved?: boolean;
    officialUrlsRetained?: boolean;
    followedExternalUrlsRemoved?: boolean;
    followedExactMetricsPerturbed?: boolean;
    priorityTiersPreserved?: Array<"S" | "A">;
    sAccountsPreserved?: number;
    aAccountsPreserved?: number;
    nonPriorityIdentifiersRemoved?: boolean;
    priorityUrlsRetained?: boolean;
    nonPriorityExternalUrlsRemoved?: boolean;
    nonPriorityExactMetricsPerturbed?: boolean;
    externalAvatarsRemoved: boolean;
    topologyRetained: boolean;
  };
  meta: Record<string, number>;
  nodes: OrbitNode[];
  links: OrbitLink[];
}

export interface PreparedGraph extends RawGraph {
  communities: Community[];
  communityAffinities: Record<string, number>;
}

export type GraphFilter = "all" | "priority" | "core" | "image" | "video" | "agent";
