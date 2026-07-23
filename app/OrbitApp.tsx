"use client";

/* eslint-disable @next/next/no-img-element -- 官号头像保存在本地，匿名头像使用 data URL。 */

import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Code2,
  Crosshair,
  Database,
  Download,
  Expand,
  Maximize2,
  PlayCircle,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ForceGraphMethods } from "react-force-graph-3d";
import * as THREE from "three";
import { avatarUrl, filterGraph, formatCompact, nodeId, prepareGraph, publicAssetUrl } from "./graph";
import type {
  Community,
  GraphFilter,
  OrbitLink,
  OrbitNode,
  PreparedGraph,
  RawGraph,
} from "./types";

const COLORS = {
  background: "#070a0f",
  signal: "#7ee8cf",
  signalStrong: "#9cf0dc",
  muted: "#52606d",
  node: "#91a2a9",
};

const filterLabels: Record<GraphFilter, string> = {
  all: "全部",
  priority: "S/A 优先核验",
  core: "核心官号",
  image: "图像",
  video: "视频",
  agent: "Agent 产品",
};

const learningSteps = [
  {
    phase: "01 · 问题定义",
    title: "先确定看板替谁做什么决定",
    question: "运营同学面对很多账号时，下一步应该优先研究或建联谁？",
    output: "产出：用户故事、使用场景和不做清单",
    insight: "3D 不是目标，它只是帮助发现社区、共同关注和异常节点的表达方式。",
  },
  {
    phase: "02 · 数据原型",
    title: "把账号与关注关系变成图数据",
    question: "一个账号需要哪些字段？一条关注关系如何表达？哪些字段必须脱敏？",
    output: "产出：Node / Link 字段表与隐私规则",
    insight: "本项目保留官方账号和 S/A 级候选身份；B 级及以下移除身份与外链，只保留拓扑和扰动指标。",
  },
  {
    phase: "03 · 关系算法",
    title: "从连接数变成可解释的优先级",
    question: "共同被几个核心官号关注、影响力和内容相关性，如何组成一个可解释分数？",
    output: "产出：评分卡、权重假设和反例",
    insight: "先过 2,000–500 万粉且相关性至少 8 分的门槛，再按影响力 45、品牌共识 35、内容匹配 20 加权；S≥75，A≥65。",
  },
  {
    phase: "04 · 空间与交互",
    title: "让 3D 布局服务信息查找",
    question: "球形社区、颜色、大小、曲线和镜头分别承担什么信息任务？",
    output: "产出：信息架构、交互流程和低保真原型",
    insight: "社区决定球，Fibonacci Sphere 决定节点分布，曲线只表达真实关系。",
  },
  {
    phase: "05 · MVP 验收",
    title: "证明它能帮助决策，而不只是好看",
    question: "用户能否更快找到共同关注账号，并解释为什么它值得跟进？",
    output: "产出：任务成功率、决策时间和解释准确率",
    insight: "MVP 先验证找人和解释，再考虑实时抓取、协作和自动建联。",
  },
] as const;

const demoSteps = [
  {
    phase: "01 / 05 · 问题",
    title: "从 1,809 个账号里更快找到值得人工核验的人",
    body: "这个原型把 16 个 AI 官号的公开关注关系放进同一张 3D 图，先看生态结构，再看共同关注信号。",
    action: "查看全局关系",
  },
  {
    phase: "02 / 05 · 初筛",
    title: "只看 125 个公开 S/A 候选",
    body: "S/A 来自脱敏前锁定的可解释评分；匿名字段永远不会被二次打分。筛选后仍保留关联官号作为上下文。",
    action: "切换 S/A 视图",
  },
  {
    phase: "03 / 05 · 证据",
    title: "用 INK 演示为什么它排在前面",
    body: "INK 得分 88，受到 5 个核心官号共同关注。详情卡拆出影响力、品牌共识与内容匹配，便于复核而非盲信。",
    action: "聚焦 INK",
  },
  {
    phase: "04 / 05 · 行动",
    title: "把判断写回运营清单",
    body: "候选可以加入本机清单，补充负责人、状态、备注和下一步动作，并导出 CSV。这里不自动触达任何账号。",
    action: "打开运营清单",
  },
  {
    phase: "05 / 05 · 边界",
    title: "这是决策原型，不是业务结论",
    body: "评分是待验证的产品假设；快照不是实时数据；真人可用性测试仍需线下执行。代码、规则与限制都公开在 GitHub。",
    action: "完成演示",
  },
] as const;

const shortlistStatuses = [
  "待身份核验",
  "待内容复核",
  "待建联",
  "已触达",
  "已回复",
  "合作中",
  "不合适",
  "继续观察",
] as const;

type ShortlistStatus = (typeof shortlistStatuses)[number];

interface ShortlistItem {
  nodeId: string;
  owner: string;
  status: ShortlistStatus;
  note: string;
  nextAction: string;
  updatedAt: string;
}

const shortlistStorageKey = "ai-orbit-shortlist-v1";

type ForceGraphComponent = typeof import("react-force-graph-3d").default;

const ringTextureCache = new Map<string, THREE.CanvasTexture>();
const textTextureCache = new Map<string, THREE.CanvasTexture>();

const makeRingTexture = (color: string, opacity: number) => {
  const key = `${color}-${opacity}`;
  const cached = ringTextureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, 256, 256);
    context.strokeStyle = color;
    context.globalAlpha = opacity;
    context.lineWidth = 7;
    context.beginPath();
    context.arc(128, 128, 116, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = opacity * 0.42;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(128, 128, 126, 0, Math.PI * 2);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  ringTextureCache.set(key, texture);
  return texture;
};

const makeTextSprite = (text: string, accent = false, scale = 1) => {
  const key = `${text}-${accent}-${scale}`;
  let texture = textTextureCache.get(key);
  if (!texture) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, 512, 96);
      context.fillStyle = "rgba(7, 10, 15, 0.82)";
      context.roundRect(5, 10, 502, 76, 12);
      context.fill();
      context.font = `${accent ? 600 : 500} 28px Sora, sans-serif`;
      context.fillStyle = accent ? COLORS.signal : "#dbe5e8";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text.slice(0, 34), 256, 49);
    }
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textTextureCache.set(key, texture);
  }
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(46 * scale, 8.5 * scale, 1);
  sprite.renderOrder = 30;
  return sprite;
};

const useStageSize = () => {
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : Math.max(320, window.innerWidth),
    height: typeof window === "undefined" ? 720 : Math.max(360, window.innerHeight),
  }));

  useLayoutEffect(() => {
    if (!ref.current) return;
    const update = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    const observer = new ResizeObserver(update);
    update();
    observer.observe(ref.current);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return [ref, size] as const;
};

const getPosition = (node: OrbitNode) => ({
  x: node.x ?? node.fx ?? 0,
  y: node.y ?? node.fy ?? 0,
  z: node.z ?? node.fz ?? 0,
});

const makeSphereArc = (source: OrbitNode, target: OrbitNode, community: Community) => {
  const from = new THREE.Vector3(
    (source.x ?? 0) - community.center.x,
    (source.y ?? 0) - community.center.y,
    (source.z ?? 0) - community.center.z,
  ).normalize();
  const to = new THREE.Vector3(
    (target.x ?? 0) - community.center.x,
    (target.y ?? 0) - community.center.y,
    (target.z ?? 0) - community.center.z,
  ).normalize();
  const steps = 22;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    const direction = from.clone().lerp(to, progress).normalize();
    return direction.multiplyScalar(community.radius + 2.4).add(
      new THREE.Vector3(community.center.x, community.center.y, community.center.z),
    );
  });
};

const makeCrossArc = (source: OrbitNode, target: OrbitNode) => {
  const from = new THREE.Vector3(source.x ?? 0, source.y ?? 0, source.z ?? 0);
  const to = new THREE.Vector3(target.x ?? 0, target.y ?? 0, target.z ?? 0);
  const midpoint = from.clone().add(to).multiplyScalar(0.5);
  const normal = midpoint.lengthSq() > 0 ? midpoint.clone().normalize() : new THREE.Vector3(0, 1, 0);
  const control = midpoint.add(normal.multiplyScalar(Math.max(48, from.distanceTo(to) * 0.2)));
  return new THREE.QuadraticBezierCurve3(from, control, to).getPoints(28);
};

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach((material) => material.dispose());
  });
};

export function OrbitApp() {
  const graphRef = useRef<ForceGraphMethods<OrbitNode, OrbitLink> | undefined>(undefined);
  const [stageRef, stageSize] = useStageSize();
  const [graph, setGraph] = useState<PreparedGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<GraphFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [radarOpen, setRadarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortMode, setSortMode] = useState<"priority" | "consensus" | "reach">("priority");
  const [fullscreen, setFullscreen] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false);
  const [learningStep, setLearningStep] = useState(0);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [shortlistOpen, setShortlistOpen] = useState(false);
  const [shortlist, setShortlist] = useState<ShortlistItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem(shortlistStorageKey);
      return stored ? (JSON.parse(stored) as ShortlistItem[]) : [];
    } catch {
      return [];
    }
  });
  const [activeShortlistId, setActiveShortlistId] = useState<string | null>(null);
  const [ForceGraph3D, setForceGraph3D] = useState<ForceGraphComponent | null>(null);

  useEffect(() => {
    let active = true;
    import("react-force-graph-3d").then((module) => {
      if (active) setForceGraph3D(() => module.default);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(publicAssetUrl("/data/graph.json"), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取本地图谱快照");
        return (await response.json()) as RawGraph;
      })
      .then((raw) => setGraph(prepareGraph(raw)))
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(shortlistStorageKey, JSON.stringify(shortlist));
  }, [shortlist]);

  const visibleGraph = useMemo(
    () => (graph ? filterGraph(graph, filter) : { nodes: [] as OrbitNode[], links: [] as OrbitLink[] }),
    [graph, filter],
  );
  const nodeById = useMemo(() => new Map((graph?.nodes ?? []).map((node) => [node.id, node])), [graph]);
  const communityById = useMemo(
    () => new Map((graph?.communities ?? []).map((community) => [community.id, community])),
    [graph],
  );
  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
  const activeShortlistItem = activeShortlistId
    ? shortlist.find((item) => item.nodeId === activeShortlistId) ?? null
    : null;
  const activeShortlistNode = activeShortlistItem
    ? nodeById.get(activeShortlistItem.nodeId) ?? null
    : null;

  const connectedIds = useMemo(() => {
    if (!graph || !selectedId) return new Set<string>();
    const result = new Set([selectedId]);
    graph.links.forEach((link) => {
      const source = nodeId(link.source);
      const target = nodeId(link.target);
      if (source === selectedId) result.add(target);
      if (target === selectedId) result.add(source);
    });
    return result;
  }, [graph, selectedId]);

  const candidates = useMemo(
    () =>
      (graph?.nodes ?? [])
        .filter((node) => node.outreach?.isPriority && node.identityScope === "priority-public")
        .toSorted(
          (left, right) =>
            (right.outreach?.score ?? 0) - (left.outreach?.score ?? 0) ||
            right.originSeedIds.length - left.originSeedIds.length ||
            (right.followers ?? 0) - (left.followers ?? 0),
        ),
    [graph],
  );

  const sortedCandidates = useMemo(() => {
    if (sortMode === "consensus") {
      return candidates.toSorted(
        (left, right) =>
          right.originSeedIds.length - left.originSeedIds.length ||
          (right.outreach?.score ?? 0) - (left.outreach?.score ?? 0),
      );
    }
    if (sortMode === "reach") {
      return candidates.toSorted(
        (left, right) =>
          (right.followers ?? 0) - (left.followers ?? 0) ||
          (right.outreach?.score ?? 0) - (left.outreach?.score ?? 0),
      );
    }
    return candidates;
  }, [candidates, sortMode]);

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || !graph) return [];
    return graph.nodes
      .filter((node) =>
        [node.name, node.userName, node.labelZh]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(term)),
      )
      .slice(0, 6);
  }, [graph, query]);

  const filterCounts = useMemo(() => {
    if (!graph) return {} as Record<GraphFilter, number>;
    const filters: GraphFilter[] = ["all", "priority", "core", "image", "video", "agent"];
    return Object.fromEntries(filters.map((key) => [
      key,
      key === "priority"
        ? graph.nodes.filter((node) => node.outreach?.isPriority).length
        : filterGraph(graph, key).nodes.length,
    ])) as Record<
      GraphFilter,
      number
    >;
  }, [graph]);

  useEffect(() => {
    if (!graph || !graphRef.current) return;
    const scene = graphRef.current.scene();
    const shells = new THREE.Group();
    shells.name = "community-shells";
    graph.communities.forEach((community) => {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(community.radius, 26, 22),
        new THREE.MeshBasicMaterial({
          color: 0x7ee8cf,
          transparent: true,
          opacity: 0.018,
          wireframe: true,
          depthWrite: false,
        }),
      );
      shell.position.set(community.center.x, community.center.y, community.center.z);
      shells.add(shell);
      const label = makeTextSprite(`${community.label} · ${community.nodeCount}`, false, 0.82);
      label.position.set(
        community.center.x,
        community.center.y + community.radius + 15,
        community.center.z,
      );
      label.material.opacity = 0.7;
      shells.add(label);
    });
    scene.add(shells);
    return () => {
      scene.remove(shells);
      disposeObject(shells);
    };
  }, [graph]);

  const resetCamera = useCallback((duration = 700) => {
    graphRef.current?.cameraPosition({ x: 0, y: 0, z: 660 }, { x: 0, y: 0, z: 0 }, duration);
  }, []);

  useEffect(() => {
    if (!graph) return;
    const frame = window.requestAnimationFrame(() => resetCamera(0));
    return () => window.cancelAnimationFrame(frame);
  }, [graph, resetCamera]);

  const selectNode = useCallback((node: OrbitNode) => {
    setSelectedId(node.id);
    setRadarOpen(false);
    const position = getPosition(node);
    const distance = node.isSeed ? 115 : 78;
    const length = Math.hypot(position.x, position.y, position.z) || 1;
    const ratio = 1 + distance / length;
    graphRef.current?.cameraPosition(
      { x: position.x * ratio, y: position.y * ratio, z: position.z * ratio },
      position,
      900,
    );
  }, []);

  const nodeObject = useCallback(
    (node: OrbitNode) => {
      const followers = Math.max(1, node.followers ?? 1);
      const isSelected = selectedId === node.id;
      const isConnected = !selectedId || connectedIds.has(node.id);

      if (!node.isSeed && !isSelected) {
        const radius =
          (node.outreach?.tier === "S" ? 4.8 : node.outreach?.tier === "A" ? 4 : 0) ||
          Math.min(3.2, Math.max(1.25, 0.8 + Math.log10(followers) * 0.34));
        const color = selectedId
          ? isConnected
            ? 0x7ee8cf
            : 0x31403f
          : node.outreach?.isPriority
            ? 0x7ee8cf
            : node.outreach?.tier === "B"
              ? 0x91a2a9
              : 0x728086;
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 10, 10),
          new THREE.MeshLambertMaterial({
            color,
            transparent: true,
            opacity: selectedId ? (isConnected ? 0.98 : 0.16) : node.outreach?.isPriority ? 1 : 0.78,
          }),
        );
        mesh.scale.setScalar(radius);
        if (node.outreach?.isPriority && !selectedId) {
          const group = new THREE.Group();
          group.add(mesh);
          const glow = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: makeRingTexture(COLORS.signal, node.outreach.tier === "S" ? 0.9 : 0.5),
              transparent: true,
              depthWrite: false,
            }),
          );
          glow.scale.set(radius * 3.5, radius * 3.5, 1);
          group.add(glow);
          return group;
        }
        return mesh;
      }

      const size = node.isSeed
        ? Math.min(31, Math.max(18, 14 + Math.log10(followers) * 2.2))
        : 18;
      const opacity = isConnected ? 1 : 0.2;
      const group = new THREE.Group();
      const ring = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeRingTexture(isSelected ? COLORS.signal : COLORS.muted, isSelected ? 1 : 0.68),
          transparent: true,
          depthWrite: false,
          opacity,
        }),
      );
      ring.scale.set(size * 1.24, size * 1.24, 1);
      group.add(ring);

      const texture = new THREE.TextureLoader().setCrossOrigin("anonymous").load(avatarUrl(node));
      texture.colorSpace = THREE.SRGBColorSpace;
      const avatar = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity }),
      );
      avatar.scale.set(size, size, 1);
      group.add(avatar);
      const label = makeTextSprite(node.labelZh ?? node.name ?? node.userName, isSelected, 0.9);
      label.position.y = -(size * 0.68 + 3);
      group.add(label);
      return group;
    },
    [connectedIds, selectedId],
  );

  const linkObject = useCallback(
    (link: OrbitLink) => {
      const source = typeof link.source === "object" ? link.source : nodeById.get(nodeId(link.source));
      const target = typeof link.target === "object" ? link.target : nodeById.get(nodeId(link.target));
      if (!source || !target) return new THREE.Group();
      const isActive = selectedId
        ? nodeId(link.source) === selectedId || nodeId(link.target) === selectedId
        : false;
      const isCross = source.communityId !== target.communityId;
      const isPriority = target.outreach?.isPriority;
      const community = communityById.get(source.communityId ?? "");
      const points =
        !isCross && community
          ? makeSphereArc(source, target, community)
          : makeCrossArc(source, target);
      const material = new THREE.LineBasicMaterial({
        color: isActive ? 0x7ee8cf : isPriority ? 0x496f67 : isCross ? 0x607d7a : 0x3a4a52,
        transparent: true,
        opacity: isActive ? 0.98 : selectedId ? 0.04 : isPriority ? 0.48 : isCross ? 0.27 : 0.18,
        depthTest: false,
        depthWrite: false,
      });
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    },
    [communityById, nodeById, selectedId],
  );

  const selectedRelations = useMemo(() => {
    if (!selected || !graph) return [];
    if (!selected.isSeed) {
      return selected.originSeedIds.map((id) => nodeById.get(id)).filter(Boolean) as OrbitNode[];
    }
    const targets = graph.links
      .filter((link) => nodeId(link.source) === selected.id)
      .map((link) => nodeById.get(nodeId(link.target)))
      .filter(Boolean) as OrbitNode[];
    return targets.toSorted((left, right) => (right.followers ?? 0) - (left.followers ?? 0));
  }, [graph, nodeById, selected]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };

  const closePanels = () => {
    setRadarOpen(false);
    setLearningOpen(false);
    setSnapshotOpen(false);
    setDemoOpen(false);
    setShortlistOpen(false);
  };

  const addToShortlist = (node: OrbitNode) => {
    const existing = shortlist.find((item) => item.nodeId === node.id);
    if (!existing) {
      setShortlist((items) => [
        ...items,
        {
          nodeId: node.id,
          owner: "",
          status: "待身份核验",
          note: "",
          nextAction: "",
          updatedAt: new Date().toISOString(),
        },
      ]);
    }
    setActiveShortlistId(node.id);
    setSelectedId(null);
    closePanels();
    setShortlistOpen(true);
  };

  const updateShortlistItem = (
    nodeIdValue: string,
    patch: Partial<Omit<ShortlistItem, "nodeId" | "updatedAt">>,
  ) => {
    setShortlist((items) =>
      items.map((item) =>
        item.nodeId === nodeIdValue
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  };

  const removeShortlistItem = (nodeIdValue: string) => {
    setShortlist((items) => items.filter((item) => item.nodeId !== nodeIdValue));
    setActiveShortlistId((current) => (current === nodeIdValue ? null : current));
  };

  const exportShortlist = () => {
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["账号", "Handle", "等级", "负责人", "状态", "备注", "下一步", "更新时间"],
      ...shortlist.map((item) => {
        const node = nodeById.get(item.nodeId);
        return [
          node?.name ?? item.nodeId,
          node?.userName ?? item.nodeId,
          node?.outreach?.tier ?? "",
          item.owner,
          item.status,
          item.note,
          item.nextAction,
          item.updatedAt,
        ];
      }),
    ];
    const blob = new Blob(
      [`\uFEFF${rows.map((row) => row.map(quote).join(",")).join("\n")}`],
      { type: "text/csv;charset=utf-8" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ai-orbit-shortlist-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const runDemoAction = (step: number) => {
    if (step === 0) {
      setFilter("all");
      setSelectedId(null);
      resetCamera();
    }
    if (step === 1) {
      setFilter("priority");
      setSelectedId(null);
      resetCamera();
    }
    if (step === 2) {
      const ink = nodeById.get("0xink_");
      if (ink) selectNode(ink);
    }
    if (step === 3) {
      const ink = nodeById.get("0xink_");
      closePanels();
      if (ink) addToShortlist(ink);
    }
    if (step === demoSteps.length - 1) setDemoOpen(false);
  };

  if (loading || !ForceGraph3D) {
    return (
      <main className="loading-state">
        <span className="loader-orbit" aria-hidden="true"><span /></span>
        <strong>AI ORBIT</strong>
        <small>LOCAL LEARNING LAB</small>
        <p>正在校准本地 AI 账号星图</p>
      </main>
    );
  }

  if (error || !graph) {
    return (
      <main className="fatal-state">
        <RefreshCcw aria-hidden="true" />
        <h1>本地图谱暂时无法读取</h1>
        <p>{error || "请确认 graph.json 已存在。"}</p>
        <button className="button primary" onClick={() => window.location.reload()}>重新加载</button>
      </main>
    );
  }

  const visibleCommunityCount = new Set(visibleGraph.nodes.map((node) => node.communityId).filter(Boolean)).size;
  const seedCount = visibleGraph.nodes.filter((node) => node.isSeed).length;
  const sCount = candidates.filter((node) => node.outreach?.tier === "S").length;
  const aCount = candidates.filter((node) => node.outreach?.tier === "A").length;
  const multiBrandCount = graph.nodes.filter((node) => node.originSeedIds.length > 1).length;
  const priorityGraph = filterGraph(graph, "priority");
  const priorityContextCount = priorityGraph.nodes.filter((node) => node.isSeed).length;
  const snapshotTime = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(graph.generatedAt));
  const refreshedTime = graph.refreshedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "Asia/Shanghai",
      }).format(new Date(graph.refreshedAt))
    : "未记录";

  return (
    <main className="app-shell">
      <section ref={stageRef} className="graph-stage" aria-label="AI 品牌 X 账号三维关注关系图">
        <ForceGraph3D<OrbitNode, OrbitLink>
          ref={graphRef}
          width={stageSize.width}
          height={stageSize.height}
          graphData={visibleGraph}
          backgroundColor={COLORS.background}
          nodeThreeObject={nodeObject}
          nodeLabel={(node) => {
            const score = node.outreach?.score == null ? "" : ` · ${node.outreach.tier}级 ${node.outreach.score}分`;
            return `${node.labelZh ?? node.name ?? node.userName}${score} · @${node.userName}`;
          }}
          onNodeClick={(node) => selectNode(node)}
          onBackgroundClick={() => {
            setSelectedId(null);
            setRadarOpen(false);
          }}
          linkThreeObject={linkObject}
          linkThreeObjectExtend={false}
          linkPositionUpdate={() => true}
          showNavInfo={false}
          enableNodeDrag={false}
          warmupTicks={0}
          cooldownTicks={0}
        />

        <div className="ui-layer">
          <header className="topbar">
            <div className="brand-lockup" aria-label="AI Orbit Local Lab">
              <span className="brand-symbol"><Crosshair size={21} /></span>
              <span><strong>AI ORBIT</strong><small>LOCAL LEARNING LAB</small></span>
            </div>

            <div className="search-wrap">
              <Search size={17} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && searchResults[0]) selectNode(searchResults[0]);
                  if (event.key === "Escape") setQuery("");
                }}
                placeholder="搜索全部账号或 @handle"
                aria-label="搜索 AI 关系图账号"
              />
              {query && (
                <button className="icon-button search-clear" onClick={() => setQuery("")} aria-label="清空搜索"><X size={15} /></button>
              )}
              {searchOpen && query && (
                <div className="search-results" role="listbox">
                  {searchResults.length ? searchResults.map((node) => (
                    <button key={node.id} className="search-result" onMouseDown={() => selectNode(node)}>
                      <img src={avatarUrl(node)} alt="" />
                      <span><strong>{node.labelZh ?? node.name}</strong><small>@{node.userName}</small></span>
                    </button>
                  )) : <div className="search-empty">未找到匹配账号</div>}
                </div>
              )}
            </div>

            <div className="top-actions">
              <div className="status-pill status-live">
                <span className="status-dot" aria-hidden="true" />
                <span>官号 / S·A 公开</span>
                <span className="status-time">{snapshotTime} UTC+8</span>
              </div>
              <button
                className={`button secondary demo-toggle ${demoOpen ? "active" : ""}`}
                onClick={() => {
                  closePanels();
                  setDemoOpen(true);
                  setDemoStep(0);
                  runDemoAction(0);
                }}
              ><PlayCircle size={15} /><span>60 秒演示</span></button>
              <button
                className={`button secondary outreach-toggle ${radarOpen ? "active" : ""}`}
                onClick={() => {
                  const next = !radarOpen;
                  closePanels();
                  setSelectedId(null);
                  setRadarOpen(next);
                }}
                aria-pressed={radarOpen}
                aria-label="打开运营建联雷达"
              ><Target size={15} /><span>候选雷达</span></button>
              <button
                className={`button secondary shortlist-toggle ${shortlistOpen ? "active" : ""}`}
                onClick={() => {
                  const next = !shortlistOpen;
                  closePanels();
                  setSelectedId(null);
                  setShortlistOpen(next);
                }}
              >
                <ClipboardList size={15} /><span>运营清单</span><b>{shortlist.length}</b>
              </button>
              <button
                className={`button secondary snapshot-button ${snapshotOpen ? "active" : ""}`}
                onClick={() => {
                  const next = !snapshotOpen;
                  closePanels();
                  setSelectedId(null);
                  setSnapshotOpen(next);
                }}
                title="查看数据时间、来源和版本"
              >
                <RefreshCcw size={15} /><span>数据快照</span>
              </button>
              <a
                className="icon-button"
                href="https://github.com/liyichao0215-pixel/ai-orbit-account-map"
                target="_blank"
                rel="noreferrer"
                aria-label="在 GitHub 查看项目"
              ><Code2 size={17} /></a>
              <button className="icon-button" onClick={toggleFullscreen} aria-label={fullscreen ? "退出全屏" : "进入全屏"}>
                {fullscreen ? <Expand size={17} /> : <Maximize2 size={17} />}
              </button>
            </div>
          </header>

          <nav className="category-filter" aria-label="按 AI 类型筛选">
            {(Object.keys(filterLabels) as GraphFilter[]).map((key) => (
              <button
                key={key}
                className={filter === key ? "active" : ""}
                aria-pressed={filter === key}
                onClick={() => { setFilter(key); setSelectedId(null); setRadarOpen(false); window.requestAnimationFrame(() => resetCamera()); }}
              >{filterLabels[key]}{key !== "all" && <span>{filterCounts[key]}</span>}</button>
            ))}
          </nav>

          <div className="graph-meta">
            <strong>{visibleGraph.nodes.length}</strong> 个账号<span />
            <strong>{visibleCommunityCount}</strong> 个关系社区<span />
            <strong>{seedCount}</strong> 个核心官号<span />
            <strong>{visibleGraph.links.length}</strong> 条关注关系
          </div>

          <div className="graph-hint" aria-hidden="true">
            <span>拖拽旋转</span><i /><span>滚轮缩放</span><i /><span>点击聚焦</span>
          </div>

          <button
            className="learning-badge"
            onClick={() => {
              setSelectedId(null);
              closePanels();
              setLearningOpen(true);
            }}
          >
            <BookOpen size={14} /><span>AI 产品经理拆解</span>
          </button>

          <button className="button secondary reset-view" onClick={() => resetCamera()}>
            <RotateCcw size={14} />重置视角
          </button>

          {snapshotOpen && (
            <aside className="side-panel snapshot-panel" aria-label="数据快照说明">
              <button className="panel-close" onClick={() => setSnapshotOpen(false)} aria-label="关闭数据快照"><X size={18} /></button>
              <p className="eyebrow">DATA CONTRACT</p>
              <h2>数据快照与可信边界</h2>
              <p className="panel-description">把时间、来源、分级版本和隐私处理放在同一处，避免把演示快照误当作实时业务数据。</p>

              <div className="snapshot-status">
                <Database size={17} />
                <div><strong>{graph.source.status.toUpperCase()}</strong><span>{graph.source.provider}</span></div>
              </div>
              <dl className="snapshot-facts">
                <div><dt>源数据生成</dt><dd>{snapshotTime} UTC+8</dd></div>
                <div><dt>公开版刷新</dt><dd>{refreshedTime} UTC+8</dd></div>
                <div><dt>数据集 ID</dt><dd>{graph.dataContract?.datasetId ?? "未记录"}</dd></div>
                <div><dt>评分规则</dt><dd>{graph.dataContract?.scoringRuleVersion ?? "outreach-v1.0"}</dd></div>
                <div><dt>隐私转换</dt><dd>{graph.dataContract?.privacyTransformVersion ?? graph.privacy?.level ?? "未记录"}</dd></div>
              </dl>
              <div className="snapshot-counts">
                <div><strong>{graph.meta.totalAccounts}</strong><span>账号节点</span></div>
                <div><strong>{graph.meta.totalRelationships}</strong><span>关注关系</span></div>
                <div><strong>{graph.meta.publicPriorityAccounts}</strong><span>公开 S/A</span></div>
                <div><strong>{graph.meta.anonymousAccounts}</strong><span>匿名账号</span></div>
              </div>
              <section className="snapshot-rule">
                <ShieldCheck size={16} />
                <div><strong>分级先锁定，脱敏后不重算</strong><p>官号与最终 S/A 保留公开身份；B/C/WATCH 移除身份和外链。匿名名称、简介与扰动指标不再参与前端评分。</p></div>
              </section>
              <p className="snapshot-message">{graph.source.message}</p>
              <a className="button secondary snapshot-doc-link" href="https://github.com/liyichao0215-pixel/ai-orbit-account-map/blob/main/DATA_POLICY.md" target="_blank" rel="noreferrer">
                查看数据政策<ArrowUpRight size={14} />
              </a>
            </aside>
          )}

          {demoOpen && (
            <aside className="side-panel demo-panel" aria-label="60 秒面试演示">
              <button className="panel-close" onClick={() => setDemoOpen(false)} aria-label="关闭 60 秒演示"><X size={18} /></button>
              <p className="eyebrow">60-SECOND INTERVIEW DEMO</p>
              <h2>用 5 个镜头讲清产品</h2>
              <p className="panel-description">每一步都回答一个面试问题：为谁解决什么、如何判断、如何落地、边界在哪里。</p>
              <div className="demo-progress" aria-label={`演示进度 ${demoStep + 1} / ${demoSteps.length}`}>
                {demoSteps.map((step, index) => (
                  <button key={step.phase} className={index === demoStep ? "active" : index < demoStep ? "done" : ""} onClick={() => setDemoStep(index)} aria-label={`跳到第 ${index + 1} 步`} />
                ))}
              </div>
              <section className="demo-card">
                <span>{demoSteps[demoStep].phase}</span>
                <h3>{demoSteps[demoStep].title}</h3>
                <p>{demoSteps[demoStep].body}</p>
                {demoStep === 2 && <div className="demo-proof"><b>88</b><span>综合分</span><b>5</b><span>官号共同关注</span></div>}
              </section>
              <div className="demo-actions">
                <button
                  className="button secondary"
                  disabled={demoStep === 0}
                  onClick={() => {
                    const previous = Math.max(0, demoStep - 1);
                    setDemoStep(previous);
                    runDemoAction(previous);
                  }}
                ><ChevronLeft size={14} />上一步</button>
                <button
                  className="button primary"
                  onClick={() => {
                    runDemoAction(demoStep);
                    if (demoStep < demoSteps.length - 1) {
                      setDemoStep((value) => value + 1);
                      setDemoOpen(true);
                    }
                  }}
                >{demoSteps[demoStep].action}<ChevronRight size={14} /></button>
              </div>
              <p className="demo-note"><CheckCircle2 size={13} />建议讲法：先讲决策，再演示界面，最后主动说限制。</p>
            </aside>
          )}

          {shortlistOpen && (
            <aside className="side-panel shortlist-panel" aria-label="本地运营清单">
              <button className="panel-close" onClick={() => setShortlistOpen(false)} aria-label="关闭运营清单"><X size={18} /></button>
              <p className="eyebrow">LOCAL OPERATIONS LOOP</p>
              <h2>运营清单</h2>
              <p className="panel-description">负责人、状态与判断仅保存在当前浏览器。没有登录、多人协作或自动触达。</p>
              <div className="shortlist-toolbar">
                <span><ClipboardList size={14} />{shortlist.length} 个账号</span>
                <button className="button secondary" onClick={exportShortlist} disabled={!shortlist.length}><Download size={14} />导出 CSV</button>
              </div>

              {!shortlist.length ? (
                <div className="shortlist-empty">
                  <Plus size={20} />
                  <strong>清单还是空的</strong>
                  <p>从公开 S/A 候选详情中点击“加入运营清单”。</p>
                  <button className="button secondary" onClick={() => { setShortlistOpen(false); setRadarOpen(true); }}>去候选雷达</button>
                </div>
              ) : (
                <>
                  <div className="shortlist-list">
                    {shortlist.map((item) => {
                      const node = nodeById.get(item.nodeId);
                      return (
                        <button key={item.nodeId} className={activeShortlistId === item.nodeId ? "active" : ""} onClick={() => setActiveShortlistId(item.nodeId)}>
                          {node && <img src={avatarUrl(node)} alt="" />}
                          <span><strong>{node?.name ?? item.nodeId}</strong><small>{node?.outreach?.tier ?? "—"} · {item.status}{item.owner ? ` · ${item.owner}` : ""}</small></span>
                          <ChevronRight size={14} />
                        </button>
                      );
                    })}
                  </div>

                  {activeShortlistItem && activeShortlistNode && (
                    <section className="shortlist-editor">
                      <div className="shortlist-editor-heading">
                        <div><span>{activeShortlistNode.outreach?.tier} 级候选</span><strong>{activeShortlistNode.name}</strong></div>
                        <button onClick={() => removeShortlistItem(activeShortlistItem.nodeId)} aria-label="从清单移除"><Trash2 size={15} /></button>
                      </div>
                      <label>负责人<input value={activeShortlistItem.owner} onChange={(event) => updateShortlistItem(activeShortlistItem.nodeId, { owner: event.target.value })} placeholder="例如：小李" /></label>
                      <label>当前状态<select value={activeShortlistItem.status} onChange={(event) => updateShortlistItem(activeShortlistItem.nodeId, { status: event.target.value as ShortlistStatus })}>{shortlistStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                      <label>判断备注<textarea value={activeShortlistItem.note} onChange={(event) => updateShortlistItem(activeShortlistItem.nodeId, { note: event.target.value })} placeholder="记录账号调性、代表作品、风险或证据" /></label>
                      <label>下一步动作<input value={activeShortlistItem.nextAction} onChange={(event) => updateShortlistItem(activeShortlistItem.nodeId, { nextAction: event.target.value })} placeholder="例如：周五前人工复核最近 20 条作品" /></label>
                      <div className="shortlist-saved"><Save size={13} />已自动保存在本机 · {new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(activeShortlistItem.updatedAt))}</div>
                      <button className="button secondary shortlist-view-node" onClick={() => { setShortlistOpen(false); selectNode(activeShortlistNode); }}>返回账号详情<ArrowUpRight size={14} /></button>
                    </section>
                  )}
                </>
              )}
            </aside>
          )}

          {radarOpen && (
            <aside className="side-panel outreach-panel" aria-label="运营候选雷达">
              <button className="panel-close" onClick={() => setRadarOpen(false)} aria-label="关闭候选雷达"><X size={18} /></button>
              <p className="eyebrow">CANDIDATE RADAR</p>
              <h2>运营候选雷达</h2>
              <p className="panel-description">先用传播规模、品牌共同关注和内容匹配做初筛，再由运营者核验身份、作品与合作风险。</p>

              <div className="radar-summary" aria-label="建联候选概览">
                <div><span>S 级</span><strong>{sCount}</strong><small>优先人工核验</small></div>
                <div><span>A 级</span><strong>{aCount}</strong><small>进入复核名单</small></div>
                <div><span>多品牌</span><strong>{multiBrandCount}</strong><small>交叉背书</small></div>
              </div>

              <section className="selection-logic-card" aria-label="S 和 A 级账号筛选逻辑">
                <div className="logic-heading"><BookOpen size={14} /><strong>筛选与分级逻辑</strong><span>可解释规则，不是模型结论</span></div>
                <ol>
                  <li><b>① 先过门槛</b><p>粉丝量在 2,000–500 万之间，并且内容匹配至少得到 8 分；否则进入 WATCH，不参与 S/A 分级。</p></li>
                  <li><b>② 再算总分</b><p>粉丝影响力最高 45 分 + 核心官号共同关注最高 35 分 + 简介内容匹配最高 20 分。</p></li>
                  <li><b>③ 最后分级</b><p>S 级 ≥ 75 分；A 级 65–74 分；B 级 55–64 分；其余为 C 或 WATCH。</p></li>
                </ol>
                <div className="logic-formulas">
                  <span><b>影响力</b>粉丝量对数归一，避免大号碾压</span>
                  <span><b>品牌共识</b>最多计算 4 个核心官号共同关注</span>
                  <span><b>内容匹配</b>AI +9 · 创作人 +8 · 建设者 +5，封顶 20</span>
                </div>
                <p className="logic-privacy"><ShieldCheck size={13} />官方账号及最终 S/A 级账号保留公开身份；B 级及以下继续脱敏。</p>
              </section>

              <div className="panel-section-heading"><span><Sparkles size={14} />信号分布</span><small>{candidates.length} 个公开 S/A 候选</small></div>
              <div className="signal-matrix" aria-label="账号影响力与品牌共识分布">
                <span className="matrix-label top">4 品牌</span>
                <span className="matrix-label middle">2 品牌</span>
                <span className="matrix-label bottom">单品牌</span>
                <span className="matrix-axis">粉丝影响力 →</span>
                {[0, 1, 2].map((line) => <i key={line} className={`matrix-line line-${line}`} />)}
                {candidates.slice(0, 72).map((node) => {
                  const left = Math.max(8, Math.min(94, (Math.log10((node.followers ?? 0) + 1) / 7) * 92));
                  const top = 82 - ((Math.min(node.originSeedIds.length, 4) - 1) / 3) * 68;
                  return <button key={node.id} className={`matrix-point tier-${node.outreach?.tier.toLowerCase()}`} style={{ left: `${left}%`, top: `${top}%` }} onClick={() => selectNode(node)} aria-label={`查看 ${node.name}`} />;
                })}
              </div>

              <div className="panel-section-heading candidate-heading"><span><Target size={14} />候选排行</span><small>已展示 {candidates.length} / {candidates.length}</small></div>
              <div className="candidate-tabs" role="tablist" aria-label="候选排序方式">
                <button className={sortMode === "priority" ? "active" : ""} onClick={() => setSortMode("priority")}>综合优先</button>
                <button className={sortMode === "consensus" ? "active" : ""} onClick={() => setSortMode("consensus")}>共同关注</button>
                <button className={sortMode === "reach" ? "active" : ""} onClick={() => setSortMode("reach")}>粉丝影响</button>
              </div>
              <div className="candidate-list" aria-label={`完整公开 S/A 候选列表，共 ${candidates.length} 个账号`}>
                {sortedCandidates.map((node, index) => (
                  <button key={node.id} className="candidate-row" onClick={() => selectNode(node)}>
                    <span className="rank">{String(index + 1).padStart(3, "0")}</span>
                    <img src={avatarUrl(node)} alt="" loading="lazy" />
                    <span className="candidate-identity"><strong>{node.name}</strong><small>{formatCompact(node.followers)} 粉 · {node.originSeedIds.length} 品牌关注</small></span>
                    <span className={`candidate-score tier-${node.outreach?.tier.toLowerCase()}`}><b>{node.outreach?.tier}</b>{node.outreach?.score}</span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <div className="outreach-panel-footer">
                <p>评分：影响力 45 · 品牌共识 35 · 内容匹配 20</p>
                <button className="button primary priority-view-button" onClick={() => { setFilter("priority"); setRadarOpen(false); resetCamera(); }}>
                  <Target size={15} />查看 {candidates.length} 个 S/A 候选 + {priorityContextCount} 个关联官号
                </button>
              </div>
            </aside>
          )}

          {learningOpen && (
            <aside className="side-panel learning-panel" aria-label="AI 产品经理原型学习路径">
              <button className="panel-close" onClick={() => setLearningOpen(false)} aria-label="关闭学习路径"><X size={18} /></button>
              <p className="eyebrow">PRODUCT THINKING MODE</p>
              <h2>从原型到产品判断</h2>
              <p className="panel-description">不要求你先会 Three.js。先掌握每一层在解决什么问题、输入输出是什么、如何验收。</p>

              <div className="learning-progress" aria-label={`学习进度 ${learningStep + 1} / ${learningSteps.length}`}>
                {learningSteps.map((step, index) => (
                  <button
                    key={step.phase}
                    className={index === learningStep ? "active" : index < learningStep ? "done" : ""}
                    onClick={() => setLearningStep(index)}
                    aria-label={`进入${step.phase}`}
                  ><span>{index + 1}</span></button>
                ))}
              </div>

              <section className="learning-card">
                <span className="learning-phase">{learningSteps[learningStep].phase}</span>
                <h3>{learningSteps[learningStep].title}</h3>
                <div className="learning-question"><small>本阶段关键问题</small><p>{learningSteps[learningStep].question}</p></div>
                <div className="learning-insight"><Sparkles size={15} /><p>{learningSteps[learningStep].insight}</p></div>
                <p className="learning-output">{learningSteps[learningStep].output}</p>
              </section>

              <div className="learning-actions">
                <button
                  className="button secondary"
                  disabled={learningStep === 0}
                  onClick={() => setLearningStep((value) => Math.max(0, value - 1))}
                ><ChevronLeft size={14} />上一步</button>
                <button
                  className="button primary"
                  onClick={() => {
                    if (learningStep < learningSteps.length - 1) setLearningStep((value) => value + 1);
                    else setLearningOpen(false);
                  }}
                >{learningStep === learningSteps.length - 1 ? "完成导览" : "下一步"}<ChevronRight size={14} /></button>
              </div>

              <div className="privacy-card">
                <ShieldCheck size={17} />
                <div><strong>当前演示数据采用分层隐私策略</strong><p>16 个官号、{sCount} 个 S 级和 {aCount} 个 A 级账号保留公开身份；B 级及以下继续脱敏。</p></div>
              </div>
              <p className="learning-doc-hint">完整练习见项目中的 docs/AI产品经理学习路径.md</p>
            </aside>
          )}

          {selected && (
            <aside className="side-panel detail-panel" aria-label={`${selected.name} 账号详情`}>
              <button className="panel-close" onClick={() => setSelectedId(null)} aria-label="关闭详情"><X size={18} /></button>
              <div className="profile-heading">
                <div className="profile-avatar-wrap"><img src={avatarUrl(selected)} alt={`${selected.name} 的 X 头像`} /></div>
                <div><p>{selected.isSeed ? "核心官号" : selected.identityScope === "priority-public" ? `${selected.outreach?.tier ?? selected.preservedTier} 级公开候选` : "匿名关注账号"}</p><h2>{selected.labelZh ?? selected.name}</h2>{selected.url ? <a href={selected.url} target="_blank" rel="noreferrer">@{selected.userName}<ArrowUpRight size={12} /></a> : <span className="anonymized-handle"><ShieldCheck size={12} />@{selected.userName} · 匿名标识</span>}</div>
              </div>
              {selected.description && <p className="profile-description">{selected.description}</p>}
              <div className="profile-stats" aria-label="账号数据">
                <div><span>关注者</span><strong>{formatCompact(selected.followers)}</strong></div>
                <div><span>正在关注</span><strong>{formatCompact(selected.following)}</strong></div>
                <div><span>核心关注</span><strong>{selected.originSeedIds.length}</strong></div>
              </div>

              {!selected.isSeed && selected.identityScope === "priority-public" && selected.outreach && (
                <section className={`outreach-score-card tier-${selected.outreach.tier.toLowerCase()}`}>
                  <div className="score-card-heading"><div><span className="score-card-label">候选优先分</span><strong>{selected.outreach.score}</strong></div><span className="score-tier"><b>{selected.outreach.tier}</b>{selected.outreach.tierLabel}</span></div>
                  <div className="score-factor-list">
                    {selected.outreach.factors.map((factor) => (
                      <div key={factor.key} className="score-factor"><span>{factor.label}</span><span className="score-track"><i style={{ width: `${(factor.value / factor.max) * 100}%` }} /></span><strong>{factor.value}/{factor.max}</strong></div>
                    ))}
                  </div>
                  <p>{selected.outreach.reasons.join(" · ")}</p>
                  <button className="radar-back-button" onClick={() => { setSelectedId(null); setRadarOpen(true); }}><ChevronLeft size={14} />返回候选雷达</button>
                </section>
              )}

              {!selected.isSeed && selected.identityScope === "anonymous" && (
                <section className="anonymous-score-note">
                  <ShieldCheck size={16} />
                  <div><strong>匿名账号不在公开版重新评分</strong><p>身份、简介和精确指标已处理。这里只保留关系拓扑，避免占位文本产生虚假的 S/A 结论。</p></div>
                </section>
              )}

              <div className="relations-heading"><span>{selected.isSeed ? "正在关注的高影响账号" : "被这些核心官号关注"}</span><strong>{selectedRelations.length}</strong></div>
              <div className="relations-list">
                {selectedRelations.slice(0, 48).map((node) => (
                  <button key={node.id} onClick={() => selectNode(node)}>
                    <img src={avatarUrl(node)} alt="" loading="lazy" />
                    <span><strong>{node.labelZh ?? node.name}</strong><small>@{node.userName}</small></span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
              {!selected.isSeed && selected.identityScope === "priority-public" && (
                <button
                  className="primary-link button primary"
                  onClick={() => {
                    const inList = shortlist.some((item) => item.nodeId === selected.id);
                    if (inList) {
                      setActiveShortlistId(selected.id);
                      setSelectedId(null);
                      closePanels();
                      setShortlistOpen(true);
                    } else {
                      addToShortlist(selected);
                    }
                  }}
                >
                  {shortlist.some((item) => item.nodeId === selected.id) ? <ClipboardList size={15} /> : <Plus size={15} />}
                  {shortlist.some((item) => item.nodeId === selected.id) ? "查看运营清单记录" : "加入运营清单"}
                </button>
              )}
              {selected.url ? <a className="secondary-link button secondary" href={selected.url} target="_blank" rel="noreferrer">在 X 查看公开账号<ArrowUpRight size={15} /></a> : <div className="detail-privacy-note"><ShieldCheck size={15} />匿名账号不提供真实身份或主页跳转</div>}
            </aside>
          )}
        </div>
      </section>
    </main>
  );
}
