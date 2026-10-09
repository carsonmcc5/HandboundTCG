// Shared card data and deck rules define the builder's available choices.
const cards = window.handboundCards;
const rarityOrder = ["Legendary", "Epic", "Rare", "Uncommon", "Common"];
const slotLimits = { Legendary: 1, Epic: 2, Rare: 4, Uncommon: 7, Common: 11 };
const savedDecksKey = "handbound-saved-decks";
const savedDeckLimit = 20;
let deckType = "";
let mainDeck = [];
let sideboard = [];
let handDeckPool = [];
let startingHand = [];
let handDrawPhase = "blank";
// Track the current builder state independently from saved local decks.
let editingDeckIndex = null;

const workspace = document.querySelector("#builder-workspace");
const typeButtons = document.querySelectorAll(".deck-type-button");
const pickerList = document.querySelector("#picker-list");
const pickerDeckViewer = document.querySelector(".picker-deck-viewer");
const slotList = document.querySelector("#slot-list");
const message = document.querySelector("#builder-message");
const searchInput = document.querySelector("#deck-search");
const rarityFilter = document.querySelector("#deck-rarity-filter");
const kindFilter = document.querySelector("#deck-kind-filter");
const typeChoiceGrid = document.querySelector("#type-choice-grid");
const viewer = document.querySelector("#deck-viewer");
// Map each deck type to its artwork directory.
const imageFolders = { Bug: "PNG - Bug", Beast: "PNG - Beast", Light: "PNG - Light", Dark: "PNG - Dark" };

// Return the browser-safe artwork path for a card.
function getCardImagePath(card) {
  const folder = imageFolders[card.types[0]];
  const filename = encodeURIComponent(`${card.number} - ${card.image}.png`);
  return `Items/PNGs/${folder}/PNG/${filename}`;
}

function setMessage(text, isError = false) {
  // Display builder feedback and distinguish validation errors visually.
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function escapeHTML(value) {
  const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value).replace(/[&<>"']/g, (character) => replacements[character]);
}

function promptSavedDeckLimit() {
  window.alert(`You already have ${savedDeckLimit} saved decks. Delete a deck first to create another.`);
}

function calculateDeckKeyChecksum(bytes) {
  return bytes.reduce((checksum, byte) => (checksum * 31 + byte) & 0xffff, 0);
}

function encodeDeckKey(deck) {
  const typeCodes = { Bug: 0, Beast: 1, Light: 2, Dark: 3 };
  const bytes = [1, typeCodes[deck.type], deck.main.length, deck.side.length];
  [...deck.main, ...deck.side].forEach((number) => {
    const code = Number(number);
    bytes.push((code >> 16) & 0xff, (code >> 8) & 0xff, code & 0xff);
  });
  const checksum = calculateDeckKeyChecksum(bytes);
  bytes.push(checksum >> 8, checksum & 0xff);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `HB1-${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

function decodeDeckKey(rawKey) {
  const match = /^HB1-([A-Za-z0-9_-]+)$/.exec(rawKey.trim());
  if (!match) throw new Error("Enter a valid HB1 deck key.");
  const encoded = match[1].replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(encoded + "=".repeat((4 - encoded.length % 4) % 4));
  const bytes = Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length < 10 || bytes[0] !== 1) throw new Error("This deck key version is not supported.");

  const type = ["Bug", "Beast", "Light", "Dark"][bytes[1]];
  const mainLength = bytes[2];
  const sideLength = bytes[3];
  if (!type || mainLength !== 25 || sideLength > 5 || bytes.length !== 4 + (mainLength + sideLength) * 3 + 2) {
    throw new Error("This key does not describe a valid 25-card deck and sideboard.");
  }

  const payload = bytes.slice(0, -2);
  const expectedChecksum = calculateDeckKeyChecksum(payload);
  if (bytes.at(-2) !== (expectedChecksum >> 8) || bytes.at(-1) !== (expectedChecksum & 0xff)) {
    throw new Error("This deck key is incomplete or has been changed.");
  }

  const cardNumbers = [];
  for (let index = 4; index < bytes.length - 2; index += 3) {
    const number = ((bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2]).toString().padStart(7, "0");
    const card = findCard(number);
    if (!card) throw new Error(`This deck key refers to unknown card ${number}.`);
    if (!card.types.includes(type)) throw new Error(`${card.name} does not match the deck's declared ${type} type.`);
    cardNumbers.push(number);
  }

  const main = cardNumbers.slice(0, mainLength);
  const side = cardNumbers.slice(mainLength);
  if ([...new Set(cardNumbers)].some((number) => totalCopyCountFor(number, main, side) > 2)) {
    throw new Error("This deck contains more than two copies of a card.");
  }
  if (!allocateSlots(main).assignments.every(Boolean)) throw new Error("This deck exceeds the rarity slot limits.");
  return { type, main, side };
}

function totalCopyCountFor(number, main, side) {
  return main.filter((cardNumber) => cardNumber === number).length + side.filter((cardNumber) => cardNumber === number).length;
}

function shareSavedDeck(index) {
  const deck = JSON.parse(localStorage.getItem(savedDecksKey) || "[]")[index];
  if (!deck) return;
  document.querySelector("#share-deck-key").value = encodeDeckKey(deck);
  document.querySelector("#share-deck-status").textContent = "";
  document.querySelector("#share-deck-dialog").showModal();
}

function importDeck() {
  document.querySelector("#import-deck-key").value = "";
  document.querySelector("#import-deck-status").textContent = "";
  document.querySelector("#import-deck-dialog").showModal();
  document.querySelector("#import-deck-key").focus();
}

function saveImportedDeck(key) {
  const saved = JSON.parse(localStorage.getItem(savedDecksKey) || "[]");
  if (saved.length >= savedDeckLimit) return promptSavedDeckLimit();
  const deck = decodeDeckKey(key);
  saved.unshift({ ...deck, name: "Imported Deck", favorite: false, savedAt: new Date().toISOString() });
  localStorage.setItem(savedDecksKey, JSON.stringify(saved));
  renderSavedDecks();
  setMessage("Imported deck saved to this device.");
}

function cardsOfType() {
  // Decks may only use cards matching the declared type.
  return cards.filter((card) => card.types.includes(deckType));
}

function copyCount(cardNumber, collection = mainDeck) {
  return collection.filter((number) => number === cardNumber).length;
}

function totalCopyCount(cardNumber) {
  return copyCount(cardNumber, mainDeck) + copyCount(cardNumber, sideboard);
}

function findCard(number) {
  return cards.find((card) => card.number === number);
}

function allocateSlots(collection) {
  // Assign cards to their rarity slot or the next eligible higher slot.
  const used = Object.fromEntries(rarityOrder.map((rarity) => [rarity, 0]));
  const assignments = [];
  collection.map((number, index) => ({ number, index, card: findCard(number) })).sort((first, second) => rarityOrder.indexOf(second.card.rarity) - rarityOrder.indexOf(first.card.rarity)).forEach(({ index, card }) => {
    const start = rarityOrder.indexOf(card.rarity);
    const eligibleSlots = [card.rarity, ...rarityOrder.slice(0, start).reverse()];
    const slot = eligibleSlots.find((rarity) => used[rarity] < slotLimits[rarity]);
    assignments[index] = slot || null;
    if (slot) used[slot] += 1;
  });
  return { used, assignments };
}

function getSlotForCard(card, collection = mainDeck) {
  const nextCollection = [...collection, card.number];
  const allocation = allocateSlots(nextCollection);
  return allocation.assignments[nextCollection.length - 1] && allocation.assignments.every(Boolean) ? allocation.assignments[nextCollection.length - 1] : null;
}

function renderSlots() {
  // Refresh slot usage and the main/sideboard counters.
  const { used } = allocateSlots(mainDeck);
  slotList.innerHTML = rarityOrder.map((rarity) => `<div class="slot-row"><span class="rarity-${rarity.toLowerCase()}">${rarity.slice(0, 1)}</span><b>${used[rarity]}</b><small>/ ${slotLimits[rarity]}</small><label>${rarity} slot${slotLimits[rarity] > 1 ? "s" : ""}</label></div>`).join("");
  document.querySelector("#main-count").textContent = mainDeck.length;
  document.querySelector("#side-count").textContent = sideboard.length;
}

function renderPicker() {
  // Filter and render cards that can be added to the active deck.
  const query = searchInput.value.trim().toLowerCase();
  const visible = cardsOfType()
    .filter((card) => rarityFilter.value === "all" || card.rarity === rarityFilter.value)
    .filter((card) => kindFilter.value === "all" || card.kind === kindFilter.value)
    .filter((card) => [card.name, card.number].some((value) => value.toLowerCase().includes(query)))
    .sort((first, second) => rarityOrder.indexOf(first.rarity) - rarityOrder.indexOf(second.rarity) || first.number.localeCompare(second.number));
  document.querySelector("#picker-count").textContent = `${visible.length} available`;
  pickerList.innerHTML = visible.map((card) => {
    const mainCopies = copyCount(card.number);
    const sideCopies = copyCount(card.number, sideboard);
    const totalCopies = totalCopyCount(card.number);
    const mainSlot = getSlotForCard(card);
    const canMain = totalCopies < 2 && Boolean(mainSlot) && mainDeck.length < 25;
    const canSide = totalCopies < 2 && sideboard.length < 5;
    const ability = card.ability.replace(/^AW\s*/, "").trim();
    const hasAbility = ability && ability.toLowerCase() !== "n/a";
    const stats = card.kind === "creature" ? `${card.cost}  ${card.atk}/${card.def}` : `${card.cost}`;
    return `<article class="picker-card rarity-${card.rarity.toLowerCase()} ${totalCopies ? "is-selected" : ""}"><div class="picker-card-title"><img class="picker-card-image" src="${getCardImagePath(card)}" alt="${card.image}" onerror="this.hidden = true; this.nextElementSibling.hidden = false" /><span class="picker-symbol image-coming-soon" hidden>Image coming soon</span><div><h3>${card.name}</h3><p>${card.rarity} · ${card.kind} · ${card.number}</p></div><strong class="picker-stats">${stats}</strong></div><span class="picker-types">${card.types.join(" / ")}</span>${hasAbility ? `<p class="picker-ability"><b>Ability</b> ${ability}</p>` : ""}<div class="picker-card-actions"><span>${totalCopies}/2 total</span><button class="mini-button" data-add-main="${card.number}" ${canMain ? "" : "disabled"}>+ Main</button><button class="mini-button" data-add-side="${card.number}" ${canSide ? "" : "disabled"}>+ Side</button><button class="mini-button remove-button" data-remove-main="${card.number}" ${mainCopies ? "" : "disabled"}>- Main</button><button class="mini-button remove-button" data-remove-side="${card.number}" ${sideCopies ? "" : "disabled"}>- Side</button></div></article>`;
  }).join("") || `<p class="muted-note">No cards match this search.</p>`;
}

function renderPickerDeckViewer() {
  // Show the current deck contents beneath the available-card picker.
  const renderList = (numbers, target) => [...numbers]
    .sort((firstNumber, secondNumber) => {
      const firstCard = findCard(firstNumber);
      const secondCard = findCard(secondNumber);
      return rarityOrder.indexOf(firstCard.rarity) - rarityOrder.indexOf(secondCard.rarity) || firstNumber.localeCompare(secondNumber);
    })
    .map((number) => {
      const card = findCard(number);
      if (!card) return "";
      const stats = card.kind === "creature" ? `${card.cost} · ${card.atk}/${card.def}` : `${card.cost}`;
      return `<li><span>${card.name}</span><small>${stats}</small><button class="picker-viewer-remove mini-button" type="button" data-remove-card="${number}" data-remove-target="${target}">Remove</button></li>`;
    }).join("") || `<li class="picker-viewer-empty">No cards added</li>`;
  document.querySelector("#picker-viewer-main-count").textContent = `${mainDeck.length} / 25`;
  document.querySelector("#picker-viewer-main-list").innerHTML = renderList(mainDeck, "main");
  document.querySelector("#picker-viewer-side-list").innerHTML = renderList(sideboard, "side");
}

function renderSavedDecks() {
  // Load locally saved decks and expose load/delete actions.
  const saved = JSON.parse(localStorage.getItem(savedDecksKey) || "[]");
  const deckMarkup = saved.map((deck, index) => ({ deck, index }))
    .sort((first, second) => Number(Boolean(second.deck.favorite)) - Number(Boolean(first.deck.favorite)) || first.index - second.index)
    .map(({ deck, index }) => {
      const safeName = escapeHTML(deck.name || "Untitled deck");
      const isFavorite = Boolean(deck.favorite);
      return `<div class="saved-deck"><button class="saved-deck-load" data-load-deck="${index}"><strong>${safeName}</strong><span>${escapeHTML(deck.type)} · ${deck.main.length}/25 main · ${deck.side.length}/5 side</span></button><button class="saved-deck-view" data-view-deck="${index}">View deck</button><button class="saved-deck-share" type="button" data-share-deck="${index}">Share deck</button><button class="saved-deck-favorite${isFavorite ? " is-favorite" : ""}" type="button" data-favorite-deck="${index}" aria-label="${isFavorite ? "Remove" : "Add"} ${safeName} ${isFavorite ? "from" : "to"} favorites" aria-pressed="${isFavorite}">★</button><button class="saved-deck-delete" data-delete-deck="${index}" aria-label="Delete ${safeName}">Delete</button></div>`;
    }).join("") || `<p class="muted-note">Saved decks live on this device.</p>`;
  const savedLobby = document.querySelector("#saved-decks-lobby");
  const savedLobbyCount = document.querySelector("#saved-lobby-count");
  if (savedLobby) savedLobby.innerHTML = deckMarkup;
  if (savedLobbyCount) savedLobbyCount.textContent = `${saved.length} / ${savedDeckLimit}`;
}

function startBuilder(type) {
  // Reset the editor and open a new deck for the chosen type.
  deckType = type;
  editingDeckIndex = null;
  mainDeck = [];
  sideboard = [];
  viewer.hidden = true;
  workspace.hidden = false;
  document.querySelector("#builder-start").hidden = true;
  document.querySelector("#declared-type-label").textContent = type;
  document.querySelector("#picker-heading").textContent = `${type} cards`;
  document.querySelector("#view-saved-deck-button").hidden = true;
  renderAll();
  workspace.scrollIntoView({ behavior: "smooth", block: "start" });
}

function addCard(number, target) {
  // Validate copy and capacity limits before adding a card to a collection.
  const card = findCard(number);
  if (!card) return;
  const collection = target === "main" ? mainDeck : sideboard;
  if (totalCopyCount(number) >= 2) return setMessage("A deck and its sideboard can contain no more than two copies of the same card combined.", true);
  if (target === "side") {
    if (sideboard.length >= 5) return setMessage("Your sideboard is full at five cards.", true);
    sideboard.push(number);
  } else {
    if (mainDeck.length >= 25) return setMessage("Your main deck is full at 25 cards.", true);
    if (!getSlotForCard(card)) return setMessage(`${card.name} has no open rarity slot.`, true);
    mainDeck.push(number);
  }
  setMessage("");
  renderAll();
}

function saveDeck() {
  // Persist the current deck locally, replacing an edited deck when needed.
  if (mainDeck.length !== 25) return setMessage("Complete all 25 main-deck cards before saving.", true);
  const saved = JSON.parse(localStorage.getItem(savedDecksKey) || "[]");
  if (editingDeckIndex === null && saved.length >= savedDeckLimit) {
    promptSavedDeckLimit();
    return;
  }
  const previousDeck = editingDeckIndex === null ? null : saved[editingDeckIndex];
  const deck = { name: document.querySelector("#deck-name-input").value.trim() || "Untitled deck", type: deckType, main: mainDeck, side: sideboard, favorite: Boolean(previousDeck?.favorite), savedAt: new Date().toISOString() };
  if (editingDeckIndex === null) {
    saved.unshift(deck);
    editingDeckIndex = 0;
  } else saved[editingDeckIndex] = deck;
  localStorage.setItem(savedDecksKey, JSON.stringify(saved));
  renderSavedDecks();
  document.querySelector("#view-saved-deck-button").hidden = false;
  setMessage("Deck saved to this device.");
  const saveButton = document.querySelector("#save-deck-button");
  saveButton.classList.add("saved-state");
  saveButton.textContent = "✓ Saved";
  window.setTimeout(() => { saveButton.classList.remove("saved-state"); saveButton.textContent = "Save deck"; }, 1200);
}

function renderCostChart(deck) {
  // Count main-deck cards by cost and draw labeled bars with a left count axis.
  const counts = new Map();
  deck.main.forEach((number) => {
    const card = findCard(number);
    counts.set(card.cost, (counts.get(card.cost) || 0) + 1);
  });
  const maxCost = Math.max(0, ...counts.keys());
  const maxCount = Math.max(1, ...counts.values());
  const plot = { left: 92, top: 36, width: 524, height: 376 };
  const bottom = plot.top + plot.height;
  const costCount = maxCost + 1;
  const slotWidth = plot.width / costCount;
  const barWidth = Math.min(38, slotWidth * 0.58);
  const tickStep = Math.max(1, Math.ceil(maxCount / 4));
  const ticks = Array.from({ length: Math.floor(maxCount / tickStep) + 1 }, (_, index) => index * tickStep);
  if (ticks[ticks.length - 1] !== maxCount) ticks.push(maxCount);
  const grid = ticks.map((tick) => {
    const y = bottom - (tick / maxCount) * plot.height;
    return `<line x1="${plot.left}" y1="${y}" x2="${plot.left + plot.width}" y2="${y}" class="chart-gridline" /><text x="${plot.left - 12}" y="${y + 4}" text-anchor="end" class="chart-tick">${tick}</text>`;
  }).join("");
  const bars = Array.from({ length: costCount }, (_, cost) => {
    const count = counts.get(cost) || 0;
    const height = (count / maxCount) * plot.height;
    const x = plot.left + cost * slotWidth + (slotWidth - barWidth) / 2;
    const y = bottom - height;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" class="chart-bar"><title>Cost ${cost}: ${count} ${count === 1 ? "card" : "cards"}</title></rect><text x="${plot.left + cost * slotWidth + slotWidth / 2}" y="${bottom + 44}" text-anchor="middle" class="chart-tick">${cost}</text>`;
  }).join("");
  document.querySelector("#viewer-cost-chart").innerHTML = `<text x="28" y="${plot.top + plot.height / 2}" text-anchor="middle" transform="rotate(-90 28 ${plot.top + plot.height / 2})" class="chart-axis-label">Cards</text>${grid}<line x1="${plot.left}" y1="${bottom}" x2="${plot.left + plot.width}" y2="${bottom}" class="chart-axis" />${bars}<text x="${plot.left + plot.width / 2}" y="516" text-anchor="middle" class="chart-axis-label">Cost</text>`;
}

function drawCardsFromPool(amount) {
  // Draw unique deck positions so duplicate copies retain independent odds.
  const drawn = [];
  const drawAmount = Math.min(amount, handDeckPool.length);
  for (let index = 0; index < drawAmount; index += 1) {
    const poolIndex = Math.floor(Math.random() * handDeckPool.length);
    drawn.push(handDeckPool.splice(poolIndex, 1)[0]);
  }
  return drawn;
}

function renderStartingHand() {
  // Render the current hand and show only actions valid for this draw phase.
  const handCards = document.querySelector("#starting-hand-cards");
  handCards.innerHTML = startingHand.map((number, index) => {
    const card = findCard(number);
    return `<div class="hand-card" style="--card-index:${index}"><img src="${getCardImagePath(card)}" alt="${card.name}" /><span>${card.name}</span></div>`;
  }).join("");
  document.querySelector("#starting-hand-status").textContent = handDrawPhase === "drawn" ? `${startingHand.length} cards drawn` : handDrawPhase === "mulliganed" ? "Mulliganed hand" : handDrawPhase === "opening" ? "Opening hand" : "Ready to draw";
  document.querySelector("#draw-starting-hand").hidden = handDrawPhase !== "blank";
  document.querySelector("#draw-two-cards").hidden = !["opening", "mulliganed"].includes(handDrawPhase);
  document.querySelector("#mulligan-hand").hidden = handDrawPhase !== "opening";
  document.querySelector("#reset-starting-hand").hidden = handDrawPhase === "blank";
}

function resetStartingHand(deck = []) {
  // Return the simulator to its blank state using a fresh copy of this deck.
  handDeckPool = [...deck];
  startingHand = [];
  handDrawPhase = "blank";
  renderStartingHand();
}

function drawStartingHand() {
  handDeckPool = [...mainDeck];
  startingHand = drawCardsFromPool(3);
  handDrawPhase = "opening";
  renderStartingHand();
}

function drawTwoCards() {
  if (!["opening", "mulliganed"].includes(handDrawPhase)) return;
  startingHand.push(...drawCardsFromPool(2));
  handDrawPhase = "drawn";
  renderStartingHand();
}

function mulliganHand() {
  if (handDrawPhase !== "opening") return;
  handDeckPool.push(...startingHand);
  startingHand = drawCardsFromPool(3);
  handDrawPhase = "mulliganed";
  renderStartingHand();
}

function renderViewer(deck) {
  // Render a read-only view of a saved deck and its card lists.
  document.querySelector("#viewer-name").textContent = deck.name;
  document.querySelector("#viewer-type").textContent = `${deck.type} deck`;
  document.querySelector("#viewer-main-count").textContent = `${deck.main.length} / 25`;
  document.querySelector("#viewer-side-count").textContent = `${deck.side.length} / 5`;
  renderCostChart(deck);
  resetStartingHand(deck.main);
  const listMarkup = (numbers) => [...numbers].sort((firstNumber, secondNumber) => { const firstCard = findCard(firstNumber); const secondCard = findCard(secondNumber); return rarityOrder.indexOf(firstCard.rarity) - rarityOrder.indexOf(secondCard.rarity) || firstNumber.localeCompare(secondNumber); }).map((number) => { const card = findCard(number); const stats = card.kind === "creature" ? `${card.cost}  ${card.atk}/${card.def}` : `${card.cost}`; const ability = card.ability.replace(/^AW\s*/, "").trim(); return `<li><div class="viewer-card-name"><span>${card.name}</span></div><div class="viewer-card-meta"><small class="rarity-${card.rarity.toLowerCase()}">${card.rarity} · ${card.kind} · ${card.number}</small><strong>${stats}</strong></div><div class="viewer-card-ability">${ability && ability.toLowerCase() !== "n/a" ? `<b>Ability</b> ${ability}` : ""}</div></li>`; }).join("");
  document.querySelector("#viewer-main-list").innerHTML = listMarkup(deck.main);
  document.querySelector("#viewer-side-list").innerHTML = listMarkup(deck.side) || `<li class="empty-viewer-list">No sideboard cards</li>`;
}

function loadDeck(index) {
  const deck = JSON.parse(localStorage.getItem(savedDecksKey) || "[]")[index];
  if (!deck) return;
  editingDeckIndex = index; deckType = deck.type; mainDeck = deck.main; sideboard = deck.side;
  renderViewer(deck); viewer.hidden = false; workspace.hidden = true; document.querySelector("#builder-start").hidden = true;
}

function toggleDeckFavorite(index) {
  const saved = JSON.parse(localStorage.getItem(savedDecksKey) || "[]");
  if (!saved[index]) return;
  saved[index].favorite = !saved[index].favorite;
  localStorage.setItem(savedDecksKey, JSON.stringify(saved));
  renderSavedDecks();
}

function deleteDeck(index) {
  const saved = JSON.parse(localStorage.getItem(savedDecksKey) || "[]");
  if (!saved[index]) return;
  saved.splice(index, 1);
  localStorage.setItem(savedDecksKey, JSON.stringify(saved));
  if (editingDeckIndex === index) {
    editingDeckIndex = null;
    viewer.hidden = true;
    workspace.hidden = true;
    document.querySelector("#builder-start").hidden = false;
  } else if (editingDeckIndex !== null && editingDeckIndex > index) {
    editingDeckIndex -= 1;
  }
  renderSavedDecks();
}

function renderAll() { renderSlots(); renderPicker(); renderPickerDeckViewer(); renderSavedDecks(); }
typeButtons.forEach((button) => button.addEventListener("click", () => startBuilder(button.dataset.deckType)));
document.querySelector("#create-deck-button").addEventListener("click", () => { if (JSON.parse(localStorage.getItem(savedDecksKey) || "[]").length >= savedDeckLimit) return promptSavedDeckLimit(); typeChoiceGrid.hidden = false; document.querySelector("#create-deck-button").hidden = true; });
document.querySelector("#import-deck-button").addEventListener("click", importDeck);
document.querySelector("#cancel-import-deck-button").addEventListener("click", () => document.querySelector("#import-deck-dialog").close());
document.querySelector("#import-deck-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const status = document.querySelector("#import-deck-status");
  try {
    saveImportedDeck(document.querySelector("#import-deck-key").value);
    document.querySelector("#import-deck-dialog").close();
  } catch (error) {
    status.textContent = error.message || "Unable to import this deck key.";
    status.classList.add("is-error");
  }
});
document.querySelector("#copy-deck-key-button").addEventListener("click", async () => {
  const keyInput = document.querySelector("#share-deck-key");
  const status = document.querySelector("#share-deck-status");
  keyInput.focus();
  keyInput.select();
  try {
    await navigator.clipboard.writeText(keyInput.value);
    status.textContent = "Deck key copied.";
    status.classList.remove("is-error");
  } catch {
    status.textContent = "Key selected. Press Ctrl+C to copy it.";
    status.classList.remove("is-error");
  }
});
document.querySelector("#new-deck-button").addEventListener("click", () => { if (JSON.parse(localStorage.getItem(savedDecksKey) || "[]").length >= savedDeckLimit) return promptSavedDeckLimit(); editingDeckIndex = null; viewer.hidden = true; workspace.hidden = true; document.querySelector("#builder-start").hidden = false; typeChoiceGrid.hidden = true; document.querySelector("#create-deck-button").hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); });
document.querySelector("#save-deck-button").addEventListener("click", saveDeck);
document.querySelector("#view-saved-deck-button").addEventListener("click", () => loadDeck(editingDeckIndex));
document.querySelector("#draw-starting-hand").addEventListener("click", drawStartingHand);
document.querySelector("#draw-two-cards").addEventListener("click", drawTwoCards);
document.querySelector("#mulligan-hand").addEventListener("click", mulliganHand);
document.querySelector("#reset-starting-hand").addEventListener("click", () => resetStartingHand(mainDeck));
function removeCard(number, target) { const collection = target === "main" ? mainDeck : sideboard; const index = collection.lastIndexOf(number); if (index >= 0) collection.splice(index, 1); setMessage(""); renderAll(); }
pickerDeckViewer.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-card]");
  if (!removeButton) return;
  removeCard(removeButton.dataset.removeCard, removeButton.dataset.removeTarget);
});
pickerList.addEventListener("click", (event) => { const main = event.target.closest("[data-add-main]"); const side = event.target.closest("[data-add-side]"); const removeMain = event.target.closest("[data-remove-main]"); const removeSide = event.target.closest("[data-remove-side]"); if (main) addCard(main.dataset.addMain, "main"); if (side) addCard(side.dataset.addSide, "side"); if (removeMain) removeCard(removeMain.dataset.removeMain, "main"); if (removeSide) removeCard(removeSide.dataset.removeSide, "side"); });
document.querySelector("#saved-decks-lobby").addEventListener("click", (event) => { const shareButton = event.target.closest("[data-share-deck]"); if (shareButton) { event.stopPropagation(); shareSavedDeck(Number(shareButton.dataset.shareDeck)); return; } const favoriteButton = event.target.closest("[data-favorite-deck]"); if (favoriteButton) { event.stopPropagation(); toggleDeckFavorite(Number(favoriteButton.dataset.favoriteDeck)); return; } const deleteButton = event.target.closest("[data-delete-deck]"); if (deleteButton) { event.stopPropagation(); if (window.confirm("Are you sure you want to delete this deck?")) deleteDeck(Number(deleteButton.dataset.deleteDeck)); return; } const viewButton = event.target.closest("[data-view-deck]"); if (viewButton) { loadDeck(Number(viewButton.dataset.viewDeck)); return; } const button = event.target.closest("[data-load-deck]"); if (button) loadDeck(Number(button.dataset.loadDeck)); });
document.querySelector("#viewer-edit-button").addEventListener("click", () => { viewer.hidden = true; workspace.hidden = false; document.querySelector("#builder-start").hidden = true; document.querySelector("#declared-type-label").textContent = deckType; document.querySelector("#deck-name-input").value = JSON.parse(localStorage.getItem(savedDecksKey) || "[]")[editingDeckIndex].name; renderAll(); });
document.querySelector("#viewer-return-button").addEventListener("click", () => { viewer.hidden = true; document.querySelector("#builder-start").hidden = false; typeChoiceGrid.hidden = true; document.querySelector("#create-deck-button").hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); });
document.querySelector("#editor-return-button").addEventListener("click", () => { viewer.hidden = true; workspace.hidden = true; document.querySelector("#builder-start").hidden = false; typeChoiceGrid.hidden = true; document.querySelector("#create-deck-button").hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); });
searchInput.addEventListener("input", renderPicker); rarityFilter.addEventListener("change", renderPicker); kindFilter.addEventListener("change", renderPicker);
renderSavedDecks();
