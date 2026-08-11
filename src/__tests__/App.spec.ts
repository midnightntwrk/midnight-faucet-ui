import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "../App.vue";
import Dropdown from "../components/Dropdown.vue";
import Input from "../components/Input.vue";

const THEME_STORAGE_KEY = "midnight.theme";

// The children own their own network requests; App only has to wire them together.
const mountApp = async () => {
  const wrapper = mount(App, { global: { stubs: { Dropdown: true, Input: true } } });
  await flushPromises();
  return wrapper;
};

const documentTheme = () => document.documentElement.getAttribute("data-theme");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("App — layout", () => {
  it("renders the branding", async () => {
    const wrapper = await mountApp();

    expect(wrapper.get("img.app-logo").attributes("alt")).toBe("midnight");
    expect(wrapper.get("p.app-tagline").text()).toContain("fourth generation blockchain");
  });

  it("renders the network selector above the drip form", async () => {
    const wrapper = await mountApp();

    expect(wrapper.findComponent(Dropdown).exists()).toBe(true);
    expect(wrapper.findComponent(Input).exists()).toBe(true);
  });
});

describe("App — network selection", () => {
  it("starts on devnet and hands it to the drip form", async () => {
    const wrapper = await mountApp();

    expect(wrapper.findComponent(Dropdown).props("modelValue")).toBe("devnet");
    expect(wrapper.findComponent(Input).props("network")).toBe("devnet");
  });

  it("re-targets the drip form when another network is selected", async () => {
    const wrapper = await mountApp();

    wrapper.findComponent(Dropdown).vm.$emit("update:modelValue", "preprod");
    await flushPromises();

    expect(wrapper.findComponent(Input).props("network")).toBe("preprod");
    expect(wrapper.findComponent(Dropdown).props("modelValue")).toBe("preprod");
  });
});

describe("App — theme", () => {
  it("applies the dark theme to the document by default", async () => {
    await mountApp();

    expect(documentTheme()).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("restores the theme the user chose last time", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    await mountApp();

    expect(documentTheme()).toBe("light");
  });

  it("falls back to dark when the stored theme is not recognised", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    await mountApp();

    expect(documentTheme()).toBe("dark");
  });

  it("switches the theme and persists the choice", async () => {
    const wrapper = await mountApp();

    await wrapper.get("button.theme-toggle").trigger("click");
    expect(documentTheme()).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    await wrapper.get("button.theme-toggle").trigger("click");
    expect(documentTheme()).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("describes the theme the toggle will switch to", async () => {
    const wrapper = await mountApp();
    const toggle = wrapper.get("button.theme-toggle");

    expect(toggle.attributes("aria-label")).toBe("switch to light mode");
    expect(toggle.attributes("aria-pressed")).toBe("false");

    await toggle.trigger("click");
    expect(toggle.attributes("aria-label")).toBe("switch to dark mode");
    expect(toggle.attributes("aria-pressed")).toBe("true");
  });
});
