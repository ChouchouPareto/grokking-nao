import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grokking恼",
  description: "以 3D 关键词网络为核心的空间思考工具",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
