# Wabi-Sabi Web - Next.js Frontend

Frontend web para la plataforma 2BrainDevCore/Wabi-Sabi.

## Estructura

```
wabi-sabi-web-next/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Landing page
│   ├── login/              # Auth pages
│   ├── dashboard/          # User dashboard
│   ├── chat/               # AI chat interface
│   └── projects/           # Project management
├── components/
│   ├── ui/                 # Reusable UI components
│   ├── dashboard/          # Dashboard widgets
│   ├── chat/               # Chat components
│   └── models/             # Model selection
├── lib/
│   ├── api.ts              # API client
│   └── store.ts            # Zustand state
├── types/
│   └── index.ts            # TypeScript types
└── public/                 # Static assets
```

## Tecnologías

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Zustand (state)
- TanStack Query (data fetching)
- Recharts (charts)
- Monaco Editor (code)

## Scripts

```bash
npm install
npm run dev      # Desarrollo en http://localhost:3000
npm run build    # Producción
npm run start    # Servidor producción
npm run lint     # Linting
```

## API Integration

Conecta con el API Gateway en `http://localhost:8080`:

- `/v1/chat/completions` - Chat completions
- `/v1/models` - List models
- `/health` - Health check

## Deployment

Ver `GUIA-DESPLIEGUE-COMPLETA.md` para instrucciones de despliegue.
