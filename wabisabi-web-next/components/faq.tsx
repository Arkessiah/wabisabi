// Preguntas frecuentes visibles + su JSON-LD FAQPage. Google solo acepta el
// FAQPage si el mismo texto está en la página, por eso salen de una sola fuente.
// <details> nativo: las respuestas están en el HTML aunque estén plegadas.
const faqs = [
  {
    q: "What is Wabi-Sabi?",
    a: "Wabi-Sabi is an AI development platform with a token-based economy. It ships autonomous coding agents for the terminal (CLI) and for VS Code that read, write and run code using local or cloud AI models.",
  },
  {
    q: "How does the Wabi-Sabi token economy work?",
    a: "Tokens pay for AI inference, storage and compute. You can buy them, or earn them by contributing idle CPU/GPU power to the network. Unused tokens can be sold on the marketplace, and accumulating volume unlocks Gold status with better rates.",
  },
  {
    q: "Can I use Wabi-Sabi with local AI models?",
    a: "Yes. The CLI and the VS Code extension work with local models through Ollama, or with cloud models through a Substratum account.",
  },
  {
    q: "What do I need to run Wabi-Sabi?",
    a: "The CLI requires Bun or Node.js 18+. The VS Code extension requires VS Code 1.85 or later. Both need either Ollama for local models or a Substratum account for cloud models.",
  },
  {
    q: "What can the coding agents do?",
    a: "The agents work autonomously and can delegate tasks to specialized subagents. They read and edit files, run commands, keep persistent memory per user and team, and route each request to a suitable local or cloud model.",
  },
  {
    q: "Is Wabi-Sabi open source?",
    a: "Yes. The source code is published on GitHub under the MIT license at github.com/Arkessiah/wabisabi.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export function FaqSection() {
  return (
    <section id="faq" className="py-32 bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-4xl font-bold text-slate-800 mb-12 text-center">
          Frequently asked questions
        </h2>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {faqs.map(({ q, a }) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
                <h3>{q}</h3>
                <span className="text-[#F97316] transition-transform group-open:rotate-45 text-2xl leading-none">
                  +
                </span>
              </summary>
              <p className="mt-3 text-slate-600 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
