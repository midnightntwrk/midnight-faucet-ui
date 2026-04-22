<script setup lang="ts">
import { onMounted, ref, watchEffect } from "vue";
import Dropdown from "./components/Dropdown.vue";
import Input from "./components/Input.vue";
import type { Network } from "./constants";

type Theme = "dark" | "light";

const network = ref<Network>("devnet");
const theme = ref<Theme>("dark");

const THEME_STORAGE_KEY = "midnight.theme";

onMounted(() => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") theme.value = stored;
});

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
      <h1 class="app-title">midnight</h1>
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
  flex: 0 0 auto;
}

.app-title {
  font-size: 3rem;
  font-weight: 300;
  letter-spacing: 0.08em;
  color: var(--color-text);
  text-transform: lowercase;
  line-height: 1;
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

  .app-title {
    font-size: 2.25rem;
  }
}
</style>
