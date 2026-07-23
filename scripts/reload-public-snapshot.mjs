import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateOutreach, keepsPublicIdentity } from "../shared/outreach-model.mjs";

const graphUrl = process.argv[2];
if (!graphUrl) {
  console.error("用法：pnpm reload:snapshot -- <你有权读取的 graph.json 或 API URL>");
  console.error("脚本不再内置第三方源站地址，避免误抓取或误提交未经授权的数据。");
  process.exit(1);
}
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const outputPath = join(projectDir, "public/data/graph.json");
const avatarRoot = join(projectDir, "public/avatars");
const temporaryDir = await mkdtemp(join(tmpdir(), "ai-orbit-source-"));
const temporarySource = join(temporaryDir, "graph.source.json");

const runSanitizer = () =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [join(scriptDir, "sanitize-graph.mjs"), temporarySource, outputPath], {
      stdio: "inherit",
    });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`脱敏脚本退出，状态码 ${code}`));
    });
  });

try {
  const response = await fetch(graphUrl);
  if (!response.ok) throw new Error(`图谱接口返回 ${response.status}`);
  const sourceText = await response.text();
  const graph = JSON.parse(sourceText);
  const officialNodes = graph.nodes.filter((node) => node.isSeed);
  const priorityNodes = graph.nodes.filter((node) => !node.isSeed && keepsPublicIdentity(node));
  const publicIdentityNodes = [...officialNodes, ...priorityNodes];

  await writeFile(temporarySource, sourceText, "utf8");
  await runSanitizer();
  await Promise.all([
    mkdir(join(avatarRoot, "official"), { recursive: true }),
    mkdir(join(avatarRoot, "priority"), { recursive: true }),
  ]);

  await Promise.all(
    publicIdentityNodes.map(async (node) => {
      const sourceAvatar = node.avatar?.startsWith("/")
        ? new URL(node.avatar, new URL(graphUrl).origin).href
        : node.profilePicture;
      if (!sourceAvatar) return;
      const avatarResponse = await fetch(sourceAvatar);
      if (!avatarResponse.ok) throw new Error(`公开账号头像下载失败：${node.id} (${avatarResponse.status})`);
      const bytes = new Uint8Array(await avatarResponse.arrayBuffer());
      const avatarGroup = node.isSeed ? "official" : "priority";
      await writeFile(join(avatarRoot, avatarGroup, `${String(node.id).toLowerCase()}.jpg`), bytes);
    }),
  );

  const sCount = priorityNodes.filter((node) => calculateOutreach(node).tier === "S").length;
  const aCount = priorityNodes.filter((node) => calculateOutreach(node).tier === "A").length;
  console.log(
    `重新加载完成：${officialNodes.length} 个公开官号，${sCount} 个 S 级公开账号，${aCount} 个 A 级公开账号，其余 ${graph.nodes.length - publicIdentityNodes.length} 个账号脱敏，${graph.links.length} 条关系。`,
  );
} finally {
  await rm(temporaryDir, { recursive: true, force: true });
}
