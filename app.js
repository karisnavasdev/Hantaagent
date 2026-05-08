const CONTRACT_ADDRESS = "0xcomingsoon";
const HANTAVIRUS_ENDPOINTS = [
  "https://raw.githubusercontent.com/AntavGlobal/hantavirus-live-data/main/hantavirus.json",
  "./data/hantavirus.json",
];
const COUNTRIES_GEOJSON_URL =
  "./data/countries.geojson";

const COUNTRY_ALIASES = new Map([
  ["United States", "United States of America"],
  ["Russia", "Russian Federation"],
  ["South Korea", "Republic of Korea"],
  ["North Korea", "Democratic People's Republic of Korea"],
  ["Czech Republic", "Czechia"],
  ["Syria", "Syrian Arab Republic"],
  ["Laos", "Lao People's Democratic Republic"],
  ["Moldova", "Republic of Moldova"],
  ["Tanzania", "United Republic of Tanzania"],
  ["Vietnam", "Viet Nam"],
  ["Swaziland", "Eswatini"],
  ["Ivory Coast", "Cote d'Ivoire"],
  ["Brunei", "Brunei Darussalam"],
  ["Cape Verde", "Cabo Verde"],
]);

const copyButton = document.getElementById("copy-button");
const contractAddress = document.getElementById("contract-address");
const totalInfectedEl = document.getElementById("infected-total");
const totalDeathsEl = document.getElementById("death-total");
const latestUpdateEl = document.getElementById("latest-update");
const countryListEl = document.getElementById("country-list");
const sourceStatusEl = document.getElementById("source-status");
const communityCounterEl = document.getElementById("community-counter");
const intelHeadlineEl = document.getElementById("intel-headline");
const intelQuoteEl = document.getElementById("intel-quote");
const mobileMenuButton = document.getElementById("mobile-menu-button");
const mobileMenu = document.getElementById("mobile-menu");
const mobileMenuIcon = document.getElementById("mobile-menu-icon");
const mobileNavLinks = document.querySelectorAll(".mobile-nav-link");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");
const chatSendButton = document.getElementById("chat-send-button");
const chatStatus = document.getElementById("chat-status");

const CHATGPT_API_URL = "https://api.openai.com/v1/responses";
const CHATGPT_MODEL_CANDIDATES = ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"];
const CHATGPT_API_KEY = "";
const CHAT_MODEL_STORAGE_KEY = "hantavirus_chatgpt_model";
const CHAT_REPLY_ANIMATION_STEP_MS = 14;
const CHAT_REPLY_ANIMATION_CHUNK_SIZE = 2;
const CHATBOT_SYSTEM_PROMPT =
  "You are a concise public health assistant focused on hantavirus. Answer only hantavirus-related questions (symptoms, transmission, prevention, treatment, epidemiology, outbreaks, rodent control, travel advice). If the question is unrelated, politely ask the user to ask about hantavirus. Provide clear, practical information and include a short caution to seek professional medical care for urgent symptoms. Do not provide investment or token advice.";

let map;
let geoJsonLayer;
const chatConversation = [];
const CHAT_THINKING_ID = "chat-thinking-indicator";

function getEnvValue(...keys) {
  const env = window.__ENV__ || {};
  for (const key of keys) {
    const value = (env[key] || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function getChatApiKey() {
  return (
    getEnvValue("CHATGPT_API_KEY", "OPENAI_API_KEY") ||
    window.CHATGPT_API_KEY ||
    window.OPENAI_API_KEY ||
    CHATGPT_API_KEY ||
    ""
  );
}

function getPreferredChatModel() {
  const runtimeModel =
    getEnvValue("CHATGPT_MODEL", "OPENAI_MODEL") || window.CHATGPT_MODEL || window.OPENAI_MODEL || "";
  const storedModel = window.sessionStorage
    ? window.sessionStorage.getItem(CHAT_MODEL_STORAGE_KEY) || ""
    : "";
  return (runtimeModel || storedModel).trim();
}

function getCandidateModels() {
  const preferredModel = getPreferredChatModel();
  if (!preferredModel) {
    return CHATGPT_MODEL_CANDIDATES;
  }
  return [preferredModel, ...CHATGPT_MODEL_CANDIDATES.filter((model) => model !== preferredModel)];
}

function shouldTryNextModel(errorText) {
  const lower = String(errorText || "").toLowerCase();
  return (
    lower.includes("does not have access to model") ||
    lower.includes("model_not_found") ||
    lower.includes("unsupported model") ||
    lower.includes("not available")
  );
}

function setChatStatus(text, statusType = "idle") {
  if (!chatStatus) {
    return;
  }

  chatStatus.textContent = text;
  chatStatus.classList.remove("text-primary/60", "text-error", "text-primary");

  if (statusType === "error") {
    chatStatus.classList.add("text-error");
    return;
  }

  if (statusType === "ready") {
    chatStatus.classList.add("text-primary");
    return;
  }

  chatStatus.classList.add("text-primary/60");
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function animateAssistantReply(textEl, fullText) {
  if (!textEl) {
    return;
  }

  textEl.textContent = "";
  for (let index = 0; index < fullText.length; index += CHAT_REPLY_ANIMATION_CHUNK_SIZE) {
    textEl.textContent = fullText.slice(0, index + CHAT_REPLY_ANIMATION_CHUNK_SIZE);
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    await wait(CHAT_REPLY_ANIMATION_STEP_MS);
  }
}

async function addChatMessage(role, text, options = {}) {
  if (!chatMessages) {
    return null;
  }

  const article = document.createElement("article");
  article.className =
    role === "user" ? "chat-msg-user rounded-lg p-4" : "chat-msg-assistant rounded-lg p-4";

  const roleEl = document.createElement("div");
  roleEl.className = "font-terminal-sm text-[13px] uppercase tracking-[0.14em] text-primary";
  roleEl.textContent = role;

  const textEl = document.createElement("p");
  textEl.className = "mt-2 whitespace-pre-wrap text-[17px] leading-relaxed text-on-surface";
  textEl.textContent = text;

  article.appendChild(roleEl);
  article.appendChild(textEl);
  chatMessages.appendChild(article);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (options.animate && role === "assistant") {
    await animateAssistantReply(textEl, text);
  }

  return article;
}

function addThinkingIndicator() {
  if (!chatMessages || document.getElementById(CHAT_THINKING_ID)) {
    return;
  }

  const article = document.createElement("article");
  article.id = CHAT_THINKING_ID;
  article.className = "chat-msg-thinking rounded-lg p-4";
  article.innerHTML = `
    <div class="font-terminal-sm text-[13px] uppercase tracking-[0.14em] text-primary">assistant</div>
    <div class="mt-2 flex items-center gap-3 text-[17px] text-on-surface-variant">
      <span>Analyzing</span>
      <span class="thinking-dots" aria-label="Assistant is thinking" role="status">
        <span></span><span></span><span></span>
      </span>
    </div>
  `;

  chatMessages.appendChild(article);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeThinkingIndicator() {
  const thinkingEl = document.getElementById(CHAT_THINKING_ID);
  if (thinkingEl) {
    thinkingEl.remove();
  }
}

function setChatLoadingState(isLoading) {
  if (!chatSendButton) {
    return;
  }

  chatSendButton.disabled = isLoading;
  chatSendButton.textContent = isLoading ? "Sending..." : "Send";

  if (isLoading) {
    setChatStatus("transmitting", "ready");
    return;
  }

  setChatStatus(getChatApiKey() ? "armed" : "offline", getChatApiKey() ? "ready" : "idle");
}

function extractAssistantText(responseJson) {
  if (!responseJson || !Array.isArray(responseJson.output)) {
    return "";
  }

  const collectedParts = [];
  responseJson.output.forEach((item) => {
    if (!item || !Array.isArray(item.content)) {
      return;
    }
    item.content.forEach((contentItem) => {
      if (contentItem?.type === "output_text" && contentItem.text) {
        collectedParts.push(contentItem.text);
      }
    });
  });
  return collectedParts.join("\n").trim();
}

async function askHantavirusAssistant(userMessage) {
  const apiKey = getChatApiKey();
  if (!apiKey) {
    setChatStatus("missing key", "error");
    throw new Error("Missing API key. Set CHATGPT_API_KEY in .env before loading this page.");
  }

  const input = [
    { role: "system", content: CHATBOT_SYSTEM_PROMPT },
    ...chatConversation,
    { role: "user", content: userMessage },
  ];

  const models = getCandidateModels();
  let lastError = "Unable to reach ChatGPT API.";

  for (const model of models) {
    const response = await fetch(CHATGPT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input,
        temperature: 0.4,
        max_output_tokens: 350,
      }),
    });

    if (!response.ok) {
      let errorMessage = `ChatGPT API error (HTTP ${response.status})`;
      try {
        const errorJson = await response.json();
        if (errorJson?.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {}

      lastError = errorMessage;
      if (shouldTryNextModel(errorMessage)) {
        continue;
      }
      throw new Error(errorMessage);
    }

    const responseJson = await response.json();
    const assistantText = extractAssistantText(responseJson);
    if (!assistantText) {
      lastError = "No response text returned by ChatGPT API.";
      continue;
    }

    if (window.sessionStorage) {
      window.sessionStorage.setItem(CHAT_MODEL_STORAGE_KEY, model);
    }

    chatConversation.push({ role: "user", content: userMessage });
    chatConversation.push({ role: "assistant", content: assistantText });
    if (chatConversation.length > 12) {
      chatConversation.splice(0, chatConversation.length - 12);
    }

    setChatStatus(`armed:${model}`, "ready");
    return assistantText;
  }

  throw new Error(lastError);
}

function normalizeCountryName(countryName) {
  return COUNTRY_ALIASES.get(countryName) || countryName;
}

function getSeverityColor(infected) {
  if (infected >= 6) {
    return "#ff3b30";
  }
  if (infected >= 3) {
    return "#d4231b";
  }
  if (infected >= 1) {
    return "#ff8b84";
  }
  return "#1d0d0d";
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function renderCountryList(countries) {
  countryListEl.innerHTML = "";

  if (!countries.length) {
    countryListEl.innerHTML =
      '<p class="font-terminal-sm uppercase text-on-surface-variant">No active zones detected.</p>';
    return;
  }

  countries.forEach((country) => {
    const item = document.createElement("article");
    item.className =
      "border border-primary/10 bg-background/30 p-3 font-terminal-sm uppercase tracking-wide";
    item.innerHTML = `
      <strong>${country.country}</strong>
      <span class="mt-1 block text-on-surface-variant">${country.infected} confirmed cases</span>
      <span class="mt-1 block text-on-surface-variant">${country.deaths} confirmed deaths</span>
    `;
    countryListEl.appendChild(item);
  });
}

async function fetchFirstAvailable(urls) {
  const errors = [];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return { json: await response.json(), source: url };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }

  throw new Error(errors.join(" | "));
}

function buildMap(casesByCountry, countriesGeoJson) {
  map = L.map("outbreak-map", {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 6,
    worldCopyJump: true,
  }).setView([14, 0], 2);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  geoJsonLayer = L.geoJSON(countriesGeoJson, {
    style(feature) {
      const countryName = feature.properties.ADMIN || feature.properties.name;
      const entry = casesByCountry.get(countryName) || { infected: 0 };

      return {
        fillColor: getSeverityColor(entry.infected),
        weight: 0.8,
        opacity: 1,
        color: "#5b2a2a",
        fillOpacity: 0.82,
      };
    },
    onEachFeature(feature, layer) {
      const countryName = feature.properties.ADMIN || feature.properties.name;
      const entry = casesByCountry.get(countryName) || { infected: 0, deaths: 0 };

      layer.bindPopup(
        `<strong>${countryName}</strong><br />Cases: ${entry.infected}<br />Deaths: ${entry.deaths}`
      );

      layer.on({
        mouseover() {
          layer.setStyle({
            weight: 1.8,
            color: "#fff5f3",
            fillOpacity: 0.95,
          });
        },
        mouseout() {
          geoJsonLayer.resetStyle(layer);
        },
      });
    },
  }).addTo(map);
}

async function loadOutbreakData() {
  try {
    const [{ json: data, source }, { json: countriesGeoJson }] = await Promise.all([
      fetchFirstAvailable(HANTAVIRUS_ENDPOINTS),
      fetchFirstAvailable([COUNTRIES_GEOJSON_URL]),
    ]);

    const countriesWithCases = (data.zones || [])
      .filter((zone) => (zone.infected || 0) > 0 || (zone.deaths || 0) > 0)
      .sort((a, b) => b.infected - a.infected);

    const casesByCountry = new Map(
      (data.zones || []).map((zone) => [
        normalizeCountryName(zone.country),
        { infected: zone.infected || 0, deaths: zone.deaths || 0 },
      ])
    );

    totalInfectedEl.textContent = String(data.infected ?? "-");
    totalDeathsEl.textContent = String(data.deaths ?? "-");
    latestUpdateEl.textContent = data.latestUpdateAt
      ? formatDate(data.latestUpdateAt)
      : data.latestUpdate || "-";

    if (intelHeadlineEl) {
      intelHeadlineEl.textContent = `The outbreak feed is flashing ${data.infected || 0} confirmed cases and ${
        data.deaths || 0
      } deaths as red zones continue to trigger across the global surveillance grid.`;
    }

    if (intelQuoteEl) {
      const leadZone = countriesWithCases[0];
      intelQuoteEl.textContent = leadZone
        ? `>> Field monitors place ${leadZone.country} at the center of the current scare cycle with ${leadZone.infected} reported cases and ${leadZone.deaths} deaths now locked into the bulletin.`
        : ">> Emergency monitors confirm the latest bulletin remains active as surveillance rooms continue tracking the spread.";
    }
    if (communityCounterEl) {
      communityCounterEl.textContent = Intl.NumberFormat("en-US").format(
        14000 + (data.infected || 0) * 26
      );
    }

    renderCountryList(countriesWithCases);
    sourceStatusEl.textContent = `Live feed loaded from ${source}. Dataset timestamp: ${
      data.latestUpdate || data.latestUpdateAt || "unknown"
    }.`;

    buildMap(casesByCountry, countriesGeoJson);
  } catch (error) {
    totalInfectedEl.textContent = "ERR";
    totalDeathsEl.textContent = "ERR";
    latestUpdateEl.textContent = "ERR";
    sourceStatusEl.textContent = `Feed unavailable: ${error.message}`;
    countryListEl.innerHTML =
      '<p class="font-terminal-sm uppercase text-on-surface-variant">The surveillance room lost signal.</p>';
  }
}

async function copyContractAddress() {
  if (!copyButton || !contractAddress) {
    return;
  }

  const selectContractText = () => {
    contractAddress.focus();
    contractAddress.select();
    contractAddress.setSelectionRange(0, contractAddress.value.length);
  };

  const copyFallback = () => {
    const textArea = document.createElement("textarea");
    textArea.value = CONTRACT_ADDRESS;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.top = "-1000px";
    textArea.style.left = "-1000px";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, textArea.value.length);

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }

    document.body.removeChild(textArea);
    return copied;
  };

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(CONTRACT_ADDRESS);
    } else if (!copyFallback()) {
      throw new Error("Clipboard unavailable");
    }

    copyButton.innerHTML = "<span aria-hidden=\"true\">OK</span>";
    copyButton.classList.add("copied");
    copyButton.setAttribute("aria-label", "Copied");
  } catch {
    selectContractText();
    window.prompt("Copy contract address:", CONTRACT_ADDRESS);
    copyButton.innerHTML = "<span aria-hidden=\"true\">⧉</span>";
    copyButton.setAttribute("aria-label", "Copy manually");
    return;
  }

  window.setTimeout(() => {
    copyButton.innerHTML = "<span aria-hidden=\"true\">⧉</span>";
    copyButton.classList.remove("copied");
    copyButton.setAttribute("aria-label", "Copy contract address");
  }, 1800);
}

window.copyContractAddress = copyContractAddress;

if (copyButton) {
  copyButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await copyContractAddress();
  });
}

if (contractAddress) {
  contractAddress.addEventListener("click", () => {
    contractAddress.select();
    contractAddress.setSelectionRange(0, contractAddress.value.length);
  });
}

function setMobileMenuState(isOpen) {
  if (!mobileMenuButton || !mobileMenu || !mobileMenuIcon) {
    return;
  }

  mobileMenu.classList.toggle("hidden", !isOpen);
  mobileMenuButton.setAttribute("aria-expanded", String(isOpen));
  mobileMenuButton.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  mobileMenuIcon.textContent = isOpen ? "×" : "≡";
}

if (mobileMenuButton && mobileMenu) {
  mobileMenuButton.addEventListener("click", () => {
    const isOpen = mobileMenu.classList.contains("hidden");
    setMobileMenuState(isOpen);
  });
}

mobileNavLinks.forEach((link) => {
  link.addEventListener("click", () => {
    setMobileMenuState(false);
  });
});

if (chatForm && chatInput) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userMessage = chatInput.value.trim();

    if (!userMessage) {
      return;
    }

    await addChatMessage("user", userMessage);
    chatInput.value = "";
    setChatLoadingState(true);
    addThinkingIndicator();

    try {
      const assistantReply = await askHantavirusAssistant(userMessage);
      await addChatMessage("assistant", assistantReply, { animate: true });
      setChatStatus("ready", "ready");
    } catch (error) {
      const message = error?.message || "Unable to reach chatbot.";
      await addChatMessage("assistant", `Error: ${message}`);
      setChatStatus("error", "error");
    } finally {
      removeThinkingIndicator();
      setChatLoadingState(false);
    }
  });
}

async function initializeApp() {
  try {
    await Promise.resolve(window.__ENV_PROMISE);
  } catch {}

  if (chatForm && chatInput) {
    setChatStatus(getChatApiKey() ? "armed" : "offline", getChatApiKey() ? "ready" : "idle");
  }

  loadOutbreakData();
}

initializeApp();
