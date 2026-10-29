import type { Metadata, Viewport } from "next";
import "@fontsource/gowun-batang/400.css";
import "@fontsource/gowun-batang/700.css";
import "@fontsource/nanum-pen-script/400.css";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "팀장님께 전하는 마음 · Warm Letter",
  description:
    "함께한 시간은 추억이 되고, 전하지 못한 마음은 편지가 됩니다. 다섯 사람의 마음을 모은 작은 우편함.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f8f1e5",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
