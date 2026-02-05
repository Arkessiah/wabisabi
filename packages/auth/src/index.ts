export interface User {
  id: string;
  email: string;
  name: string;
  provider: "google" | "github" | "email";
  avatar?: string;
  tokens: TokenBalance;
  createdAt: Date;
}

export interface TokenBalance {
  available: number;
  used: number;
  total: number;
}

export interface AuthSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

class AuthSystem {
  private session: AuthSession | null = null;
  private apiUrl: string = "http://localhost:3001";

  async login(provider: "google" | "github" | "email"): Promise<string> {
    const authUrl = `${this.apiUrl}/auth/${provider}`;
    console.log(`🔐 Opening OAuth flow: ${authUrl}`);
    console.log("Please complete authentication in your browser...");
    return authUrl;
  }

  async handleCallback(code: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/auth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (response.ok) {
        const data = await response.json();
        this.session = {
          userId: data.user.id,
          accessToken: data.token,
          refreshToken: data.refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };
        this.saveSession();
        console.log("✅ Authentication successful!");
        return true;
      }
      return false;
    } catch (error) {
      console.error("❌ Auth failed:", error);
      return false;
    }
  }

  async logout(): Promise<void> {
    this.session = null;
    this.clearSession();
    console.log("👋 Logged out successfully");
  }

  isAuthenticated(): boolean {
    if (!this.session) return false;
    if (new Date() > this.session.expiresAt) {
      console.log("⚠️ Session expired, please login again");
      return false;
    }
    return true;
  }

  async getUser(): Promise<User | null> {
    if (!this.isAuthenticated()) return null;

    try {
      const response = await fetch(`${this.apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${this.session!.accessToken}` },
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error("Failed to get user:", error);
    }
    return null;
  }

  async getBilling(): Promise<TokenBalance | null> {
    if (!this.isAuthenticated()) return null;

    try {
      const response = await fetch(`${this.apiUrl}/billing/balance`, {
        headers: { Authorization: `Bearer ${this.session!.accessToken}` },
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error("Failed to get billing:", error);
    }
    return null;
  }

  private saveSession(): void {
    if (this.session) {
      Bun.write(
        Bun.env.HOME + "/.wabisabi/session.json",
        JSON.stringify(this.session),
      );
    }
  }

  private loadSession(): void {
    try {
      const sessionFile = Bun.env.HOME + "/.wabisabi/session.json";
      const content = Bun.file(sessionFile).text();
      this.session = JSON.parse(content);
    } catch {
      this.session = null;
    }
  }

  private clearSession(): void {
    try {
      Bun.deleteFile(Bun.env.HOME + "/.wabisabi/session.json");
    } catch {}
  }

  constructor() {
    this.loadSession();
  }
}

export const auth = new AuthSystem();
export async function login(provider: "google" | "github" | "email") {
  return auth.login(provider);
}
export async function handleCallback(code: string) {
  return auth.handleCallback(code);
}
export async function logout() {
  return auth.logout();
}
export async function getUser() {
  return auth.getUser();
}
export async function getBilling() {
  return auth.getBilling();
}
export function isAuthenticated() {
  return auth.isAuthenticated();
}
