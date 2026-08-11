<script setup lang="ts">
import { ref, watchEffect } from "vue";
import Dropdown from "./components/Dropdown.vue";
import Input from "./components/Input.vue";
import type { Network } from "./constants";
import midnightLogo from "./assets/midnight-logo.png";

type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "midnight.theme";
const DEFAULT_THEME: Theme = "dark";

// Read the stored preference up front: the effect below persists the theme as soon
// as it runs, so anything read after setup would already have been overwritten.
const storedTheme = (): Theme => {
  const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : DEFAULT_THEME;
};

const network = ref<Network>("devnet");
const theme = ref<Theme>(storedTheme());

watchEffect(() => {
  document.documentElement.setAttribute("data-theme", theme.value);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(THEME_STORAGE_KEY, theme.value);
  }
});

const toggleTheme = () => {
  theme.value = theme.value === "dark" ? "light" : "dark";
};
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <img :src="midnightLogo" alt="midnight" class="app-logo" />
      <p class="app-tagline">First fourth generation blockchain.

</p>
    </header>

    <main class="app-main">
      <Dropdown v-model="network" />
      <Input :network="network" />
    </main>

    <button
      type="button"
      class="theme-toggle"
      :aria-label="`switch to ${theme === 'dark' ? 'light' : 'dark'} mode`"
      :aria-pressed="theme === 'light'"
      @click="toggleTheme"
    >
      {{ theme === "dark" ? "☀" : "☾" }}
    </button>
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  width: 100%;
  max-width: 960px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3rem;
  flex-wrap: wrap;
}

.app-header {
  flex: 1 1 320px;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.app-logo {
  display: block;
  width: 100%;
  max-width: 320px;
  height: auto;
}

:root[data-theme="light"] .app-logo {
  filter: invert(1);
}

.app-tagline {
  margin: 0;
  padding-left: 0.15rem;
  font-size: 0.9rem;
  font-weight: 400;
  letter-spacing: 0.12em;
  text-transform: lowercase;
  color: var(--color-text-muted);
}

.app-main {
  flex: 1 1 320px;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.theme-toggle {
  position: fixed;
  top: 1rem;
  right: 1rem;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  border: 1px solid var(--color-accent);
  border-radius: 999px;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s;
}

.theme-toggle:hover,
.theme-toggle:focus-visible {
  background: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
  outline: none;
}

.theme-toggle:hover,
.theme-toggle:focus-visible {
  border-color: var(--color-border-strong);
  outline: none;
}

@media (max-width: 640px) {
  .app-shell {
    flex-direction: column;
    gap: 2rem;
  }

  .app-header {
    align-items: center;
    text-align: center;
  }

  .app-logo {
    max-width: 240px;
  }
}
</style>
