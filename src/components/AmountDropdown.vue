<script setup lang="ts">
import { AMOUNTS, type Amount } from "@/constants";

defineProps<{
  modelValue: Amount;
}>();

defineEmits<{
  "update:modelValue": [value: Amount];
}>();
</script>

<template>
  <label class="amount-dropdown">
    <span class="label-text">Amount</span>
    <select
      :value="modelValue"
      @change="$emit('update:modelValue', Number(($event.target as HTMLSelectElement).value) as Amount)"
    >
      <option v-for="amount in AMOUNTS" :key="amount" :value="amount">
        {{ amount }}
      </option>
    </select>
  </label>
</template>

<style scoped src="./styles/amount-dropdown.css"></style>
