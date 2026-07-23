"use client";

/* eslint-disable @next/next/no-img-element -- 官号头像保存在本地，匿名头像使用 data URL。 */

import {
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Expand,
  Maximize2,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
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
  priority: "S/A 建联优先",
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
        .filter((node) => node.outreach?.isCandidate)
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
    return Object.fromEntries(filters.map((key) => [key, filterGraph(graph, key).nodes.length])) as Record<
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
                <span className="status-time">{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(graph.generatedAt))}</span>
              </div>
              <button
                className={`button secondary outreach-toggle ${radarOpen ? "active" : ""}`}
                onClick={() => { setSelectedId(null); setRadarOpen((value) => !value); }}
                aria-pressed={radarOpen}
                aria-label="打开运营建联雷达"
              ><Target size={15} /><span>建联雷达</span></button>
              <button className="button secondary snapshot-button" disabled title="本地学习版使用分层处理的公开快照">
                <RefreshCcw size={15} /><span>数据快照</span>
              </button>
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
              setRadarOpen(false);
              setLearningOpen(true);
            }}
          >
            <BookOpen size={14} /><span>AI 产品经理拆解</span>
          </button>

          <button className="button secondary reset-view" onClick={() => resetCamera()}>
            <RotateCcw size={14} />重置视角
          </button>

          {radarOpen && (
            <aside className="side-panel outreach-panel" aria-label="运营建联雷达">
              <button className="panel-close" onClick={() => setRadarOpen(false)} aria-label="关闭建联雷达"><X size={18} /></button>
              <p className="eyebrow">OUTREACH RADAR</p>
              <h2>运营建联雷达</h2>
              <p className="panel-description">优先看同时具备传播规模、品牌共同关注和 AI 创作匹配度的账号。</p>

              <div className="radar-summary" aria-label="建联候选概览">
                <div><span>S 级</span><strong>{sCount}</strong><small>立即建联</small></div>
                <div><span>A 级</span><strong>{aCount}</strong><small>优先跟进</small></div>
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

              <div className="panel-section-heading"><span><Sparkles size={14} />信号分布</span><small>{candidates.length} 个 B 级以上候选</small></div>
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
              <div className="candidate-list" aria-label={`完整建联候选列表，共 ${candidates.length} 个账号`}>
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
                  <Target size={15} />在图中只看 {filterCounts.priority} 个 S/A 级账号
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

              {!selected.isSeed && selected.outreach && (
                <section className={`outreach-score-card tier-${selected.outreach.tier.toLowerCase()}`}>
                  <div className="score-card-heading"><div><span className="score-card-label">建联优先分</span><strong>{selected.outreach.score}</strong></div><span className="score-tier"><b>{selected.outreach.tier}</b>{selected.outreach.tierLabel}</span></div>
                  <div className="score-factor-list">
                    {selected.outreach.factors.map((factor) => (
                      <div key={factor.key} className="score-factor"><span>{factor.label}</span><span className="score-track"><i style={{ width: `${(factor.value / factor.max) * 100}%` }} /></span><strong>{factor.value}/{factor.max}</strong></div>
                    ))}
                  </div>
                  <p>{selected.outreach.reasons.join(" · ")}</p>
                  <button className="radar-back-button" onClick={() => { setSelectedId(null); setRadarOpen(true); }}><ChevronLeft size={14} />返回建联雷达</button>
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
              {selected.url ? <a className="primary-link button primary" href={selected.url} target="_blank" rel="noreferrer">在 X 查看公开账号<ArrowUpRight size={15} /></a> : <div className="detail-privacy-note"><ShieldCheck size={15} />B 级及以下账号已脱敏，不提供真实主页跳转</div>}
            </aside>
          )}
        </div>
      </section>
    </main>
  );
}
