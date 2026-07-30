import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { canvasConnections } from "../db/schema";
import type { CanvasAssignment, CanvasClient, CourseGrade } from "./canvasClient";

const FIXTURE_GRADES: CourseGrade[] = [
  {
    courseId: "course-1",
    courseName: "History 101",
    currentScore: 88,
    currentGrade: "B+",
    finalScore: null,
    finalGrade: null,
  },
  {
    courseId: "course-2",
    courseName: "Calculus II",
    currentScore: 76,
    currentGrade: "C+",
    finalScore: null,
    finalGrade: null,
  },
  {
    courseId: "course-3",
    courseName: "Chemistry Lab",
    currentScore: null,
    currentGrade: null,
    finalScore: null,
    finalGrade: null,
  },
];

const FIXTURE_ASSIGNMENTS: CanvasAssignment[] = [
  {
    canvasId: "canvas-101",
    title: "Essay: The Causes of the French Revolution",
    description: "1500-word essay covering political, social, and economic causes.",
    deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    pointsPossible: 100,
  },
  {
    canvasId: "canvas-102",
    title: "Problem Set 4: Differential Equations",
    description: "Chapter 6 exercises 1-20.",
    deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    pointsPossible: 50,
  },
  {
    canvasId: "canvas-103",
    title: "Lab Report: Titration Experiment",
    description: null,
    deadline: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
    pointsPossible: 25,
  },
];

export class MockCanvasClient implements CanvasClient {
  async connect(userId: string, canvasBaseUrl: string, apiToken: string): Promise<void> {
    await db.insert(canvasConnections).values({
      id: randomUUID(),
      userId,
      canvasBaseUrl,
      accessToken: apiToken,
    });
  }

  async disconnect(userId: string): Promise<void> {
    await db.delete(canvasConnections).where(eq(canvasConnections.userId, userId));
  }

  async isConnected(userId: string): Promise<boolean> {
    const [connection] = await db
      .select({ id: canvasConnections.id })
      .from(canvasConnections)
      .where(eq(canvasConnections.userId, userId))
      .limit(1);
    return connection !== undefined;
  }

  async listAssignments(_userId: string): Promise<CanvasAssignment[]> {
    return FIXTURE_ASSIGNMENTS;
  }

  async getAssignment(_userId: string, canvasId: string): Promise<CanvasAssignment | null> {
    return FIXTURE_ASSIGNMENTS.find((a) => a.canvasId === canvasId) ?? null;
  }

  async listGrades(_userId: string): Promise<CourseGrade[]> {
    return FIXTURE_GRADES;
  }
}

export const canvasClient: CanvasClient = new MockCanvasClient();
