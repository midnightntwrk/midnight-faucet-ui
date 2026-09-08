import { expect, test, type Page } from '@playwright/test'
import { NOT_READY, NOT_SERVING, optionLabels, setupApp, unreachable } from './helpers'

const trigger = (page: Page) => page.getByRole('combobox')
const menu = (page: Page) => page.getByRole('listbox')
const option = (page: Page, network: string) => page.getByRole('option', { name: network })

/**
 * Which networks are offered depends on the build, so the number of ArrowDown
 * presses needed to reach one is read from the rendered list rather than assumed.
 */
const stepsBetween = async (page: Page, from: string, to: string) => {
  const labels = await optionLabels(page)
  return labels.indexOf(to) - labels.indexOf(from)
}

test.describe('network selection', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page)
    await page.goto('/')
  })

  test('starts on devnet and reports it reachable', async ({ page }) => {
    await expect(trigger(page).locator('.label')).toHaveText('devnet')
    await expect(trigger(page).locator('.status')).toHaveAttribute('data-status', 'reachable')
    await expect(page.locator('p.failure-message')).toHaveCount(0)
  })

  test('offers the deployed networks', async ({ page }) => {
    await trigger(page).click()

    await expect(menu(page)).toBeVisible()
    for (const network of ['devnet', 'qanet', 'preview', 'preprod']) {
      await expect(option(page, network)).toBeVisible()
    }
  })

  test('marks the current network as selected', async ({ page }) => {
    await trigger(page).click()

    await expect(option(page, 'devnet')).toHaveAttribute('aria-selected', 'true')
    await expect(option(page, 'preview')).toHaveAttribute('aria-selected', 'false')
  })

  test('switches network when an option is clicked', async ({ page }) => {
    await trigger(page).click()
    await option(page, 'preview').click()

    await expect(trigger(page).locator('.label')).toHaveText('preview')
    await expect(menu(page)).toBeHidden()
    await expect(trigger(page).locator('.status')).toHaveAttribute('data-status', 'reachable')
  })

  test('closes without changing anything when clicking outside', async ({ page }) => {
    await trigger(page).click()
    await expect(menu(page)).toBeVisible()

    await page.locator('p.app-tagline').click()

    await expect(menu(page)).toBeHidden()
    await expect(trigger(page).locator('.label')).toHaveText('devnet')
  })

  test('can be driven entirely from the keyboard', async ({ page }) => {
    await trigger(page).focus()
    await page.keyboard.press('ArrowDown')
    await expect(menu(page)).toBeVisible()

    const steps = await stepsBetween(page, 'devnet', 'qanet')
    for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(trigger(page).locator('.label')).toHaveText('qanet')
    await expect(menu(page)).toBeHidden()
  })

  test('closes on Escape without changing the network', async ({ page }) => {
    await trigger(page).focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')

    await expect(menu(page)).toBeHidden()
    await expect(trigger(page).locator('.label')).toHaveText('devnet')
  })
})

test.describe('network health', () => {
  test('explains why a faucet is not serving', async ({ page }) => {
    await setupApp(page, { health: NOT_SERVING })
    await page.goto('/')

    await expect(trigger(page).locator('.status')).toHaveAttribute('data-status', 'unreachable')
    await expect(page.locator('p.failure-message')).toHaveText('faucet: SERVICES_DOWN')
  })

  test('names the dependency that is down', async ({ page }) => {
    await setupApp(page, { ready: NOT_READY })
    await page.goto('/')

    await expect(page.locator('p.failure-message')).toHaveText('node is down')
  })

  test('reports the service as down when nothing answers', async ({ page }) => {
    await setupApp(page, { health: unreachable(), ready: unreachable() })
    await page.goto('/')

    await expect(page.locator('p.failure-message')).toHaveText('service is down')
  })
})
