<script setup lang="ts">
import { ref } from "vue";
import Dropdown from "./components/Dropdown.vue";
import Input from "./components/Input.vue";

type Network = "devnet" | "qanet" | "preview" | "preprod";
const network = ref<Network>("devnet");
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="./assets/logo.svg" width="125" height="125" />
  </header>

  <main>
    <Dropdown v-model="network" />
    <Input :network="network" />
  </main>
</template>

<style scoped>
header {
  line-height: 1.5;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

main {
  display: flex;
  justify-content: center;
  padding: 1rem;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  .logo {
    margin: 0 2rem 0 0;
  }
}
</style>
