<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import axios from "axios";
import { OPTIONS, type Network, type Status } from "../constants";
import { ROUTES, type HealthResponse, type ReadyResponse } from "../router/routes";

const props = withDefaults(defineProps<{ modelValue?: Network }>(), {
  modelValue: "devnet",
});
const emit = defineEmits<(e: "update:modelValue", value: Network) => void>();

const open = ref(false);
const activeIndex = ref(OPTIONS.indexOf(props.modelValue));
const root = ref<HTMLElement | null>(null);
const triggerId = "dropdown-trigger";
const listboxId = "dropdown-listbox";
const optionId = (n: Network) => `dropdown-option-${n}`;

const status = reactive<Record<Network, Status>>({
  devnet: "idle",
  qanet: "idle",
  preview: "idle",
  preprod: "idle",
});

const controllers = new Map<Network, AbortController>();

type ProbeResult<T> =
  | { kind: "ok"; body: T }
  | { kind: "unhealthy"; body: T }
  | { kind: "unreachable" };

const failureMessage = reactive<Record<Network, string | null>>({
  devnet: null,
  qanet: null,
  preview: null,
  preprod: null,
});

const probeEndpoint = async <T,>(
  url: string,
  signal: AbortSignal,
  isHealthy: (body: T) => boolean,
): Promise<ProbeResult<T>> => {
  try {
    const { data } = await axios.get<T>(url, {
      signal,
      headers: { Accept: "application/json" },
      validateStatus: () => true,
    });
    return isHealthy(data) ? { kind: "ok", body: data } : { kind: "unhealthy", body: data };
  } catch {
    return { kind: "unreachable" };
  }
};

const buildFailureMessage = (
  health: ProbeResult<HealthResponse>,
  ready: ProbeResult<ReadyResponse>,
): string | null => {
  if (health.kind === "unreachable" && ready.kind === "unreachable") {
    return "service is down";
  }
  const parts: string[] = [];
  if (health.kind === "unhealthy" && health.body.status === "NOT_SERVING") {
    parts.push(`faucet: ${health.body.reason}`);
  } else if (health.kind === "unreachable") {
    parts.push("health endpoint unreachable");
  }
  if (ready.kind === "unhealthy" && ready.body.status === "not_ok") {
    const down = Object.entries(ready.body.details)
      .filter(([, v]) => v === "not_ok")
      .map(([k]) => k);
    if (down.length > 0) parts.push(`${down.join(", ")} is down`);
  } else if (ready.kind === "unreachable") {
    parts.push("readiness endpoint unreachable");
  }
  return parts.length > 0 ? parts.join(" — ") : null;
};

const checkNetwork = async (n: Network) => {
  controllers.get(n)?.abort();
  const controller = new AbortController();
  controllers.set(n, controller);
  status[n] = "checking";
  failureMessage[n] = null;

  const [health, ready] = await Promise.all([
    probeEndpoint<HealthResponse>(
      ROUTES.getHealth({ chain: n }),
      controller.signal,
      (health: HealthResponse) => health.status === "SERVING",
    ),
    probeEndpoint<ReadyResponse>(
      ROUTES.getReady({ chain: n }),
      controller.signal,
      (health: ReadyResponse) => health.status === "ok",
    ),
  ]);

  if (controller.signal.aborted) return;
  const healthy = health.kind === "ok" && ready.kind === "ok";
  status[n] = healthy ? "reachable" : "unreachable";
  failureMessage[n] = healthy ? null : buildFailureMessage(health, ready);
};

const toggle = () => {
  if (open.value) close();
  else openMenu();
};

const openMenu = () => {
  open.value = true;
  activeIndex.value = OPTIONS.indexOf(props.modelValue);
};

const close = () => {
  open.value = false;
};

const select = (n: Network) => {
  emit("update:modelValue", n);
  close();
};

const onTriggerKeydown = (e: KeyboardEvent) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!open.value) openMenu();
    else moveActive(e.key === "ArrowDown" ? 1 : -1);
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (!open.value) openMenu();
    else {
      const target = OPTIONS[activeIndex.value];
      if (target) select(target);
    }
  } else if (e.key === "Escape") {
    if (open.value) {
      e.preventDefault();
      close();
    }
  } else if (e.key === "Tab") {
    close();
  }
};

const moveActive = (delta: number) => {
  const next = (activeIndex.value + delta + OPTIONS.length) % OPTIONS.length;
  activeIndex.value = next;
};

const onDocumentMouseDown = (e: MouseEvent) => {
  if (!open.value) return;
  if (root.value && !root.value.contains(e.target as Node)) close();
};

const activeOptionId = computed(() => {
  const n = OPTIONS[activeIndex.value];
  return open.value && n ? optionId(n) : undefined;
});

watch(
  () => props.modelValue,
  (n) => {
    void checkNetwork(n);
  },
);

onMounted(() => {
  document.addEventListener("mousedown", onDocumentMouseDown);
  void checkNetwork(props.modelValue);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocumentMouseDown);
  controllers.forEach((c) => c.abort());
});

const currentStatus = computed(() => status[props.modelValue]);
const currentFailure = computed(() => failureMessage[props.modelValue]);
const statusLabel: Record<Status, string> = {
  idle: "",
  checking: "checking…",
  reachable: "reachable",
  unreachable: "unreachable",
};
</script>

<template>
  <div ref="root" class="dropdown">
    <p
      v-if="currentStatus === 'unreachable' && currentFailure"
      class="failure-message"
      role="status"
      aria-live="polite"
    >
      {{ currentFailure }}
    </p>
    <button
      :id="triggerId"
      type="button"
      class="trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-activedescendant="activeOptionId"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="label">{{ modelValue }}</span>
      <span class="status" :data-status="currentStatus">
        <span class="dot" aria-hidden="true" />
        <span class="status-text">{{ statusLabel[currentStatus] }}</span>
      </span>
      <span class="caret" aria-hidden="true">▾</span>
    </button>

    <ul v-show="open" :id="listboxId" class="menu" role="listbox" :aria-labelledby="triggerId">
      <li
        v-for="(n, i) in OPTIONS"
        :id="optionId(n)"
        :key="n"
        class="option"
        role="option"
        :aria-selected="n === modelValue"
        :data-active="i === activeIndex"
        @mousedown.prevent="select(n)"
        @mousemove="activeIndex = i"
      >
        <span class="option-label">{{ n }}</span>
        <span class="option-status" :data-status="status[n]">
          <span class="dot" aria-hidden="true" />
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped src="./styles/dropdown.css"></style>
