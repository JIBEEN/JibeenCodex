import type { Metadata, Viewport } from "next";
import "@fontsource/gowun-batang/400.css";
import "@fontsource/gowun-batang/700.css";
import "@fontsource/nanum-pen-script/400.css";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "원주팀장님, 수고하셨습니다 · Warm Letter",
  description:
    "짧지만 길었던 시간들을 저희와 함께 버텨주셔서 감사합니다. 다섯 사람의 마음을 모은 작은 우편함.",
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
