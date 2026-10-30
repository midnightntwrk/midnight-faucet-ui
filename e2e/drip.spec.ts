import { expect, test, type Page } from '@playwright/test'
import {
  CAPTCHA_TOKEN,
  captchaResets,
  drip,
  NOT_SERVING,
  setupApp,
  solveCaptcha,
  type FaucetMock,
} from './helpers'

const ADDRESS = 'mn_shield-addr_test1abcdefghijklmnopqrstuvwxyz'

const addressField = (page: Page) => page.getByPlaceholder('unshielded address')
const requestButton = (page: Page) => page.getByRole('button', { name: /request/i })
const errorMessage = (page: Page) => page.getByRole('alert')
const statusMessage = (page: Page) => page.locator('p.status-message')
const explorerLink = (page: Page) => page.getByRole('link', { name: 'View your transaction' })

const openApp = async (page: Page, mock: FaucetMock = {}) => {
  const dripRequests = await setupApp(page, mock)
  await page.goto('/')
  // The button only unlocks once the health check has come back.
  await expect(page.getByRole('combobox').locator('.status')).toHaveAttribute(
    'data-status',
    'reachable',
  )
  return dripRequests
}

test.describe('requesting a drip', () => {
  test('keeps the button disabled until an address is entered', async ({ page }) => {
    await openApp(page)

    await expect(requestButton(page)).toBeDisabled()
    await addressField(page).fill(ADDRESS)
    await expect(requestButton(page)).toBeEnabled()

    await addressField(page).fill('   ')
    await expect(requestButton(page)).toBeDisabled()
  })

  test('keeps the button disabled while the faucet is not serving', async ({ page }) => {
    await setupApp(page, { health: NOT_SERVING })
    await page.goto('/')

    await addressField(page).fill(ADDRESS)
    await expect(requestButton(page)).toBeDisabled()
  })

  test('sends the trimmed address, the amount and the captcha token', async ({ page }) => {
    const dripRequests = await openApp(page, {
      drip: { body: drip({ status: 'CONFIRMED', transactionHash: '0xabc' }) },
    })

    await addressField(page).fill(`  ${ADDRESS}  `)
    await requestButton(page).click()
    await expect(explorerLink(page)).toBeVisible()

    expect(dripRequests).toHaveLength(1)
    expect(dripRequests[0].body).toEqual({ recipientAddress: ADDRESS, amount: '1000' })
    expect(dripRequests[0].captchaToken).toBe(CAPTCHA_TOKEN)
  })

  test('confirms immediately when the faucet settles the drip on submission', async ({ page }) => {
    await openApp(page, { drip: { body: drip({ status: 'CONFIRMED', transactionHash: '0xabc' }) } })

    await addressField(page).fill(ADDRESS)
    await requestButton(page).click()

    await expect(statusMessage(page)).toContainText('confirmed')
    await expect(explorerLink(page)).toHaveAttribute(
      'href',
      'https://devnet.midnightexplorer.com/transactions/0xabc',
    )
    await expect(explorerLink(page)).toHaveAttribute('target', '_blank')
  })

  test('polls a pending drip until it is confirmed', async ({ page }) => {
    await openApp(page, {
      drip: { body: drip({ status: 'PENDING', taskStatus: 'QUEUED' }) },
      dripStatuses: [
        drip({ status: 'PENDING', taskStatus: 'SUBMITTING' }),
        drip({ status: 'CONFIRMED', taskStatus: 'DONE', transactionHash: '0xfeed' }),
      ],
    })

    await addressField(page).fill(ADDRESS)
    await requestButton(page).click()

    await expect(statusMessage(page)).toContainText('it will take a few seconds')
    // Polling runs every 2s, so allow a few cycles before giving up.
    await expect(statusMessage(page)).toContainText('confirmed', { timeout: 15_000 })
    await expect(explorerLink(page)).toHaveAttribute(
      'href',
      'https://devnet.midnightexplorer.com/transactions/0xfeed',
    )
  })

  test('reports a drip that fails while pending', async ({ page }) => {
    await openApp(page, {
      drip: { body: drip({ status: 'PENDING' }) },
      dripStatuses: [drip({ status: 'FAILED', error: 'wallet balance too low' })],
    })

    await addressField(page).fill(ADDRESS)
    await requestButton(page).click()

    await expect(errorMessage(page)).toHaveText('wallet balance too low', { timeout: 15_000 })
    await expect(explorerLink(page)).toHaveCount(0)
  })

  test('reports a rejected request with its status code', async ({ page }) => {
    await openApp(page, { drip: { status: 429, body: { error: 'rate limited' } } })

    await addressField(page).fill(ADDRESS)
    await requestButton(page).click()

    await expect(errorMessage(page)).toContainText('429')
    await expect(errorMessage(page)).toContainText('rate limited')
  })

  test('resets the captcha after a drip settles so the token cannot be reused', async ({ page }) => {
    await openApp(page, { drip: { body: drip({ status: 'CONFIRMED', transactionHash: '0xabc' }) } })

    await addressField(page).fill(ADDRESS)
    await requestButton(page).click()
    await expect(explorerLink(page)).toBeVisible()

    expect(await captchaResets(page)).toBe(1)
    await expect(requestButton(page)).toBeDisabled()

    await solveCaptcha(page)
    await expect(requestButton(page)).toBeEnabled()
  })
})

test.describe('switching network mid-flight', () => {
  test('re-checks the newly selected network before allowing another request', async ({ page }) => {
    await openApp(page)
    await addressField(page).fill(ADDRESS)
    await expect(requestButton(page)).toBeEnabled()

    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: 'preprod' }).click()

    await expect(page.getByRole('combobox').locator('.label')).toHaveText('preprod')
    await expect(requestButton(page)).toBeEnabled()
  })

  test('sends the request to the network that is selected', async ({ page }) => {
    const dripRequests = await openApp(page, {
      drip: { body: drip({ status: 'CONFIRMED', transactionHash: '0xabc' }) },
    })

    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: 'preview' }).click()
    await addressField(page).fill(ADDRESS)

    const request = page.waitForRequest((r) => r.url().endsWith('/api/drips') && r.method() === 'POST')
    await requestButton(page).click()
    expect((await request).url()).toBe('https://faucet.preview.midnight.network/api/drips')

    await expect(explorerLink(page)).toHaveAttribute(
      'href',
      'https://preview.midnightexplorer.com/transactions/0xabc',
    )
    expect(dripRequests).toHaveLength(1)
  })
})
