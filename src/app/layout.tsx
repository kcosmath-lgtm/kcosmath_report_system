// src/app/layout.tsx
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import AuthProvider from "../components/AuthProvider";

export const metadata = {
  title: "유니데스크 | UNIDESK",
  description: "수업과 학원 운영의 모든 흐름을 하나로 연결하는 올인원 워크스페이스",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      {/* font-sans 클래스를 추가하여 globals.css에서 설정한 폰트를 불러옵니다 */}
      <body className="antialiased font-sans">
        <AuthProvider>{children}</AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
