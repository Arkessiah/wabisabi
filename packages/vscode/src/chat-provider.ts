/**
 * Chat Webview Provider
 *
 * WebviewViewProvider that renders the chat interface in the sidebar.
 * Bridges messages between the webview and the extension host.
 */

import * as vscode from "vscode";
import type { WabiSabiConfig } from "./config";

type MessageToWebview =
  | { type: "response"; text: string }
  | { type: "stream"; chunk: string }
  | { type: "status"; text: string }
  | { type: "clear" };

type MessageFromWebview =
  | { type: "message"; text: string }
  | { type: "switchAgent"; agent: string };

export class ChatProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

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
      if (msg.type === "message") {
        this.handleUserMessage(msg.text);
      } else if (msg.type === "switchAgent") {
        this.config.setAgent(msg.agent as any);
      }
    });
  }

  sendMessage(text: string) {
    if (this.view) {
      this.view.show(true);
      this.handleUserMessage(text);
    }
  }

  private async handleUserMessage(text: string) {
    this.postMessage({ type: "status", text: "Thinking..." });

    // TODO: Connect to actual agent pipeline via @wabisabi/core
    // For now, echo back as placeholder
    this.postMessage({
      type: "response",
      text: `[${this.config.agent.toUpperCase()}] Received: ${text.substring(0, 100)}...`,
    });
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
    body { font-family: var(--vscode-font-family); padding: 0; margin: 0; color: var(--vscode-foreground); }
    #messages { padding: 8px; overflow-y: auto; height: calc(100vh - 60px); }
    .msg { margin: 4px 0; padding: 6px 8px; border-radius: 4px; }
    .user { background: var(--vscode-input-background); }
    .assistant { background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); }
    .status { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 0.9em; }
    #input-area { display: flex; padding: 4px; border-top: 1px solid var(--vscode-widget-border); }
    #input { flex: 1; padding: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
             border: 1px solid var(--vscode-input-border); border-radius: 4px; font-size: 13px; }
    #send { margin-left: 4px; padding: 6px 12px; background: var(--vscode-button-background);
            color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; }
  </style>
</head>
<body>
  <div id="messages"></div>
  <div id="input-area">
    <input id="input" placeholder="Ask WabiSabi..." />
    <button id="send">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');

    function addMessage(text, cls) {
      const div = document.createElement('div');
      div.className = 'msg ' + cls;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    document.getElementById('send').addEventListener('click', send);
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

    function send() {
      const text = inputEl.value.trim();
      if (!text) return;
      addMessage(text, 'user');
      vscode.postMessage({ type: 'message', text });
      inputEl.value = '';
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'response') addMessage(msg.text, 'assistant');
      else if (msg.type === 'status') addMessage(msg.text, 'status');
      else if (msg.type === 'clear') messagesEl.innerHTML = '';
    });
  </script>
</body>
</html>`;
  }
}
