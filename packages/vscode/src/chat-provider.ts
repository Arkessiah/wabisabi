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
    .msg { margin: 4px 0; padding: 8px 10px; border-radius: 6px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .user { background: var(--vscode-input-background); border-left: 3px solid var(--vscode-textLink-foreground); }
    .assistant { background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); }
    .assistant code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
    .status { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 0.85em; padding: 2px 10px; }
    .tool-status { color: var(--vscode-charts-orange); font-size: 0.85em; padding: 2px 10px; }
    .streaming { border-left: 3px solid var(--vscode-charts-green); }
    .cursor { display: inline-block; width: 2px; height: 14px; background: var(--vscode-foreground); animation: blink 0.8s infinite; vertical-align: text-bottom; margin-left: 2px; }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
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
    let isStreaming = false;

    function addMessage(text, cls) {
      const div = document.createElement('div');
      div.className = 'msg ' + cls;
      div.textContent = text;
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
            currentAssistantDiv.textContent = '';
            messagesEl.appendChild(currentAssistantDiv);
          }
          currentAssistantDiv.textContent += msg.chunk;
          messagesEl.scrollTop = messagesEl.scrollHeight;
          break;

        case 'stream-end':
          if (currentAssistantDiv) {
            currentAssistantDiv.classList.remove('streaming');
          }
          currentAssistantDiv = null;
          setStreaming(false);
          break;

        case 'response':
          addMessage(msg.text, 'assistant');
          currentAssistantDiv = null;
          setStreaming(false);
          break;

        case 'status':
          addMessage(msg.text, 'status');
          break;

        case 'tool':
          const icon = msg.status === 'running' ? '⚙️' : '✓';
          addMessage(icon + ' ' + msg.name, 'tool-status');
          break;

        case 'clear':
          messagesEl.innerHTML = '';
          currentAssistantDiv = null;
          setStreaming(false);
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
