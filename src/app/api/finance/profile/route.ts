import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import type { FinancialProfile } from '@/lib/finance/types';

const dataFilePath = path.join(process.cwd(), 'src', 'data', 'finance-profile.json');

async function getProfile(): Promise<FinancialProfile> {
  const fileContents = await fs.readFile(dataFilePath, 'utf8');
  return JSON.parse(fileContents);
}

async function saveProfile(profile: FinancialProfile): Promise<void> {
  await fs.writeFile(dataFilePath, JSON.stringify(profile, null, 2), 'utf8');
}

export async function GET(request: Request) {
  const profile = await getProfile();
  return NextResponse.json(profile);
}

export async function POST(request: Request) {
  const newProfile = await request.json();
  const currentProfile = await getProfile();
  const updatedProfile = { ...currentProfile, ...newProfile };
  await saveProfile(updatedProfile);
  return NextResponse.json(updatedProfile);
}
