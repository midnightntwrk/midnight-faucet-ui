import type { Page, Route } from '@playwright/test'

export const CAPTCHA_TOKEN = 'e2e-turnstile-token'

/**
 * The faucet lives on a different origin than the app under test, so every stubbed
 * response has to carry the CORS headers the browser would otherwise demand.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

export type HealthBody =
  | { status: 'SERVING'; reason: null }
  | { status: 'NOT_SERVING'; reason: string }

export type ReadyBody = { status: 'ok' | 'not_ok'; details: Record<string, 'ok' | 'not_ok'> }

export type DripBody = {
  dripId: string
  status: 'PENDING' | 'CONFIRMED' | 'FAILED'
  taskStatus: string | null
  transactionHash: string | null
  error: string | null
}

export const SERVING: HealthBody = { status: 'SERVING', reason: null }
export const NOT_SERVING: HealthBody = { status: 'NOT_SERVING', reason: 'SERVICES_DOWN' }
export const READY: ReadyBody = { status: 'ok', details: { node: 'ok', indexer: 'ok' } }
export const NOT_READY: ReadyBody = { status: 'not_ok', details: { node: 'not_ok', indexer: 'ok' } }

export const drip = (overrides: Partial<DripBody> = {}): DripBody => ({
  dripId: 'drip-1',
  status: 'PENDING',
  taskStatus: null,
  transactionHash: null,
  error: null,
  ...overrides,
})

/** A host that cannot be reached at all, as opposed to one answering with bad news. */
const UNREACHABLE = 'unreachable'
type Unreachable = typeof UNREACHABLE
export const unreachable = (): Unreachable => UNREACHABLE

export type FaucetMock = {
  health?: HealthBody | Unreachable
  ready?: ReadyBody | Unreachable
  /** The reply to POST /api/drips. */
  drip?: { status?: number; body: unknown }
  /** Replies to GET /api/drips/{id}, consumed in order; the last one repeats. */
  dripStatuses?: DripBody[]
}

export type DripRequest = { body: unknown; captchaToken: string | undefined }

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  })

/**
 * Serves the whole faucet API from canned replies so the tests never touch a real
 * network. Returns the drip requests the app made, for asserting on the payload.
 */
export const mockFaucetApi = async (page: Page, mock: FaucetMock = {}): Promise<DripRequest[]> => {
  const {
    health = SERVING,
    ready = READY,
    drip: dripReply = { status: 200, body: drip({ status: 'CONFIRMED', transactionHash: '0xabc' }) },
    dripStatuses = [],
  } = mock

  const statusQueue = [...dripStatuses]
  const dripRequests: DripRequest[] = []

  await page.route('**/api/**', async (route) => {
    const request = route.request()

    // The captcha header and JSON content type both make the browser preflight.
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS })
    }

    const path = new URL(request.url()).pathname

    if (path.endsWith('/api/health')) {
      return health === UNREACHABLE ? route.abort('failed') : json(route, 200, health)
    }

    if (path.endsWith('/api/ready')) {
      return ready === UNREACHABLE ? route.abort('failed') : json(route, 200, ready)
    }

    if (path.endsWith('/api/drips')) {
      dripRequests.push({
        body: request.postDataJSON(),
        captchaToken: request.headers()['x-captcha-token'],
      })
      return json(route, dripReply.status ?? 200, dripReply.body)
    }

    if (path.includes('/api/drips/')) {
      const next = statusQueue.length > 1 ? statusQueue.shift()! : statusQueue[0]
      return next ? json(route, 200, next) : json(route, 404, { error: 'unknown drip' })
    }

    return route.continue()
  })

  return dripRequests
}

/**
 * Replaces the Cloudflare widget with a local stand-in: the real one cannot be
 * driven from a test and would make the suite depend on an external service.
 */
export const mockTurnstile = async (page: Page, { autoSolve = true } = {}) => {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        window.__turnstileResets = 0;
        window.turnstile = {
          render: function (container, options) {
            container.setAttribute('data-turnstile', 'rendered');
            window.__turnstileOptions = options;
            if (${autoSolve}) options.callback(${JSON.stringify(CAPTCHA_TOKEN)});
            return 'stub-widget-id';
          },
          reset: function () {
            window.__turnstileResets++;
          },
          remove: function () {},
        };
        window.__solveCaptcha = function () {
          window.__turnstileOptions.callback(${JSON.stringify(CAPTCHA_TOKEN)});
        };
      `,
    }),
  )
}

/** Re-solves the captcha, which a user has to do after the app resets the widget. */
export const solveCaptcha = (page: Page) =>
  page.evaluate(() => (window as unknown as { __solveCaptcha: () => void }).__solveCaptcha())

/** How many times the app has reset the captcha widget. */
export const captchaResets = (page: Page) =>
  page.evaluate(() => (window as unknown as { __turnstileResets: number }).__turnstileResets)

/** Everything a page needs before it can be opened: stubbed faucet and stubbed captcha. */
export const setupApp = async (page: Page, mock: FaucetMock = {}) => {
  const dripRequests = await mockFaucetApi(page, mock)
  await mockTurnstile(page)
  return dripRequests
}

/** The option labels in the order the dropdown renders them. */
export const optionLabels = (page: Page) => page.locator('li.option .option-label').allTextContents()
