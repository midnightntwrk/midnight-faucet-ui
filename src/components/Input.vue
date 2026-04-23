<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import axios, { isAxiosError } from "axios";
import { ROUTES, type HealthResponse } from "../router/routes";
import { TURNSTILE_SITE_KEY, TURNSTILE_TEST_SITE_KEY, type Network } from "../constants";

type TurnstileRenderOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

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
const serviceAvailable = ref(false);

const dripId = ref<string | null>(null);
const dripStatus = ref<DripStatus | null>(null);
const taskStatus = ref<string | null>(null);
const transactionHash = ref<string | null>(null);

let pollTimer: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = 2000;
const AMOUNT = "1000";

const isTesting =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("isTesting") === "true";

const turnstileSiteKey = isTesting
  ? TURNSTILE_TEST_SITE_KEY
  : TURNSTILE_SITE_KEY || TURNSTILE_TEST_SITE_KEY;

const captchaToken = ref("");
const turnstileContainer = ref<HTMLDivElement | null>(null);
let turnstileWidgetId: string | null = null;
let turnstileScript: HTMLScriptElement | null = null;

const resetTurnstile = () => {
  captchaToken.value = "";
  if (window.turnstile && turnstileWidgetId !== null) {
    window.turnstile.reset(turnstileWidgetId);
  }
};

const renderTurnstile = () => {
  if (!window.turnstile || !turnstileContainer.value || turnstileWidgetId !== null) return;
  turnstileWidgetId = window.turnstile.render(turnstileContainer.value, {
    sitekey: turnstileSiteKey,
    callback: (token) => {
      captchaToken.value = token;
    },
    "error-callback": () => {
      captchaToken.value = "";
    },
    "expired-callback": () => {
      captchaToken.value = "";
    },
  });
};

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

const checkHealth = async () => {
  try {
    const { data } = await axios.get<HealthResponse>(
      ROUTES.getHealth({ chain: props.network }),
      { headers: { Accept: "application/json" } },
    );
    serviceAvailable.value = data.status === "SERVING";
  } catch {
    serviceAvailable.value = false;
  }
};

const canSubmit = computed(
  () =>
    !submitting.value &&
    !!captchaToken.value &&
    address.value.trim().length > 0 &&
    serviceAvailable.value,
);

const requestDrip = async () => {
  errorMessage.value = null;
  const trimmed = address.value.trim();
  if (!trimmed) {
    errorMessage.value = "address is required";
    return;
  }
  if (!captchaToken.value) {
    errorMessage.value = "please complete the captcha";
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
          "X-Captcha-Token": captchaToken.value,
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
    return taskStatus.value ? `submitting — it will take a few seconds` : "submitting...";
  }
  if (dripStatus.value === "CONFIRMED") {
    return transactionHash.value ? `confirmed — your tokens should be in your wallet` : `confirmed`;
  }
  return null;
});

onMounted(() => {
  void checkHealth();
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
  );
  if (existing) {
    if (window.turnstile) renderTurnstile();
    else existing.addEventListener("load", renderTurnstile, { once: true });
    return;
  }
  const script = document.createElement("script");
  script.src = TURNSTILE_SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  script.addEventListener("load", renderTurnstile, { once: true });
  document.body.appendChild(script);
  turnstileScript = script;
});

watch([dripStatus, errorMessage], ([status, error]) => {
  if (status === "CONFIRMED" || status === "FAILED" || error) {
    resetTurnstile();
  }
});

watch(
  () => props.network,
  () => {
    serviceAvailable.value = false;
    void checkHealth();
  },
);

onBeforeUnmount(() => {
  clearPoll();
  if (window.turnstile && turnstileWidgetId !== null) {
    window.turnstile.remove(turnstileWidgetId);
    turnstileWidgetId = null;
  }
  if (turnstileScript && turnstileScript.parentNode) {
    turnstileScript.parentNode.removeChild(turnstileScript);
    turnstileScript = null;
  }
});

</script>

<template>
  <form class="input-form" @submit.prevent="requestDrip">
    <input
      v-model="address"
      class="input"
      type="text"
      placeholder="unshielded address"
      autocomplete="off"
      spellcheck="false"
      :disabled="submitting"
    />
    <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
    <p v-else-if="statusMessage" class="status-message" role="status">{{ statusMessage }}</p>
    <a
      v-if="dripStatus === 'CONFIRMED' && transactionHash"
      class="explorer-link"
      :href="ROUTES.getExplorerLink({ chain: props.network, txId: transactionHash })"
      target="_blank"
      rel="noopener noreferrer"
    >
      View your transaction
    </a>     
    <button
      type="submit"
      class="request-button"
      :disabled="!canSubmit"
    >
      {{ submitting ? "requesting…" : "request" }}
    </button>
    <div ref="turnstileContainer" class="turnstile-container"></div>
   
  </form>
</template>

<style scoped src="./styles/input.css"></style>
