import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 创作辅助平台",
  description: "资料管理优先的小说创作工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
