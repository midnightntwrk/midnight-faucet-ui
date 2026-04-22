<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import axios, { isAxiosError } from "axios";
import { ROUTES } from "../router/routes";
import type { Network } from "../constants";

const props = defineProps<{ network: Network }>();

type DripStatus = "PENDING" | "CONFIRMED" | "FAILED";
interface DripResponse {
  dripId: string;
  status: DripStatus;
  taskStatus: string | null;
  transactionHash: string | null;
  error: string | null;
}

const address = ref("");
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

const dripId = ref<string | null>(null);
const dripStatus = ref<DripStatus | null>(null);
const taskStatus = ref<string | null>(null);
const transactionHash = ref<string | null>(null);

let pollTimer: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = 2000;
// TODO: replace with amount input + Cloudflare Turnstile token once those land.
const AMOUNT = "1000";
const CAPTCHA_TOKEN_STUB = "XXXX.DUMMY.TOKEN.XXXX";

const clearPoll = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

const pollDrip = async (id: string) => {
  try {
    const { data } = await axios.get<DripResponse>(
      ROUTES.getDripStatus({ chain: props.network, dripId: id }),
      { headers: { Accept: "application/json" } },
    );
    dripStatus.value = data.status;
    taskStatus.value = data.taskStatus;
    transactionHash.value = data.transactionHash;
    if (data.status === "CONFIRMED") {
      clearPoll();
    } else if (data.status === "FAILED") {
      errorMessage.value = data.error ?? "transaction failed";
      clearPoll();
    }
  } catch (e) {
    if (isAxiosError(e) && e.response) {
      errorMessage.value = `status check failed (${e.response.status})`;
    } else {
      errorMessage.value = e instanceof Error ? e.message : "polling failed";
    }
    clearPoll();
  }
};

const startPolling = (id: string) => {
  clearPoll();
  pollTimer = setInterval(() => void pollDrip(id), POLL_INTERVAL_MS);
};

const requestDrip = async () => {
  errorMessage.value = null;
  const trimmed = address.value.trim();
  if (!trimmed) {
    errorMessage.value = "address is required";
    return;
  }
  submitting.value = true;
  dripId.value = null;
  dripStatus.value = null;
  taskStatus.value = null;
  transactionHash.value = null;
  clearPoll();

  try {
    const { data } = await axios.post<DripResponse>(
      ROUTES.postDrip({ chain: props.network }),
      { recipientAddress: trimmed, amount: AMOUNT },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Captcha-Token": CAPTCHA_TOKEN_STUB,
        },
      },
    );
    dripId.value = data.dripId;
    dripStatus.value = data.status;
    taskStatus.value = data.taskStatus;
    transactionHash.value = data.transactionHash;
    if (data.status === "PENDING") startPolling(data.dripId);
    else if (data.status === "FAILED") errorMessage.value = data.error ?? "transaction failed";
  } catch (e) {
    if (isAxiosError(e) && e.response) {
      const detail =
        typeof e.response.data === "string"
          ? e.response.data
          : (e.response.data as { error?: string } | undefined)?.error;
      errorMessage.value = `request failed (${e.response.status})${detail ? `: ${detail}` : ""}`;
    } else {
      errorMessage.value = e instanceof Error ? e.message : "request failed";
    }
  } finally {
    submitting.value = false;
  }
};

const statusMessage = computed(() => {
  if (errorMessage.value) return null;
  if (dripStatus.value === "PENDING") {
    return taskStatus.value ? `pending — ${taskStatus.value}` : "pending…";
  }
  if (dripStatus.value === "CONFIRMED") {
    return transactionHash.value ? `confirmed — ${transactionHash.value}` : "confirmed";
  }
  return null;
});

onBeforeUnmount(clearPoll);
</script>

<template>
  <form class="input-form" @submit.prevent="requestDrip">
    <input
      v-model="address"
      class="input"
      type="text"
      placeholder="recipient address"
      autocomplete="off"
      spellcheck="false"
      :disabled="submitting"
    />
    <button type="submit" class="request-button" :disabled="submitting">
      {{ submitting ? "requesting…" : "request" }}
    </button>
    <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
    <p v-else-if="statusMessage" class="status-message" role="status">{{ statusMessage }}</p>
  </form>
</template>
