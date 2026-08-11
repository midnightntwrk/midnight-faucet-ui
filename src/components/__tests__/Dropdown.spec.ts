import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import axios from "axios";
import Dropdown from "../Dropdown.vue";
import { NETWORKS, OPTIONS, type Network } from "../../constants";
import type { HealthResponse, ReadyResponse } from "../../router/routes";

type ProbeConfig = {
  signal: AbortSignal;
  headers: Record<string, string>;
  validateStatus: () => boolean;
};
type AxiosGet = (url: string, config: ProbeConfig) => Promise<unknown>;

vi.mock("axios", () => ({ default: { get: vi.fn<AxiosGet>() } }));

const mockedAxios = axios as unknown as { get: Mock<AxiosGet> };

const SERVING: HealthResponse = { status: "SERVING", reason: null };
const NOT_SERVING: HealthResponse = { status: "NOT_SERVING", reason: "SERVICES_DOWN" };
const READY: ReadyResponse = { status: "ok", details: { node: "ok", indexer: "ok" } };
const NOT_READY: ReadyResponse = { status: "not_ok", details: { node: "not_ok", indexer: "ok" } };

/** A canned probe reply: a resolved body, or a rejection standing in for an unreachable host. */
type Reply = { data: unknown } | { unreachable: true };
const ok = (data: unknown): Reply => ({ data });
const unreachable = (): Reply => ({ unreachable: true });
const send = (reply: Reply) =>
  "unreachable" in reply ? Promise.reject(new Error("connection refused")) : Promise.resolve(reply);

type Probes = { health: Reply; ready: Reply };
const HEALTHY: Probes = { health: ok(SERVING), ready: ok(READY) };

const networkOf = (url: string) =>
  (Object.keys(NETWORKS) as Network[]).find((n) => url.startsWith(NETWORKS[n]));

/**
 * Answers every probe with the replies configured for that network, falling back
 * to a healthy faucet for networks the test does not care about.
 */
const mockProbes = (byNetwork: Partial<Record<Network, Probes>> = {}, fallback: Probes = HEALTHY) => {
  mockedAxios.get.mockImplementation((url: string) => {
    const network = networkOf(url);
    const probes = (network && byNetwork[network]) ?? fallback;
    return send(url.endsWith("api/health") ? probes.health : probes.ready);
  });
};

const mountDropdown = async (modelValue: Network = "devnet", attach = false) => {
  const wrapper = mount(Dropdown, {
    props: { modelValue },
    ...(attach ? { attachTo: document.body } : {}),
  });
  await flushPromises();
  return wrapper;
};

const statusOf = (wrapper: { get: (s: string) => { attributes: (a: string) => string | undefined } }) =>
  wrapper.get(".trigger .status").attributes("data-status");

const pressKey = (wrapper: ReturnType<typeof mount>, key: string) =>
  wrapper.get("button.trigger").trigger("keydown", { key });

/**
 * The listbox is toggled with v-show. `isVisible()` cannot be trusted here because
 * jsdom memoises the computed style of detached elements, so open-ness is read from
 * the combobox contract instead — which is what a screen reader reads too.
 */
const isMenuOpen = (wrapper: ReturnType<typeof mount>) =>
  wrapper.get("button.trigger").attributes("aria-expanded") === "true";

const menuStyle = (wrapper: ReturnType<typeof mount>) =>
  wrapper.get("ul.menu").attributes("style") ?? "";

const FIRST = OPTIONS[0]!;
const LAST = OPTIONS[OPTIONS.length - 1]!;

beforeEach(() => {
  mockedAxios.get.mockReset();
  mockProbes();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("Dropdown — rendering", () => {
  it("shows the selected network and every selectable option", async () => {
    const wrapper = await mountDropdown("preview");

    expect(wrapper.get(".trigger .label").text()).toBe("preview");
    const options = wrapper.findAll("li.option");
    expect(options).toHaveLength(OPTIONS.length);
    expect(options.map((o) => o.get(".option-label").text())).toEqual(OPTIONS);
  });

  it("marks only the selected option as selected", async () => {
    const wrapper = await mountDropdown("qanet");

    const selected = wrapper
      .findAll("li.option")
      .filter((o) => o.attributes("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]!.get(".option-label").text()).toBe("qanet");
  });

  it("wires the combobox to its listbox for assistive technology", async () => {
    const wrapper = await mountDropdown("qanet");
    const trigger = wrapper.get("button.trigger");

    expect(trigger.attributes("role")).toBe("combobox");
    expect(trigger.attributes("aria-controls")).toBe(wrapper.get("ul.menu").attributes("id"));
    expect(trigger.attributes("aria-expanded")).toBe("false");
    // No active option is advertised while the menu is closed.
    expect(trigger.attributes("aria-activedescendant")).toBeUndefined();

    // Opening starts the active option on whichever network is currently selected.
    await trigger.trigger("click");
    expect(trigger.attributes("aria-activedescendant")).toBe("dropdown-option-qanet");
  });
});

describe("Dropdown — health probing", () => {
  it("reports checking while the probes are in flight", async () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {}));
    const wrapper = mount(Dropdown, { props: { modelValue: "devnet" } });
    await nextTick();

    expect(statusOf(wrapper)).toBe("checking");
    expect(wrapper.get(".status-text").text()).toBe("checking…");
  });

  it("probes both the health and readiness endpoints of the selected network", async () => {
    await mountDropdown("devnet");

    const urls = mockedAxios.get.mock.calls.map(([url]) => url);
    expect(urls).toContain(`${NETWORKS.devnet}api/health`);
    expect(urls).toContain(`${NETWORKS.devnet}api/ready`);
  });

  it("reports reachable and hides the failure message when both probes pass", async () => {
    const wrapper = await mountDropdown();

    expect(statusOf(wrapper)).toBe("reachable");
    expect(wrapper.get(".status-text").text()).toBe("reachable");
    expect(wrapper.find("p.failure-message").exists()).toBe(false);
  });

  it("names the faucet reason when health reports NOT_SERVING", async () => {
    mockProbes({ devnet: { health: ok(NOT_SERVING), ready: ok(READY) } });
    const wrapper = await mountDropdown();

    expect(statusOf(wrapper)).toBe("unreachable");
    expect(wrapper.get("p.failure-message").text()).toBe("faucet: SERVICES_DOWN");
  });

  it("names the failing dependencies when readiness reports not_ok", async () => {
    mockProbes({ devnet: { health: ok(SERVING), ready: ok(NOT_READY) } });
    const wrapper = await mountDropdown();

    expect(statusOf(wrapper)).toBe("unreachable");
    expect(wrapper.get("p.failure-message").text()).toBe("node is down");
  });

  it("combines the faucet reason and the failing dependencies", async () => {
    mockProbes({ devnet: { health: ok(NOT_SERVING), ready: ok(NOT_READY) } });
    const wrapper = await mountDropdown();

    expect(wrapper.get("p.failure-message").text()).toBe("faucet: SERVICES_DOWN — node is down");
  });

  it("reports the service as down when neither endpoint can be reached", async () => {
    mockProbes({ devnet: { health: unreachable(), ready: unreachable() } });
    const wrapper = await mountDropdown();

    expect(statusOf(wrapper)).toBe("unreachable");
    expect(wrapper.get("p.failure-message").text()).toBe("service is down");
  });

  it("points at the single endpoint that could not be reached", async () => {
    mockProbes({ devnet: { health: unreachable(), ready: ok(READY) } });
    const wrapper = await mountDropdown();

    expect(wrapper.get("p.failure-message").text()).toBe("health endpoint unreachable");
  });

  it("points at readiness when only the readiness endpoint is unreachable", async () => {
    mockProbes({ devnet: { health: ok(SERVING), ready: unreachable() } });
    const wrapper = await mountDropdown();

    expect(wrapper.get("p.failure-message").text()).toBe("readiness endpoint unreachable");
  });

  it("leaves networks that were never selected in the idle state", async () => {
    const wrapper = await mountDropdown("devnet");

    const idle = wrapper
      .findAll("li.option")
      .filter((o) => o.get(".option-status").attributes("data-status") === "idle");
    expect(idle).toHaveLength(OPTIONS.length - 1);
  });

  it("re-probes when the selected network changes", async () => {
    const wrapper = await mountDropdown("devnet");
    mockedAxios.get.mockClear();

    await wrapper.setProps({ modelValue: "preprod" });
    await flushPromises();

    const urls = mockedAxios.get.mock.calls.map(([url]) => url);
    expect(urls).toEqual([`${NETWORKS.preprod}api/health`, `${NETWORKS.preprod}api/ready`]);
    expect(statusOf(wrapper)).toBe("reachable");
  });

  it("aborts in-flight probes when the component is unmounted", async () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {}));
    const wrapper = mount(Dropdown, { props: { modelValue: "devnet" } });
    const signals = mockedAxios.get.mock.calls.map(([, config]) => config.signal as AbortSignal);
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.aborted)).toBe(false);

    wrapper.unmount();
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});

describe("Dropdown — mouse interaction", () => {
  it("opens and closes the listbox when the trigger is clicked", async () => {
    const wrapper = await mountDropdown();
    const trigger = wrapper.get("button.trigger");
    expect(isMenuOpen(wrapper)).toBe(false);
    expect(menuStyle(wrapper)).toContain("display: none");

    await trigger.trigger("click");
    expect(isMenuOpen(wrapper)).toBe(true);
    expect(menuStyle(wrapper)).not.toContain("display: none");

    await trigger.trigger("click");
    expect(isMenuOpen(wrapper)).toBe(false);
    expect(menuStyle(wrapper)).toContain("display: none");
  });

  it("emits the picked network and closes the listbox", async () => {
    const wrapper = await mountDropdown();
    await wrapper.get("button.trigger").trigger("click");
    await wrapper.findAll("li.option")[2]!.trigger("mousedown");

    expect(wrapper.emitted("update:modelValue")).toEqual([[OPTIONS[2]]]);
    expect(isMenuOpen(wrapper)).toBe(false);
  });

  it("follows the pointer with the active option", async () => {
    const wrapper = await mountDropdown();
    await wrapper.get("button.trigger").trigger("click");
    await wrapper.findAll("li.option")[3]!.trigger("mousemove");

    expect(wrapper.findAll("li.option")[3]!.attributes("data-active")).toBe("true");
    expect(wrapper.get("button.trigger").attributes("aria-activedescendant")).toBe(
      `dropdown-option-${OPTIONS[3]}`,
    );
  });

  it("closes when a mousedown lands outside the dropdown", async () => {
    const wrapper = await mountDropdown("devnet", true);
    await wrapper.get("button.trigger").trigger("click");
    expect(isMenuOpen(wrapper)).toBe(true);

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await nextTick();

    expect(isMenuOpen(wrapper)).toBe(false);
    wrapper.unmount();
  });

  it("stays open when a mousedown lands inside the dropdown", async () => {
    const wrapper = await mountDropdown("devnet", true);
    await wrapper.get("button.trigger").trigger("click");

    wrapper.get(".trigger .label").element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await nextTick();

    expect(isMenuOpen(wrapper)).toBe(true);
    wrapper.unmount();
  });

  it("stops listening for outside clicks after unmount", async () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const wrapper = await mountDropdown();
    wrapper.unmount();

    expect(remove).toHaveBeenCalledWith("mousedown", expect.any(Function));
  });
});

describe("Dropdown — keyboard interaction", () => {
  it("opens the listbox on ArrowDown and starts on the selected option", async () => {
    const wrapper = await mountDropdown(FIRST);
    await pressKey(wrapper, "ArrowDown");

    expect(isMenuOpen(wrapper)).toBe(true);
    expect(wrapper.findAll("li.option")[0]!.attributes("data-active")).toBe("true");
  });

  it("moves the active option down once the listbox is open", async () => {
    const wrapper = await mountDropdown(FIRST);
    await pressKey(wrapper, "ArrowDown");
    await pressKey(wrapper, "ArrowDown");

    expect(wrapper.findAll("li.option")[1]!.attributes("data-active")).toBe("true");
  });

  it("wraps from the first option to the last on ArrowUp", async () => {
    const wrapper = await mountDropdown(FIRST);
    await pressKey(wrapper, "ArrowDown");
    await pressKey(wrapper, "ArrowUp");

    const options = wrapper.findAll("li.option");
    expect(options[options.length - 1]!.attributes("data-active")).toBe("true");
    expect(wrapper.get("button.trigger").attributes("aria-activedescendant")).toBe(
      `dropdown-option-${LAST}`,
    );
  });

  it("selects the active option with Enter", async () => {
    const wrapper = await mountDropdown(FIRST);
    await pressKey(wrapper, "ArrowDown");
    await pressKey(wrapper, "ArrowDown");
    await pressKey(wrapper, "Enter");

    expect(wrapper.emitted("update:modelValue")).toEqual([[OPTIONS[1]]]);
    expect(isMenuOpen(wrapper)).toBe(false);
  });

  it("selects the active option with Space", async () => {
    const wrapper = await mountDropdown(FIRST);
    await pressKey(wrapper, " ");
    await pressKey(wrapper, " ");

    expect(wrapper.emitted("update:modelValue")).toEqual([[FIRST]]);
  });

  it("closes on Escape without emitting a change", async () => {
    const wrapper = await mountDropdown();
    await pressKey(wrapper, "ArrowDown");
    await pressKey(wrapper, "Escape");

    expect(isMenuOpen(wrapper)).toBe(false);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("closes on Tab so focus can leave the dropdown", async () => {
    const wrapper = await mountDropdown();
    await pressKey(wrapper, "ArrowDown");
    await pressKey(wrapper, "Tab");

    expect(isMenuOpen(wrapper)).toBe(false);
  });
});
