import type { Metadata } from "next";
import { OrbitApp } from "./OrbitApp";

export const metadata: Metadata = {
  title: "AI Orbit Local Lab — 3D AI 账号关系图",
  description: "一个可阅读、可拆解、可在本地运行的 3D AI 账号关系图学习项目。",
};

export default function Home() {
  return <OrbitApp />;
}
