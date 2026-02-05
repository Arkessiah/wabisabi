export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="m-0 p-0">{children}</body>
    </html>
  );
}
