import { expect, test } from '@playwright/test'
import { setupApp } from './helpers'

test.beforeEach(async ({ page }) => {
  await setupApp(page)
})

test.describe('app shell', () => {
  test('shows the branding and the drip form', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('img', { name: 'midnight' })).toBeVisible()
    await expect(page.locator('p.app-tagline')).toContainText('fourth generation blockchain')
    await expect(page.getByPlaceholder('unshielded address')).toBeVisible()
    await expect(page.getByRole('button', { name: 'request' })).toBeVisible()
    await expect(page.getByRole('combobox')).toBeVisible()
  })

  test('renders the captcha widget', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.turnstile-container[data-turnstile="rendered"]')).toBeAttached()
  })
})

test.describe('theme', () => {
  test('starts in dark mode', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: 'switch to light mode' })).toBeVisible()
  })

  test('switches to light mode and back', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'switch to light mode' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.getByRole('button', { name: 'switch to dark mode' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('remembers the chosen theme across a reload', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'switch to light mode' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.reload()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
})
