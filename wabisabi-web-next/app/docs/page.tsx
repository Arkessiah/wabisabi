export default function Docs() {
  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">📖 WabiSabi Documentation</h1>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Quick Start</h2>
          <pre className="bg-gray-800 p-4 rounded-lg">
            {`# Install
git clone https://github.com/ascendwave/wabisabi
cd wabisabi/packages/terminal
bun install
bun build

# Run
./dist/index.js --help`}
          </pre>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Configuration</h2>
          <p className="text-gray-300 mb-4">Set environment variables:</p>
          <pre className="bg-gray-800 p-4 rounded-lg">
            {`WABISABI_SUBSTRATUM=http://localhost:3001
WABISABI_OLLAMA=http://localhost:11434
WABISABI_MODEL=llama3.2`}
          </pre>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Agents</h2>
          <ul className="list-disc list-inside text-gray-300 space-y-2">
            <li>
              <strong>build</strong> - Code generation agent
            </li>
            <li>
              <strong>plan</strong> - Task planning agent
            </li>
            <li>
              <strong>search</strong> - Research agent
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">Batch Mode</h2>
          <p className="text-gray-300 mb-4">Create a JSON task file:</p>
          <pre className="bg-gray-800 p-4 rounded-lg">
            {`{
  "tasks": [
    {
      "name": "task1",
      "prompt": "Generate a React component"
    },
    {
      "name": "task2",
      "prompt": "Create a REST API"
    }
  ]
}`}
          </pre>
        </section>
      </div>
    </main>
  );
}
