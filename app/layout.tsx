import type { Metadata } from "next";
import "./globals.css";
import { TicketToastHost } from "./components/TicketToastHost";

export const metadata: Metadata = {
  title: "Interact HRM",
  description: "Interact HRM platform",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning style={{ background: "#F7FAFC" }}>
        {children}
        <TicketToastHost />
      </body>
    </html>
  );
}
