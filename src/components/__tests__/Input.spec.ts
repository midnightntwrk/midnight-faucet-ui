import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import axios from "axios";
import Input from "../Input.vue";
import { NETWORKS, TURNSTILE_TEST_SITE_KEY, type Network } from "../../constants";

type AxiosGet = (url: string, config?: unknown) => Promise<unknown>;
type AxiosPost = (
  url: string,
  body: unknown,
  config: { headers: Record<string, string> },
) => Promise<unknown>;

vi.mock("axios", () => {
  const get = vi.fn<AxiosGet>();
  const post = vi.fn<AxiosPost>();
  const isAxiosError = (e: unknown): boolean =>
    typeof e === "object" && e !== null && "isAxiosError" in e;
  return { default: { get, post, isAxiosError }, isAxiosError };
});

const mockedAxios = axios as unknown as { get: Mock<AxiosGet>; post: Mock<AxiosPost> };

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const FAKE_TOKEN = "fake-turnstile-token";
const POLL_INTERVAL_MS = 2000;

const SERVING = { status: "SERVING", reason: null };
const NOT_SERVING = { status: "NOT_SERVING", reason: "SERVICES_DOWN" };

/**
 * A canned axios reply: either a resolved response body or a rejected value.
 * Rejections are plain objects (not Errors) so they can mimic axios error shapes.
 */
type Reply = { data: unknown } | { reject: unknown };
const ok = (data: unknown): Reply => ({ data });
const fail = (reject: unknown): Reply => ({ reject });
const send = (reply: Reply) => ("reject" in reply ? Promise.reject(reply.reject) : Promise.resolve(reply));

const axiosError = (status: number, data: unknown) => ({ isAxiosError: true, response: { status, data } });

type DripStatus = "PENDING" | "CONFIRMED" | "FAILED";
const dripBody = (overrides: Partial<{
  dripId: string;
  status: DripStatus;
  taskStatus: string | null;
  transactionHash: string | null;
  error: string | null;
}> = {}) => ({
  dripId: "drip-1",
  status: "PENDING" as DripStatus,
  taskStatus: null,
  transactionHash: null,
  error: null,
  ...overrides,
});

const isHealthUrl = (url: string) => url.endsWith("api/health");

/**
 * Routes axios.get by URL: the health endpoint gets its own reply, everything
 * else is a drip-status poll and walks the queue. The last queued reply repeats
 * so polling can keep reading a terminal status.
 */
const mockGet = ({ health = ok(SERVING), statuses = [] as Reply[] } = {}) => {
  const queue = [...statuses];
  mockedAxios.get.mockImplementation((url: string) => {
    if (isHealthUrl(url)) return send(health);
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    if (!next) return Promise.reject(new Error(`unexpected drip status request: ${url}`));
    return send(next);
  });
};

type TurnstileOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
};

type TurnstileStub = {
  render: Mock<(container: HTMLElement, options: TurnstileOptions) => string>;
  reset: Mock<(widgetId?: string) => void>;
  remove: Mock<(widgetId?: string) => void>;
};

let turnstile: TurnstileStub;

/**
 * Stands in for the Cloudflare widget. By default it fires the success callback
 * synchronously so the captcha token is populated as soon as the component mounts.
 */
const installTurnstile = ({ immediateSuccess = true } = {}): TurnstileStub => {
  turnstile = {
    render: vi.fn<(container: HTMLElement, options: TurnstileOptions) => string>(
      (_container, options) => {
        if (immediateSuccess) options.callback?.(FAKE_TOKEN);
        return "widget-id";
      },
    ),
    reset: vi.fn<(widgetId?: string) => void>(),
    remove: vi.fn<(widgetId?: string) => void>(),
  };
  (window as unknown as { turnstile?: TurnstileStub }).turnstile = turnstile;
  return turnstile;
};

/** The options the component handed to the widget on its most recent render. */
const widgetOptions = (): TurnstileOptions => {
  const renders = turnstile.render.mock.calls;
  return renders[renders.length - 1]![1];
};

/**
 * Replays the success callback, which is how a user re-solves the captcha after the
 * component has reset it.
 */
const solveCaptcha = () => widgetOptions().callback?.(FAKE_TOKEN);

/**
 * jsdom never fires `load` for a real external script, so a script tag is planted
 * up front: the component then takes its "already present" branch and renders the
 * widget synchronously on mount.
 */
const installTurnstileScript = () => {
  const script = document.createElement("script");
  script.src = TURNSTILE_SCRIPT_SRC;
  document.head.appendChild(script);
};

const removeTurnstileScripts = () => {
  document
    .querySelectorAll(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)
    .forEach((script) => script.remove());
};

const mountInput = async (network: Network = "devnet") => {
  const wrapper = mount(Input, { props: { network } });
  await flushPromises();
  return wrapper;
};

const submit = async (wrapper: Awaited<ReturnType<typeof mountInput>>, address = "mn_addr_xyz") => {
  await wrapper.get("input.input").setValue(address);
  await wrapper.get("form").trigger("submit.prevent");
  await flushPromises();
};

const isDisabled = (wrapper: Awaited<ReturnType<typeof mountInput>>) =>
  wrapper.get("button.request-button").attributes("disabled") !== undefined;

beforeEach(() => {
  mockedAxios.get.mockReset();
  mockedAxios.post.mockReset();
  mockGet();
  installTurnstile();
  installTurnstileScript();
});

afterEach(() => {
  removeTurnstileScripts();
  delete (window as unknown as { turnstile?: TurnstileStub }).turnstile;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Input — submit button availability", () => {
  it("starts disabled while the health check is still in flight", () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {}));
    const wrapper = mount(Input, { props: { network: "devnet" } });
    expect(isDisabled(wrapper)).toBe(true);
  });

  it("enables once address, captcha and a serving faucet are all present", async () => {
    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("mn_addr_xyz");
    expect(isDisabled(wrapper)).toBe(false);
  });

  it("stays disabled when the faucet reports NOT_SERVING", async () => {
    mockGet({ health: ok(NOT_SERVING) });
    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("mn_addr_xyz");
    expect(isDisabled(wrapper)).toBe(true);
  });

  it("stays disabled when the health request cannot be reached", async () => {
    mockGet({ health: fail(new Error("network down")) });
    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("mn_addr_xyz");
    expect(isDisabled(wrapper)).toBe(true);
  });

  it("stays disabled when the address is only whitespace", async () => {
    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("   ");
    expect(isDisabled(wrapper)).toBe(true);
  });

  it("stays disabled until the captcha resolves", async () => {
    installTurnstile({ immediateSuccess: false });
    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("mn_addr_xyz");
    expect(isDisabled(wrapper)).toBe(true);
  });

  it("locks the form while a request is in flight", async () => {
    mockedAxios.post.mockReturnValue(new Promise(() => {}));
    const wrapper = await mountInput();
    await submit(wrapper);

    expect(isDisabled(wrapper)).toBe(true);
    expect(wrapper.get("input.input").attributes("disabled")).toBeDefined();
    expect(wrapper.get("button.request-button").text()).toContain("requesting");
  });
});

describe("Input — drip request", () => {
  it("posts the trimmed address, amount and captcha header to the selected network", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "CONFIRMED", transactionHash: "0xabc" }) });

    const wrapper = await mountInput("preview");
    await submit(wrapper, "  mn_addr_xyz  ");

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockedAxios.post.mock.calls[0]!;
    expect(url).toBe(`${NETWORKS.preview}api/drips`);
    expect(body).toEqual({ recipientAddress: "mn_addr_xyz", amount: "1000" });
    expect(config.headers["X-Captcha-Token"]).toBe(FAKE_TOKEN);
    expect(config.headers["Content-Type"]).toBe("application/json");
  });

  it("shows the explorer link for the selected chain once confirmed", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "CONFIRMED", transactionHash: "0xabc" }) });

    const wrapper = await mountInput("qanet");
    await submit(wrapper);

    const link = wrapper.get("a.explorer-link");
    expect(link.attributes("href")).toBe("https://qanet.midnightexplorer.com/transactions/0xabc");
    expect(link.attributes("rel")).toContain("noopener");
    expect(wrapper.get("p.status-message").text()).toContain("confirmed");
  });

  it("confirms without a link when no transaction hash comes back", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "CONFIRMED" }) });

    const wrapper = await mountInput();
    await submit(wrapper);

    expect(wrapper.find("a.explorer-link").exists()).toBe(false);
    expect(wrapper.get("p.status-message").text()).toBe("confirmed");
  });

  it("reports the pending status while the drip is queued", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "PENDING", taskStatus: "QUEUED" }) });
    mockGet({ statuses: [ok(dripBody({ status: "PENDING", taskStatus: "QUEUED" }))] });

    const wrapper = await mountInput();
    await submit(wrapper);

    expect(wrapper.get("p.status-message").text()).toContain("it will take a few seconds");
  });

  it("surfaces the server-provided reason when the drip comes back FAILED", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "FAILED", error: "insufficient funds" }) });

    const wrapper = await mountInput();
    await submit(wrapper);

    expect(wrapper.get("p.error-message").text()).toBe("insufficient funds");
    expect(wrapper.find("p.status-message").exists()).toBe(false);
  });

  it("falls back to a generic message when a FAILED drip carries no reason", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "FAILED" }) });

    const wrapper = await mountInput();
    await submit(wrapper);

    expect(wrapper.get("p.error-message").text()).toBe("transaction failed");
  });

  it("shows the status code and detail from an axios error body", async () => {
    mockedAxios.post.mockRejectedValue(axiosError(429, { error: "rate limited" }));

    const wrapper = await mountInput();
    await submit(wrapper);

    const error = wrapper.get("p.error-message").text();
    expect(error).toContain("429");
    expect(error).toContain("rate limited");
  });

  it("shows a plain-text axios error body as the detail", async () => {
    mockedAxios.post.mockRejectedValue(axiosError(400, "address is malformed"));

    const wrapper = await mountInput();
    await submit(wrapper);

    expect(wrapper.get("p.error-message").text()).toBe("request failed (400): address is malformed");
  });

  it("shows the message of a non-axios failure", async () => {
    mockedAxios.post.mockRejectedValue(new Error("connection reset"));

    const wrapper = await mountInput();
    await submit(wrapper);

    expect(wrapper.get("p.error-message").text()).toBe("connection reset");
  });

  it("refuses to post without an address", async () => {
    const wrapper = await mountInput();
    await wrapper.get("form").trigger("submit.prevent");
    await flushPromises();

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(wrapper.get("p.error-message").text()).toContain("address is required");
  });

  it("refuses to post before the captcha is solved", async () => {
    installTurnstile({ immediateSuccess: false });
    const wrapper = await mountInput();
    await submit(wrapper);

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(wrapper.get("p.error-message").text()).toContain("please complete the captcha");
  });

  it("clears the previous failure when the request is retried", async () => {
    mockedAxios.post.mockRejectedValueOnce(axiosError(500, { error: "boom" }));
    const wrapper = await mountInput();
    await submit(wrapper);
    expect(wrapper.find("p.error-message").exists()).toBe(true);

    // The captcha is reset after a failure, so solve it again before retrying.
    solveCaptcha();
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "CONFIRMED", transactionHash: "0xdef" }) });
    await wrapper.get("form").trigger("submit.prevent");
    await flushPromises();

    expect(wrapper.find("p.error-message").exists()).toBe(false);
    expect(wrapper.get("a.explorer-link").attributes("href")).toContain("0xdef");
  });
});

describe("Input — status polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  const countStatusCalls = () =>
    mockedAxios.get.mock.calls.filter(([url]) => !isHealthUrl(url as string)).length;

  it("polls the drip status endpoint until the drip is confirmed, then stops", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "PENDING" }) });
    mockGet({
      statuses: [
        ok(dripBody({ status: "PENDING", taskStatus: "QUEUED" })),
        ok(dripBody({ status: "CONFIRMED", transactionHash: "0xabc" })),
      ],
    });

    const wrapper = await mountInput();
    await submit(wrapper);
    expect(countStatusCalls()).toBe(0);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(countStatusCalls()).toBe(1);
    expect(wrapper.get("p.status-message").text()).toContain("it will take a few seconds");

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(countStatusCalls()).toBe(2);
    expect(wrapper.get("a.explorer-link").attributes("href")).toContain("0xabc");

    // Polling has stopped: further time passing triggers no more requests.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    expect(countStatusCalls()).toBe(2);
  });

  it("requests the drip status from the URL that includes the drip id", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ dripId: "drip-42", status: "PENDING" }) });
    mockGet({ statuses: [ok(dripBody({ dripId: "drip-42", status: "CONFIRMED", transactionHash: "0x1" }))] });

    const wrapper = await mountInput("preprod");
    await submit(wrapper);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    const statusCall = mockedAxios.get.mock.calls.find(([url]) => !isHealthUrl(url as string));
    expect(statusCall?.[0]).toBe(`${NETWORKS.preprod}api/drips/drip-42`);
  });

  it("stops polling and reports the reason when the drip fails", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "PENDING" }) });
    mockGet({ statuses: [ok(dripBody({ status: "FAILED", error: "wallet empty" }))] });

    const wrapper = await mountInput();
    await submit(wrapper);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(wrapper.get("p.error-message").text()).toBe("wallet empty");

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    expect(countStatusCalls()).toBe(1);
  });

  it("stops polling and reports the status code when a poll request errors", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "PENDING" }) });
    mockGet({ statuses: [fail(axiosError(503, {}))] });

    const wrapper = await mountInput();
    await submit(wrapper);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(wrapper.get("p.error-message").text()).toBe("status check failed (503)");

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    expect(countStatusCalls()).toBe(1);
  });

  it("stops polling and reports the message when a poll fails outside of axios", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "PENDING" }) });
    mockGet({ statuses: [fail(new Error("connection reset"))] });

    const wrapper = await mountInput();
    await submit(wrapper);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(wrapper.get("p.error-message").text()).toBe("connection reset");

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    expect(countStatusCalls()).toBe(1);
  });

  it("never starts polling when the drip is confirmed on submission", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "CONFIRMED", transactionHash: "0xabc" }) });

    const wrapper = await mountInput();
    await submit(wrapper);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

    expect(countStatusCalls()).toBe(0);
  });

  it("stops polling when the component is unmounted", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "PENDING" }) });
    mockGet({ statuses: [ok(dripBody({ status: "PENDING" }))] });

    const wrapper = await mountInput();
    await submit(wrapper);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(countStatusCalls()).toBe(1);

    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    expect(countStatusCalls()).toBe(1);
  });
});

describe("Input — turnstile widget", () => {
  it("renders the widget into the container on mount", async () => {
    const wrapper = await mountInput();

    expect(turnstile.render).toHaveBeenCalledTimes(1);
    const [container] = turnstile.render.mock.calls[0]!;
    expect(container).toBe(wrapper.get("div.turnstile-container").element);
  });

  it("resets the widget after a confirmed drip so the token cannot be replayed", async () => {
    mockedAxios.post.mockResolvedValue({ data: dripBody({ status: "CONFIRMED", transactionHash: "0xabc" }) });

    const wrapper = await mountInput();
    await submit(wrapper);

    expect(turnstile.reset).toHaveBeenCalledWith("widget-id");
    expect(isDisabled(wrapper)).toBe(true);
  });

  it("resets the widget after a failed request", async () => {
    mockedAxios.post.mockRejectedValue(axiosError(429, { error: "rate limited" }));

    const wrapper = await mountInput();
    await submit(wrapper);

    expect(turnstile.reset).toHaveBeenCalledWith("widget-id");
  });

  it("removes the widget on unmount", async () => {
    const wrapper = await mountInput();
    wrapper.unmount();

    expect(turnstile.remove).toHaveBeenCalledWith("widget-id");
  });

  it("injects the turnstile script when the page does not already have it", async () => {
    removeTurnstileScripts();
    const wrapper = await mountInput();

    expect(document.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)).toHaveLength(1);
    wrapper.unmount();
    expect(document.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)).toHaveLength(0);
  });

  it("reuses the existing script instead of injecting a duplicate", async () => {
    const first = await mountInput();
    const second = await mountInput();

    expect(document.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)).toHaveLength(1);
    first.unmount();
    second.unmount();
  });

  it("withdraws the token when the widget reports an error", async () => {
    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("mn_addr_xyz");
    expect(isDisabled(wrapper)).toBe(false);

    widgetOptions()["error-callback"]?.();
    await nextTick();

    expect(isDisabled(wrapper)).toBe(true);
  });

  it("withdraws the token when the challenge expires", async () => {
    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("mn_addr_xyz");

    widgetOptions()["expired-callback"]?.();
    await nextTick();

    expect(isDisabled(wrapper)).toBe(true);
  });

  it("waits for an already-present script to load before rendering the widget", async () => {
    delete (window as unknown as { turnstile?: TurnstileStub }).turnstile;
    const wrapper = await mountInput();

    installTurnstile();
    document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)!.dispatchEvent(new Event("load"));
    await nextTick();

    expect(turnstile.render).toHaveBeenCalledTimes(1);
    await wrapper.get("input.input").setValue("mn_addr_xyz");
    expect(isDisabled(wrapper)).toBe(false);
  });

  it("renders the widget once the script it injected has loaded", async () => {
    removeTurnstileScripts();
    delete (window as unknown as { turnstile?: TurnstileStub }).turnstile;
    const wrapper = await mountInput();

    installTurnstile();
    document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)!.dispatchEvent(new Event("load"));
    await nextTick();

    expect(turnstile.render).toHaveBeenCalledTimes(1);
    await wrapper.get("input.input").setValue("mn_addr_xyz");
    expect(isDisabled(wrapper)).toBe(false);
  });

  it("uses the live site key by default", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "live-site-key");
    vi.resetModules();
    window.history.replaceState({}, "", "/");

    const FreshInput = (await import("../Input.vue")).default;
    mount(FreshInput, { props: { network: "devnet" } });
    await flushPromises();

    expect(widgetOptions().sitekey).toBe("live-site-key");
  });

  it("switches to the test site key when ?isTesting=true is present", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "live-site-key");
    vi.resetModules();
    window.history.replaceState({}, "", "/?isTesting=true");

    const FreshInput = (await import("../Input.vue")).default;
    mount(FreshInput, { props: { network: "devnet" } });
    await flushPromises();

    expect(widgetOptions().sitekey).toBe(TURNSTILE_TEST_SITE_KEY);
    window.history.replaceState({}, "", "/");
  });
});

describe("Input — network switching", () => {
  it("re-checks health against the newly selected network", async () => {
    const wrapper = await mountInput("devnet");
    expect(mockedAxios.get).toHaveBeenLastCalledWith(
      `${NETWORKS.devnet}api/health`,
      expect.anything(),
    );

    await wrapper.setProps({ network: "preprod" });
    await flushPromises();

    expect(mockedAxios.get).toHaveBeenLastCalledWith(
      `${NETWORKS.preprod}api/health`,
      expect.anything(),
    );
  });

  it("blocks submission until the new network reports it is serving", async () => {
    const wrapper = await mountInput("devnet");
    await wrapper.get("input.input").setValue("mn_addr_xyz");
    expect(isDisabled(wrapper)).toBe(false);

    mockGet({ health: ok(NOT_SERVING) });
    await wrapper.setProps({ network: "preview" });
    await flushPromises();

    expect(isDisabled(wrapper)).toBe(true);
  });
});
