import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fallbackSiteUrl = "https://liyichao-ai-orbit.liyichao0215.chatgpt.site";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  let metadataBase = new URL(fallbackSiteUrl);
  if (host) {
    try {
      metadataBase = new URL(`${protocol}://${host}`);
    } catch {
      // Keep the verified public fallback when a malformed host header is supplied.
    }
  }

  return {
    metadataBase,
    title: "AI Orbit｜账号关系可视化原型",
    description: "把 AI 官号公开关注关系转成 3D 生态地图、可解释候选评分与本机运营闭环。",
    openGraph: {
      title: "AI Orbit｜账号关系可视化原型",
      description: "关系发现 · 可解释评分 · 运营闭环",
      type: "website",
      images: [{ url: "/og.png", width: 1536, height: 1024, alt: "AI Orbit 账号关系可视化原型" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "AI Orbit｜账号关系可视化原型",
      description: "关系发现 · 可解释评分 · 运营闭环",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
