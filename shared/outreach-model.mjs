const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const outreachPolicy = {
  minimumFollowers: 2_000,
  maximumFollowers: 5_000_000,
  minimumRelevance: 8,
  influenceWeight: 45,
  consensusWeight: 35,
  relevanceWeight: 20,
  sThreshold: 75,
  aThreshold: 65,
  bThreshold: 55,
};

export const relevanceSignals = [
  {
    label: "AI 相关",
    points: 9,
    pattern:
      /\b(ai|artificial intelligence|machine learning|ml|generative|llm|diffusion|neural|model)\b|人工智能|生成式|大模型/i,
  },
  {
    label: "创作人",
    points: 8,
    pattern:
      /\b(creator|creative|design|designer|artist|art|film|video|vfx|animation|3d|cinema|photography|director)\b|创作者|设计|艺术|视频|导演|动画/i,
  },
  {
    label: "行业建设者",
    points: 5,
    pattern:
      /\b(research|founder|builder|product|engineer|developer|studio|startup)\b|研究|创始人|工程师|工作室/i,
  },
];

export const calculateOutreach = (node) => {
  if (node.isSeed) {
    return {
      score: null,
      tier: "CORE",
      tierLabel: "核心官号",
      isPriority: false,
      isCandidate: false,
      factors: [],
      fitLabels: [],
      reasons: [],
    };
  }

  const followers = Math.max(0, Number(node.followers) || 0);
  const consensusCount = Math.max(0, node.originSeedIds?.length ?? 0);
  const profileText = `${node.name ?? ""} ${node.description ?? ""}`;
  const signals = relevanceSignals.filter((signal) => signal.pattern.test(profileText));
  const influence = Math.round(
    clamp(Math.log10(followers + 1) / 7, 0, 1) * outreachPolicy.influenceWeight,
  );
  const consensus = Math.round(
    (Math.min(consensusCount, 4) / 4) * outreachPolicy.consensusWeight,
  );
  const relevance = Math.min(
    outreachPolicy.relevanceWeight,
    signals.reduce((total, signal) => total + signal.points, 0),
  );
  const score = influence + consensus + relevance;
  const qualified =
    followers >= outreachPolicy.minimumFollowers &&
    followers <= outreachPolicy.maximumFollowers &&
    relevance >= outreachPolicy.minimumRelevance;
  const tier = qualified
    ? score >= outreachPolicy.sThreshold
      ? "S"
      : score >= outreachPolicy.aThreshold
        ? "A"
        : score >= outreachPolicy.bThreshold
          ? "B"
          : "C"
    : "WATCH";
  const tierLabels = {
    S: "立即建联",
    A: "优先跟进",
    B: "重点观察",
    C: "普通候选",
    WATCH:
      followers > outreachPolicy.maximumFollowers
        ? "战略大号"
        : relevance < outreachPolicy.minimumRelevance
          ? "相关性待核"
          : "潜力观察",
  };

  return {
    score,
    tier,
    tierLabel: tierLabels[tier],
    isPriority: tier === "S" || tier === "A",
    isCandidate: tier === "S" || tier === "A" || tier === "B",
    factors: [
      { key: "influence", label: "粉丝影响力", value: influence, max: outreachPolicy.influenceWeight },
      { key: "consensus", label: "品牌共识", value: consensus, max: outreachPolicy.consensusWeight },
      { key: "relevance", label: "内容匹配", value: relevance, max: outreachPolicy.relevanceWeight },
    ],
    fitLabels: signals.map((signal) => signal.label),
    reasons: [
      consensusCount > 1 ? `${consensusCount} 个核心品牌共同关注` : "1 个核心品牌关注",
      followers >= 10_000 ? "具备稳定传播规模" : "适合小范围试联",
      ...signals.slice(0, 2).map((signal) => signal.label),
    ],
  };
};

export const keepsPublicIdentity = (node) => {
  if (node.isSeed) return true;
  const tier = calculateOutreach(node).tier;
  return tier === "S" || tier === "A";
};
