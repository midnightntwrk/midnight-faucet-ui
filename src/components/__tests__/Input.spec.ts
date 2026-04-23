import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import axios from "axios";
import Input from "../Input.vue";

vi.mock("axios", () => {
  const get = vi.fn();
  const post = vi.fn();
  const isAxiosError = (e: unknown): boolean =>
    typeof e === "object" && e !== null && "isAxiosError" in e;
  return { default: { get, post, isAxiosError }, isAxiosError };
});

type AxiosMock = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  isAxiosError: (e: unknown) => boolean;
};
const mockedAxios = axios as unknown as AxiosMock;

const FAKE_TOKEN = "fake-turnstile-token";

// Intercept the turnstile widget: fire the success callback synchronously
// with a fake token so captchaToken populates on mount.
const installTurnstile = (opts: { immediateSuccess?: boolean } = {}) => {
  const { immediateSuccess = true } = opts;
  const render = vi.fn((_el: HTMLElement, params: { callback?: (t: string) => void }) => {
    if (immediateSuccess && params.callback) params.callback(FAKE_TOKEN);
    return "widget-id";
  });
  (window as unknown as { turnstile: unknown }).turnstile = {
    render,
    reset: vi.fn(),
    remove: vi.fn(),
  };
  return render;
};

const mountInput = async (network: "local" | "devnet" = "devnet") => {
  const wrapper = mount(Input, { props: { network } });
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  mockedAxios.get.mockReset();
  mockedAxios.post.mockReset();
  // Default: health endpoint reports SERVING.
  mockedAxios.get.mockResolvedValue({ data: { status: "SERVING", reason: null } });
  installTurnstile();
});

afterEach(() => {
  delete (window as unknown as { turnstile?: unknown }).turnstile;
  vi.restoreAllMocks();
});

describe("Input — button enable logic", () => {
  it("starts disabled before health check resolves", () => {
    // Hold the health promise open so serviceAvailable stays false.
    mockedAxios.get.mockReturnValueOnce(new Promise(() => {}));
    const wrapper = mount(Input, { props: { network: "devnet" } });
    const button = wrapper.get("button.request-button");
    expect(button.attributes("disabled")).toBeDefined();
  });

  it("enables when address filled, captcha resolved, service serving", async () => {
    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("mn_addr_xyz");
    const button = wrapper.get("button.request-button");
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("stays disabled when service reports NOT_SERVING", async () => {
    mockedAxios.get.mockResolvedValue({
      data: { status: "NOT_SERVING", reason: "SERVICES_DOWN" },
    });
    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("mn_addr_xyz");
    expect(wrapper.get("button.request-button").attributes("disabled")).toBeDefined();
  });

  it("stays disabled when address is empty/whitespace", async () => {
    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("   ");
    expect(wrapper.get("button.request-button").attributes("disabled")).toBeDefined();
  });

  it("stays disabled when captcha has not resolved", async () => {
    installTurnstile({ immediateSuccess: false });
    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("mn_addr_xyz");
    expect(wrapper.get("button.request-button").attributes("disabled")).toBeDefined();
  });

  it("re-checks health when network prop changes", async () => {
    const wrapper = await mountInput("devnet");
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ network: "local" });
    await flushPromises();
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    const lastCallUrl = mockedAxios.get.mock.calls.at(-1)?.[0];
    expect(lastCallUrl).toContain("localhost");
  });
});

describe("Input — drip request", () => {
  it("posts drip with trimmed address and captcha header, then shows confirmed link", async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        dripId: "drip-1",
        status: "CONFIRMED",
        taskStatus: null,
        transactionHash: "0xabc",
        error: null,
      },
    });

    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("  mn_addr_xyz  ");
    await wrapper.get("form").trigger("submit.prevent");
    await flushPromises();

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [, body, config] = mockedAxios.post.mock.calls[0]!;
    expect(body).toEqual({ recipientAddress: "mn_addr_xyz", amount: "1000" });
    expect(config.headers["X-Captcha-Token"]).toBe(FAKE_TOKEN);

    const link = wrapper.get("a.explorer-link");
    expect(link.attributes("href")).toContain("/transactions/0xabc");
  });

  it("shows error message when the post fails", async () => {
    mockedAxios.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 429, data: { error: "rate limited" } },
    });

    const wrapper = await mountInput();
    await wrapper.get("input.input").setValue("mn_addr_xyz");
    await wrapper.get("form").trigger("submit.prevent");
    await flushPromises();

    const err = wrapper.get("p.error-message");
    expect(err.text()).toContain("429");
    expect(err.text()).toContain("rate limited");
  });

  it("does not submit when address is empty", async () => {
    const wrapper = await mountInput();
    await wrapper.get("form").trigger("submit.prevent");
    await flushPromises();
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(wrapper.get("p.error-message").text()).toContain("address is required");
  });
});
