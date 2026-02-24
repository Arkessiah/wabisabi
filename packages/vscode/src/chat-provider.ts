/**
 * Chat Webview Provider
 *
 * WebviewViewProvider that renders the chat interface in the sidebar.
 * Connects to real LLM providers via ChatService for streamed responses
 * with tool-calling support.
 */

import * as vscode from "vscode";
import type { WabiSabiConfig } from "./config";
import { ChatService } from "./chat-service";

type MessageToWebview =
  | { type: "response"; text: string }
  | { type: "stream"; chunk: string }
  | { type: "stream-end" }
  | { type: "status"; text: string }
  | { type: "tool"; name: string; status: "running" | "done" }
  | { type: "clear" };

type MessageFromWebview =
  | { type: "message"; text: string }
  | { type: "abort" }
  | { type: "clear" }
  | { type: "switchAgent"; agent: string };

export class ChatProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private chatService: ChatService | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly config: WabiSabiConfig
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((msg: MessageFromWebview) => {
      switch (msg.type) {
        case "message":
          this.handleUserMessage(msg.text);
          break;
        case "abort":
          this.chatService?.abort();
          this.postMessage({ type: "status", text: "Cancelled" });
          this.postMessage({ type: "stream-end" });
          break;
        case "clear":
          this.chatService?.clearHistory();
          this.postMessage({ type: "clear" });
          break;
        case "switchAgent":
          this.config.setAgent(msg.agent);
          this.chatService?.setAgent(msg.agent as any);
          break;
      }
    });
  }

  sendMessage(text: string) {
    if (this.view) {
      this.view.show(true);
      this.handleUserMessage(text);
    }
  }

  private ensureChatService(): ChatService {
    if (this.chatService) return this.chatService;

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

    this.chatService = new ChatService(this.config, workspaceRoot, {
      onToken: (chunk) => this.postMessage({ type: "stream", chunk }),
      onStatus: (text) => this.postMessage({ type: "status", text }),
      onToolCall: (name, status) => this.postMessage({ type: "tool", name, status }),
      onError: (error) => this.postMessage({ type: "response", text: `Error: ${error}` }),
    });

    return this.chatService;
  }

  private async handleUserMessage(text: string) {
    const service = this.ensureChatService();

    this.postMessage({ type: "status", text: `[${this.config.agent.toUpperCase()}] Thinking...` });

    try {
      await service.sendMessage(text);
      this.postMessage({ type: "stream-end" });
    } catch (err: any) {
      this.postMessage({ type: "response", text: `Error: ${err.message}` });
      this.postMessage({ type: "stream-end" });
    }
  }

  private postMessage(msg: MessageToWebview) {
    this.view?.webview.postMessage(msg);
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); padding: 0; margin: 0; color: var(--vscode-foreground); height: 100vh; display: flex; flex-direction: column; }
    #messages { flex: 1; padding: 8px; overflow-y: auto; }
    .msg { margin: 6px 0; padding: 8px 10px; border-radius: 6px; font-size: 13px; line-height: 1.6; word-break: break-word; }
    .user { background: var(--vscode-input-background); border-left: 3px solid var(--vscode-textLink-foreground); white-space: pre-wrap; }
    .assistant { background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); }
    .assistant p { margin: 4px 0; }
    .assistant ul, .assistant ol { margin: 4px 0; padding-left: 20px; }
    .assistant h1, .assistant h2, .assistant h3 { margin: 8px 0 4px; color: var(--vscode-textLink-foreground); }
    .assistant h1 { font-size: 1.2em; }
    .assistant h2 { font-size: 1.1em; }
    .assistant h3 { font-size: 1em; }
    .assistant code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
    .assistant pre { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 8px; overflow-x: auto; margin: 6px 0; position: relative; }
    .assistant pre code { background: none; padding: 0; font-size: 12px; line-height: 1.4; }
    .assistant blockquote { border-left: 3px solid var(--vscode-textLink-foreground); margin: 6px 0; padding: 4px 10px; color: var(--vscode-descriptionForeground); }
    .assistant strong { color: var(--vscode-textLink-foreground); }
    .assistant a { color: var(--vscode-textLink-foreground); }
    .assistant hr { border: none; border-top: 1px solid var(--vscode-widget-border); margin: 8px 0; }
    .assistant table { border-collapse: collapse; margin: 6px 0; width: 100%; }
    .assistant th, .assistant td { border: 1px solid var(--vscode-widget-border); padding: 4px 8px; font-size: 12px; }
    .assistant th { background: var(--vscode-input-background); }
    .code-lang { position: absolute; top: 2px; right: 6px; font-size: 10px; color: var(--vscode-descriptionForeground); }
    /* Syntax highlighting */
    .tok-kw { color: var(--vscode-symbolIcon-keywordForeground, #c586c0); }
    .tok-str { color: var(--vscode-symbolIcon-stringForeground, #ce9178); }
    .tok-num { color: var(--vscode-symbolIcon-numberForeground, #b5cea8); }
    .tok-cm { color: var(--vscode-symbolIcon-commentForeground, #6a9955); font-style: italic; }
    .tok-fn { color: var(--vscode-symbolIcon-functionForeground, #dcdcaa); }
    .tok-tp { color: var(--vscode-symbolIcon-typeParameterForeground, #4ec9b0); }
    .tok-op { color: var(--vscode-foreground); }
    .status { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 0.85em; padding: 2px 10px; }
    .tool-status { color: var(--vscode-charts-orange); font-size: 0.85em; padding: 2px 10px; }
    .streaming { border-left: 3px solid var(--vscode-charts-green); }
    #input-area { display: flex; gap: 4px; padding: 6px; border-top: 1px solid var(--vscode-widget-border); background: var(--vscode-sideBar-background); }
    #input { flex: 1; padding: 6px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
             border: 1px solid var(--vscode-input-border); border-radius: 4px; font-size: 13px; font-family: var(--vscode-font-family); }
    #input:focus { outline: 1px solid var(--vscode-focusBorder); }
    .btn { padding: 6px 10px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
    #send { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    #send:hover { background: var(--vscode-button-hoverBackground); }
    #stop { background: var(--vscode-errorForeground); color: #fff; display: none; }
  </style>
</head>
<body>
  <div id="messages"></div>
  <div id="input-area">
    <input id="input" placeholder="Ask WabiSabi..." />
    <button id="send" class="btn">Send</button>
    <button id="stop" class="btn">Stop</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    const stopBtn = document.getElementById('stop');
    let currentAssistantDiv = null;
    let streamBuffer = '';
    let isStreaming = false;

    // ── Markdown parser (lightweight, no deps) ──────────────
    function renderMarkdown(text) {
      let html = text;
      // Code blocks with language
      html = html.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
        const highlighted = highlightSyntax(escapeHtml(code.trim()), lang);
        const langLabel = lang ? '<span class="code-lang">' + lang + '</span>' : '';
        return '<pre>' + langLabel + '<code>' + highlighted + '</code></pre>';
      });
      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      // Headers
      html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
      // Bold and italic
      html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>');
      // Blockquotes
      html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
      // Horizontal rule
      html = html.replace(/^---$/gm, '<hr>');
      // Unordered lists
      html = html.replace(/^[\\-\\*] (.+)$/gm, '<li>$1</li>');
      html = html.replace(/(<li>.*<\\/li>\\n?)+/g, '<ul>$&</ul>');
      // Ordered lists
      html = html.replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>');
      // Links
      html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2">$1</a>');
      // Paragraphs (double newline)
      html = html.replace(/\\n\\n/g, '</p><p>');
      // Single newlines in non-code context → <br>
      html = html.replace(/(?<!<\\/(pre|li|h[123]|blockquote|ul|ol|hr|p)>)\\n(?!<)/g, '<br>');
      return '<p>' + html + '</p>';
    }

    function escapeHtml(text) {
      return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ── Syntax highlighter (regex-based, covers common patterns) ──
    function highlightSyntax(code, lang) {
      if (!lang) return code;
      // Keywords by language family
      const kwSets = {
        js: 'const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|try|catch|throw|switch|case|default|break|continue|typeof|instanceof|of|in|yield',
        ts: 'const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|try|catch|throw|switch|case|default|break|continue|typeof|instanceof|of|in|yield|type|interface|enum|namespace|declare|as|extends|implements|readonly|abstract|public|private|protected',
        py: 'def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|and|or|not|in|is|True|False|None|async|await|self',
        rust: 'fn|let|mut|const|if|else|for|while|loop|match|struct|enum|impl|trait|use|mod|pub|return|self|super|crate|where|async|await|move|ref|type|unsafe|static|extern',
        go: 'func|var|const|if|else|for|range|switch|case|default|return|type|struct|interface|package|import|go|defer|chan|select|map|make|new|nil|true|false',
        sh: 'if|then|else|elif|fi|for|while|do|done|case|esac|function|return|local|export|source|echo|exit|cd|ls|rm|cp|mv|mkdir|cat|grep|sed|awk',
      };
      const langMap = { javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh', zsh: 'sh', shell: 'sh', rs: 'rust', golang: 'go' };
      const key = langMap[lang] || lang;
      const kw = kwSets[key] || kwSets['js'];

      // Apply highlighting with regex (order matters)
      let result = code;
      // Comments (// and #)
      result = result.replace(/((?:\\/\\/|#).*?)$/gm, '<span class="tok-cm">$1</span>');
      // Strings (double and single quoted)
      result = result.replace(/(&quot;|"|')(?:(?!\\1).)*?\\1/g, '<span class="tok-str">$&</span>');
      // Numbers
      result = result.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="tok-num">$1</span>');
      // Keywords
      result = result.replace(new RegExp('\\\\b(' + kw + ')\\\\b', 'g'), '<span class="tok-kw">$1</span>');
      // Function calls
      result = result.replace(/(\\w+)(?=\\s*\\()/g, '<span class="tok-fn">$1</span>');
      // Type-like (PascalCase)
      result = result.replace(/\\b([A-Z][a-zA-Z0-9]+)\\b/g, '<span class="tok-tp">$1</span>');
      return result;
    }

    function addMessage(text, cls) {
      const div = document.createElement('div');
      div.className = 'msg ' + cls;
      if (cls === 'assistant') {
        div.innerHTML = renderMarkdown(text);
      } else {
        div.textContent = text;
      }
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function setStreaming(state) {
      isStreaming = state;
      sendBtn.style.display = state ? 'none' : 'block';
      stopBtn.style.display = state ? 'block' : 'none';
      inputEl.disabled = state;
    }

    sendBtn.addEventListener('click', send);
    stopBtn.addEventListener('click', () => vscode.postMessage({ type: 'abort' }));
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !isStreaming) send(); });

    function send() {
      const text = inputEl.value.trim();
      if (!text || isStreaming) return;
      addMessage(text, 'user');
      setStreaming(true);
      vscode.postMessage({ type: 'message', text });
      inputEl.value = '';
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      switch (msg.type) {
        case 'stream':
          if (!currentAssistantDiv) {
            currentAssistantDiv = document.createElement('div');
            currentAssistantDiv.className = 'msg assistant streaming';
            streamBuffer = '';
            messagesEl.appendChild(currentAssistantDiv);
          }
          streamBuffer += msg.chunk;
          // During streaming, show raw text; render markdown on stream-end
          currentAssistantDiv.textContent = streamBuffer;
          messagesEl.scrollTop = messagesEl.scrollHeight;
          break;

        case 'stream-end':
          if (currentAssistantDiv && streamBuffer) {
            currentAssistantDiv.innerHTML = renderMarkdown(streamBuffer);
            currentAssistantDiv.classList.remove('streaming');
          }
          currentAssistantDiv = null;
          streamBuffer = '';
          setStreaming(false);
          break;

        case 'response':
          addMessage(msg.text, 'assistant');
          currentAssistantDiv = null;
          streamBuffer = '';
          setStreaming(false);
          break;

        case 'status':
          addMessage(msg.text, 'status');
          break;

        case 'tool': {
          const icon = msg.status === 'running' ? '...' : 'ok';
          addMessage('[' + icon + '] ' + msg.name, 'tool-status');
          break;
        }

        case 'clear':
          messagesEl.innerHTML = '';
          currentAssistantDiv = null;
          streamBuffer = '';
          setStreaming(false);
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
