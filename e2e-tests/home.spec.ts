import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Derive the expected posting count from the job content collection so this
// assertion stays correct as roles are added or removed.
const jobsDir = fileURLToPath(new URL('../src/content/jobs', import.meta.url));
const expectedRoleCount = readdirSync(jobsDir).filter((f) => f.endsWith('.md')).length;

/** Card identity and filter values used to derive expected results from rendered postings. */
interface RoleMetadata {
  slug: string;
  department: string;
  location: string;
}

/**
 * Reads metadata from all cards, including cards hidden by filtering.
 *
 * @param page - The browser page displaying the roles listing.
 * @returns Role metadata in the original card order.
 * @throws Error if a card lacks its identity, department, or location.
 */
async function readRoles(page: Page): Promise<RoleMetadata[]> {
  return page.getByTestId('role-card').evaluateAll((cards) => cards.map((card) => {
    const slug = card.getAttribute('data-job-id');
    const department = card.getAttribute('data-department');
    const location = card.querySelector('[data-testid="role-location"]')?.textContent?.trim();
    if (!slug || !department || !location) {
      throw new Error('Role card is missing expected job metadata.');
    }
    return { slug, department, location };
  }));
}

/**
 * Verifies visible card identities, ordering, and the announced result count.
 *
 * @param page - The browser page displaying the roles listing.
 * @param roles - Expected visible roles in display order.
 */
async function expectVisibleRoles(page: Page, roles: RoleMetadata[]): Promise<void> {
  const visibleCards = page.getByTestId('role-card').filter({ visible: true });
  await expect(visibleCards).toHaveCount(roles.length);
  for (const [index, role] of roles.entries()) {
    await expect(visibleCards.nth(index)).toHaveAttribute('data-job-id', role.slug);
  }
  await expect(page.getByRole('status')).toHaveText(
    `${roles.length} ${roles.length === 1 ? 'role' : 'roles'} found`,
  );
}

test.describe('Role filters', () => {
  test('starts unfiltered with complete alphabetical options that remain available', async ({ page }) => {
    await page.goto('/');
    const roles = await readRoles(page);
    const department = page.getByRole('combobox', { name: 'Department', exact: true });
    const location = page.getByRole('combobox', { name: 'Location', exact: true });
    const departments = [...new Set(roles.map((role) => role.department))]
      .sort((a, b) => a.localeCompare(b, 'en'));
    const locations = [...new Set(roles.map((role) => role.location))]
      .sort((a, b) => a.localeCompare(b, 'en'));

    await expect(department).toHaveValue('');
    await expect(location).toHaveValue('');
    await expect(department.locator('option')).toHaveText(['All departments', ...departments]);
    await expect(location.locator('option')).toHaveText(['All locations', ...locations]);
    await expectVisibleRoles(page, roles);
    await department.selectOption('Technology');
    await expect(location.locator('option')).toHaveText(['All locations', ...locations]);
    await location.selectOption('Woodinville, WA, USA');
    await expect(department.locator('option')).toHaveText(['All departments', ...departments]);
  });

  for (const filter of [
    { field: 'department', label: 'Department', value: 'Finance' },
    { field: 'location', label: 'Location', value: 'Remote (US & Canada)' },
  ] as const) {
    test(`filters by ${filter.field} independently and resets`, async ({ page }) => {
      await page.goto('/');
      const roles = await readRoles(page);
      const control = page.getByRole('combobox', { name: filter.label, exact: true });

      await control.selectOption(filter.value);
      await expectVisibleRoles(page, roles.filter((role) => role[filter.field] === filter.value));
      await expect(page.getByTestId('empty-state')).toBeHidden();
      await page.getByRole('button', { name: 'Reset filters' }).click();
      await expect(page.getByTestId('department-filter')).toHaveValue('');
      await expect(page.getByTestId('location-filter')).toHaveValue('');
      await expectVisibleRoles(page, roles);
    });
  }

  test('combines both filters and clears each independently', async ({ page }) => {
    await page.goto('/');
    const roles = await readRoles(page);
    const department = page.getByTestId('department-filter');
    const location = page.getByTestId('location-filter');

    await test.step('Both selections must match', async () => {
      await department.selectOption('Finance');
      await location.selectOption('Woodinville, WA, USA');
      await expectVisibleRoles(page, roles.filter((role) =>
        role.department === 'Finance' && role.location === 'Woodinville, WA, USA',
      ));
    });
    await test.step('Clearing department keeps the location selection', async () => {
      await department.selectOption('');
      await expect(location).toHaveValue('Woodinville, WA, USA');
      await expectVisibleRoles(page, roles.filter((role) => role.location === 'Woodinville, WA, USA'));
    });
    await test.step('Clearing location keeps the department selection', async () => {
      await department.selectOption('Finance');
      await location.selectOption('');
      await expect(department).toHaveValue('Finance');
      await expectVisibleRoles(page, roles.filter((role) => role.department === 'Finance'));
    });
    await location.selectOption('Woodinville, WA, USA');
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(department).toHaveValue('');
    await expect(location).toHaveValue('');
    await expectVisibleRoles(page, roles);
  });

  test('explains empty combinations, hides unmatched links, and recovers on reset', async ({ page }) => {
    await page.goto('/');
    const roles = await readRoles(page);
    await page.getByTestId('department-filter').selectOption('Technology');
    await page.getByTestId('location-filter').selectOption('Woodinville, WA, USA');

    await expectVisibleRoles(page, []);
    await expect(page.getByTestId('roles-grid')).toBeHidden();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('empty-state-text')).toHaveText(
      'No roles match these filters. Try another department or location, or reset the filters.',
    );
    await expect(page.getByRole('link', { name: /View role/ })).toHaveCount(0);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(page.getByTestId('department-filter')).toHaveValue('');
    await expect(page.getByTestId('location-filter')).toHaveValue('');
    await expectVisibleRoles(page, roles);
    await expect(page.getByTestId('empty-state')).toBeHidden();
    await expect(page.getByTestId('roles-grid')).toBeVisible();
  });

  test('reload starts with all roles and does not persist filter state', async ({ page }) => {
    await page.goto('/');
    const roles = await readRoles(page);
    await page.getByTestId('department-filter').selectOption('Finance');
    await page.getByTestId('location-filter').selectOption('Woodinville, WA, USA');
    await page.reload();
    await expect(page.getByTestId('department-filter')).toBeVisible();
    await expect(page.getByTestId('department-filter')).toHaveValue('');
    await expect(page.getByTestId('location-filter')).toHaveValue('');
    await expectVisibleRoles(page, roles);
    await expect(page).toHaveURL('/');
  });

  test('supports keyboard selection and reset with visible focus', async ({ page }) => {
    await page.goto('/');
    const roles = await readRoles(page);
    const department = page.getByTestId('department-filter');
    await department.focus();
    await expect(department).toBeFocused();
    await expect(department).not.toHaveCSS('box-shadow', 'none');
    await department.press('ArrowDown');
    const selection = await department.inputValue();
    expect(selection).not.toBe('');
    await expectVisibleRoles(page, roles.filter((role) => role.department === selection));
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('location-filter')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Reset filters' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expectVisibleRoles(page, roles);
  });

  test('fits filter controls on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.getByTestId('department-filter')).toBeVisible();
    await expect(page.getByTestId('location-filter')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.getByTestId('department-filter').selectOption('Technology');
    await expectVisibleRoles(page, (await readRoles(page)).filter((role) => role.department === 'Technology'));
  });

  test('keeps all roles browsable without JavaScript and hides inactive controls', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.getByTestId('role-card').filter({ visible: true })).toHaveCount(expectedRoleCount);
      await expect(page.getByTestId('department-filter')).toBeHidden();
      await expect(page.getByTestId('location-filter')).toBeHidden();
      await expect(page.getByTestId('reset-filters')).toBeHidden();
      await expect(page.getByTestId('empty-state')).toBeHidden();
      await page.getByTestId('role-card').first().click();
      await expect(page.getByTestId('role-detail-title')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe('Open roles listing', () => {
    test('shows the roles grid with all postings', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Open roles' })).toBeVisible();

        const grid = page.getByTestId('roles-grid');
        await expect(grid).toBeVisible();
        await expect(page.getByTestId('role-card')).toHaveCount(expectedRoleCount);
    });

    test('links through to a role detail page', async ({ page }) => {
        await page.goto('/');
        const firstCard = page.getByTestId('role-card').first();
        const title = await firstCard.getByTestId('role-title').textContent();
        await firstCard.click();
        await expect(page.getByTestId('role-detail-title')).toHaveText(title!.trim());
        await expect(page.getByTestId('apply-form')).toBeVisible();
    });

    for (const { title, location } of [
        { title: 'Senior Frontend Engineer', location: 'Remote (US & Canada)' },
        { title: 'Financial Analyst', location: 'Woodinville, WA, USA' },
    ]) {
        test(`shows ${title} location on cards and details`, async ({ page }) => {
            await page.goto('/');
            const card = page.getByTestId('role-card').filter({
                has: page.getByRole('heading', { name: title, exact: true }),
            });

            await expect(card).toBeVisible();
            await expect(card.getByTestId('role-location')).toHaveText(location);
            await expect(card.getByTestId('role-location')).toBeVisible();
            await card.click();
            await expect(page.getByText(location, { exact: true })).toBeVisible();
        });
    }

    test('has no automatically detectable accessibility violations', async ({ page }) => {
        await page.goto('/');
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();
        expect(results.violations).toEqual([]);
    });
});
