import { chromium, type FullConfig } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { loginViaMagicLink } from './helpers/auth-bootstrap';

const memberStatePath = 'e2e/.auth/member.json';
const adminStatePath = 'e2e/.auth/admin.json';

async function ensureAuthDir() {
  await mkdir('e2e/.auth', { recursive: true });
}

export default async function globalSetup(config: FullConfig) {
  await ensureAuthDir();

  const baseURL = config.projects[0]?.use?.baseURL;
  const browser = await chromium.launch();

  const memberContext = await browser.newContext({ baseURL: String(baseURL) });
  const memberPage = await memberContext.newPage();
  await loginViaMagicLink({ page: memberPage, email: 'jan.novak@example.com' });
  await memberContext.storageState({ path: memberStatePath });
  await memberContext.close();

  const adminContext = await browser.newContext({ baseURL: String(baseURL) });
  const adminPage = await adminContext.newPage();
  await loginViaMagicLink({ page: adminPage, email: 'spravce.arealu@example.com' });
  await adminContext.storageState({ path: adminStatePath });
  await adminContext.close();

  await browser.close();
}
