import { NextRequest, NextResponse } from "next/server";

async function verifyAdminToken(
  request: NextRequest,
): Promise<{ valid: boolean; userId?: string; role?: string }> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false };
  }

  const token = authHeader.split(" ")[1];

  return { valid: true, userId: "demo", role: "admin" };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdminToken(request);

    if (
      !auth.valid ||
      !["admin", "superadmin", "root"].includes(auth.role || "")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const role = searchParams.get("role");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const mockUsers = [
      {
        id: "1",
        email: "antonio@example.com",
        name: "Antonio",
        role: "admin",
        status: "active",
        plan: "pro",
        tokensUsed: 500000,
        createdAt: "2024-01-15",
        lastLogin: new Date().toISOString(),
      },
      {
        id: "2",
        email: "demo@example.com",
        name: "Demo User",
        role: "user",
        status: "active",
        plan: "free",
        tokensUsed: 5000,
        createdAt: "2024-02-01",
        lastLogin: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: "3",
        email: "test@example.com",
        name: "Test User",
        role: "user",
        status: "active",
        plan: "free",
        tokensUsed: 1000,
        createdAt: "2024-02-10",
        lastLogin: new Date(Date.now() - 172800000).toISOString(),
      },
      {
        id: "4",
        email: "admin@example.com",
        name: "Super Admin",
        role: "superadmin",
        status: "active",
        plan: "enterprise",
        tokensUsed: 5000000,
        createdAt: "2024-01-01",
        lastLogin: new Date().toISOString(),
      },
      {
        id: "5",
        email: "guest@example.com",
        name: "Guest User",
        role: "viewer",
        status: "suspended",
        plan: "free",
        tokensUsed: 0,
        createdAt: "2024-02-15",
        lastLogin: new Date(Date.now() - 604800000).toISOString(),
      },
      {
        id: "6",
        email: "developer@example.com",
        name: "Developer",
        role: "admin",
        status: "active",
        plan: "pro",
        tokensUsed: 250000,
        createdAt: "2024-01-20",
        lastLogin: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "7",
        email: "researcher@example.com",
        name: "Researcher",
        role: "user",
        status: "active",
        plan: "pro",
        tokensUsed: 150000,
        createdAt: "2024-02-05",
        lastLogin: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: "8",
        email: "viewer@example.com",
        name: "Viewer Only",
        role: "viewer",
        status: "active",
        plan: "free",
        tokensUsed: 100,
        createdAt: "2024-02-18",
        lastLogin: new Date(Date.now() - 259200000).toISOString(),
      },
    ];

    let filtered = mockUsers;

    if (status) {
      filtered = filtered.filter((u) => u.status === status);
    }

    if (role) {
      filtered = filtered.filter((u) => u.role === role);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.name.toLowerCase().includes(searchLower) ||
          u.email.toLowerCase().includes(searchLower),
      );
    }

    const paginated = filtered.slice(offset, offset + limit);

    return NextResponse.json({ users: paginated, total: filtered.length });
  } catch (error) {
    console.error("Admin users error:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdminToken(request);

    if (!auth.valid || !["superadmin", "root"].includes(auth.role || "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { email, name, password, role } = body;

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, userId: "user_" + Date.now() });
  } catch (error) {
    console.error("Admin create user error:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 },
    );
  }
}
