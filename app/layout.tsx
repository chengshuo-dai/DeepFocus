import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'DeepFocus — Build Your Patience',
  description: 'Break down long videos and tasks into manageable focus sprints. Stay engaged, take structured breaks, and actually finish what you start.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
