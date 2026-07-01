import { NextResponse } from "next/server";
import type { Category } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

export async function GET() {
  const { data, error, response } = await upstream.GET("/categories");

  if (error) {
    return NextResponse.json(error, { status: (response as Response).status });
  }

  return NextResponse.json<Category[]>(data as unknown as Category[]);
}
