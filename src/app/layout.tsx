// src/app/layout.tsx
import "./globals.css";
import AuthProvider from "../components/AuthProvider";

export const metadata = {
  title: "CosMath Report",
  description: "Student Report System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      {/* font-sans 클래스를 추가하여 globals.css에서 설정한 폰트를 불러옵니다 */}
      <body className="antialiased font-sans"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
