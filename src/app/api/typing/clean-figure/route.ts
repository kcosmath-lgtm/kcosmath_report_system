import { NextResponse } from "next/server";

// Stale clients must not incur image-generation costs.
export async function POST() {
  return NextResponse.json({ code: "FIGURE_GENERATION_DISABLED" }, { status: 410 });
}
