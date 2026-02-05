import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      <div className="max-w-6xl mx-auto px-4 py-20">
        <header className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-4">🌀 WabiSabi</h1>
          <p className="text-xl text-gray-300 mb-8">
            Terminal IDE with intelligent agents - Code with AI
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/docs"
              className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Documentation
            </Link>
            <a
              href="https://github.com/ascendwave/wabisabi"
              className="px-6 py-3 bg-gray-700 rounded-lg hover:bg-gray-600"
            >
              GitHub
            </a>
          </div>
        </header>

        <section className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-gray-800 p-6 rounded-xl">
            <h2 className="text-2xl font-bold mb-4">🧠 Intelligent Agents</h2>
            <p className="text-gray-300">
              Build, Plan, and Search agents to help you code, plan, and
              research
            </p>
          </div>
          <div className="bg-gray-800 p-6 rounded-xl">
            <h2 className="text-2xl font-bold mb-4">🔗 Substratum Ready</h2>
            <p className="text-gray-300">
              Connects to Substratum backend or runs with local Ollama
            </p>
          </div>
          <div className="bg-gray-800 p-6 rounded-xl">
            <h2 className="text-2xl font-bold mb-4">📦 Plugins</h2>
            <p className="text-gray-300">
              Compatible with Claude Code and OpenCode plugins
            </p>
          </div>
        </section>

        <section className="bg-gray-800 p-8 rounded-xl mb-16">
          <h2 className="text-3xl font-bold mb-6">Installation</h2>
          <pre className="bg-gray-900 p-4 rounded-lg overflow-x-auto">
            <code>
              git clone https://github.com/ascendwave/wabisabi cd
              wabisabi/packages/terminal bun install bun build ./dist/index.js
              --help
            </code>
          </pre>
        </section>

        <section className="text-center">
          <h2 className="text-3xl font-bold mb-6">Commands</h2>
          <div className="bg-gray-900 p-6 rounded-lg inline-block text-left">
            <pre className="text-green-400">
              wabisabi interactive # Start interactive mode wabisabi batch
              &lt;file&gt; # Run batch tasks wabisabi stream # Streaming mode
              wabisabi agent build # Build agent wabisabi agent plan # Plan
              agent wabisabi agent search # Search agent
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}
