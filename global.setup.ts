import { request, FullConfig } from '@playwright/test';
import * as fs from 'fs';

async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  // Create a new API request context
  const requestContext = await request.newContext();

  // Get the session token from our test endpoint
  await requestContext.post(`${baseURL}/api/test/session`);

  // Save the storage state to a file
  await requestContext.storageState({ path: 'storageState.json' });
  await requestContext.dispose();
}

export default globalSetup;
