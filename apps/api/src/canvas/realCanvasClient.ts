import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { canvasConnections } from "../db/schema";
import type { CanvasAssignment, CanvasClient } from "./canvasClient";

const PER_PAGE = 100;

interface CanvasCourse {
  id: number;
}

interface CanvasAssignmentDto {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function canvasFetch<T>(baseUrl: string, apiToken: string, path: string): Promise<T> {
  const response = await fetch(`${stripTrailingSlash(baseUrl)}${path}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `Canvas API request to ${path} failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

async function getConnection(
  userId: string,
): Promise<{ canvasBaseUrl: string; accessToken: string } | null> {
  const [connection] = await db
    .select({
      canvasBaseUrl: canvasConnections.canvasBaseUrl,
      accessToken: canvasConnections.accessToken,
    })
    .from(canvasConnections)
    .where(eq(canvasConnections.userId, userId))
    .limit(1);

  return connection ?? null;
}

export class RealCanvasClient implements CanvasClient {
  async connect(userId: string, canvasBaseUrl: string, apiToken: string): Promise<void> {
    // Validate the base URL + token before saving anything, so a typo doesn't surface as a
    // silent failure later when the student asks for their assignments over WhatsApp.
    await canvasFetch(canvasBaseUrl, apiToken, "/api/v1/users/self");

    await db
      .insert(canvasConnections)
      .values({ id: randomUUID(), userId, canvasBaseUrl, accessToken: apiToken })
      .onConflictDoUpdate({
        target: canvasConnections.userId,
        set: { canvasBaseUrl, accessToken: apiToken },
      });
  }

  async disconnect(userId: string): Promise<void> {
    await db.delete(canvasConnections).where(eq(canvasConnections.userId, userId));
  }

  async isConnected(userId: string): Promise<boolean> {
    return (await getConnection(userId)) !== null;
  }

  async listAssignments(userId: string): Promise<CanvasAssignment[]> {
    const connection = await getConnection(userId);
    if (!connection) {
      throw new Error("Canvas is not connected for this account.");
    }
    const { canvasBaseUrl, accessToken } = connection;

    const courses = await canvasFetch<CanvasCourse[]>(
      canvasBaseUrl,
      accessToken,
      `/api/v1/courses?enrollment_state=active&per_page=${PER_PAGE}`,
    );

    const perCourseAssignments = await Promise.all(
      courses.map((course) =>
        canvasFetch<CanvasAssignmentDto[]>(
          canvasBaseUrl,
          accessToken,
          `/api/v1/courses/${course.id}/assignments?bucket=upcoming&per_page=${PER_PAGE}`,
        ),
      ),
    );

    return perCourseAssignments.flat().map((assignment) => ({
      canvasId: String(assignment.id),
      title: assignment.name,
      description: assignment.description,
      deadline: assignment.due_at ? new Date(assignment.due_at) : new Date(0),
      pointsPossible: assignment.points_possible,
    }));
  }

  async getAssignment(userId: string, canvasId: string): Promise<CanvasAssignment | null> {
    const assignments = await this.listAssignments(userId);
    return assignments.find((a) => a.canvasId === canvasId) ?? null;
  }
}

export const canvasClient: CanvasClient = new RealCanvasClient();
