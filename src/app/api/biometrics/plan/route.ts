import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import type { BioHarmonizationPlan } from '@/lib/biometrics/types';

const dataFilePath = path.join(process.cwd(), 'src', 'data', 'biometrics-plan.json');

async function getPlan(): Promise<BioHarmonizationPlan> {
  const fileContents = await fs.readFile(dataFilePath, 'utf8');
  return JSON.parse(fileContents);
}

async function savePlan(plan: BioHarmonizationPlan): Promise<void> {
  await fs.writeFile(dataFilePath, JSON.stringify(plan, null, 2), 'utf8');
}

export async function GET(request: Request) {
  const plan = await getPlan();
  return NextResponse.json(plan);
}

export async function POST(request: Request) {
  const newPlan = await request.json();
  const currentPlan = await getPlan();
  const updatedPlan = { ...currentPlan, ...newPlan };
  await savePlan(updatedPlan);
  return NextResponse.json(updatedPlan);
}
