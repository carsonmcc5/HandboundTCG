const cards = window.handboundCards;
const rarityOrder = ["Legendary", "Epic", "Rare", "Uncommon", "Common"];
const slotLimits = { Legendary: 1, Epic: 2, Rare: 4, Uncommon: 7, Common: 11 };
const savedDecksKey = "handbound-saved-decks";
let deckType = "";
let mainDeck = [];
let sideboard = [];
let editingDeckIndex = null;

const workspace = document.querySelector("#builder-workspace");
const typeButtons = document.querySelectorAll(".deck-type-button");
const pickerList = document.querySelector("#picker-list");
const slotList = document.querySelector("#slot-list");
const message = document.querySelector("#builder-message");
const searchInput = document.querySelector("#deck-search");
const rarityFilter = document.querySelector("#deck-rarity-filter");
const kindFilter = document.querySelector("#deck-kind-filter");
const typeChoiceGrid = document.querySelector("#type-choice-grid");
const viewer = document.querySelector("#deck-viewer");

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function readSavedDecks() {
  try {
    const saved = JSON.parse(localStorage.getItem(savedDecksKey) || "[]");
    return Array.isArray(saved) ? saved.filter((deck) => deck && typeof deck.name === "string" && typeof deck.type === "string" && Array.isArray(deck.main) && Array.isArray(deck.side)) : [];
  } catch {
    return [];
  }
}

function cardsOfType() {
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
  const { used } = allocateSlots(mainDeck);
  slotList.innerHTML = rarityOrder.map((rarity) => `<div class="slot-row"><span class="rarity-${rarity.toLowerCase()}">${rarity.slice(0, 1)}</span><b>${used[rarity]}</b><small>/ ${slotLimits[rarity]}</small><label>${rarity} slot${slotLimits[rarity] > 1 ? "s" : ""}</label></div>`).join("");
  document.querySelector("#main-count").textContent = mainDeck.length;
  document.querySelector("#side-count").textContent = sideboard.length;
}

function renderPicker() {
  const query = searchInput.value.trim().toLowerCase();
  const visible = cardsOfType().filter((card) => rarityFilter.value === "all" || card.rarity === rarityFilter.value).filter((card) => kindFilter.value === "all" || card.kind === kindFilter.value).filter((card) => [card.name, card.number].some((value) => value.toLowerCase().includes(query)));
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
    return `<article class="picker-card rarity-${card.rarity.toLowerCase()} ${totalCopies ? "is-selected" : ""}"><div class="picker-card-title"><span class="picker-symbol">${card.symbol}</span><div><h3>${card.name}</h3><p>${card.rarity} · ${card.kind} · ${card.number}</p></div><strong class="picker-stats">${stats}</strong></div><span class="picker-types">${card.types.join(" / ")}</span>${hasAbility ? `<p class="picker-ability"><b>Ability</b> ${ability}</p>` : ""}<div class="picker-card-actions"><span>${totalCopies}/2 total</span><button class="mini-button" data-add-main="${card.number}" ${canMain ? "" : "disabled"}>+ Main</button><button class="mini-button" data-add-side="${card.number}" ${canSide ? "" : "disabled"}>+ Side</button><button class="mini-button remove-button" data-remove-main="${card.number}" ${mainCopies ? "" : "disabled"}>- Main</button><button class="mini-button remove-button" data-remove-side="${card.number}" ${sideCopies ? "" : "disabled"}>- Side</button></div></article>`;
  }).join("") || `<p class="muted-note">No cards match this search.</p>`;
}

function renderSavedDecks() {
  const saved = readSavedDecks();
  const deckMarkup = saved.map((deck, index) => `<button class="saved-deck" data-load-deck="${index}"><strong>${escapeHtml(deck.name)}</strong><span>${escapeHtml(deck.type)} · ${deck.main.length}/25 main · ${deck.side.length}/5 side</span></button>`).join("") || `<p class="muted-note">Saved decks live on this device.</p>`;
  const savedLobby = document.querySelector("#saved-decks-lobby");
  const savedLobbyCount = document.querySelector("#saved-lobby-count");
  if (savedLobby) savedLobby.innerHTML = deckMarkup;
  if (savedLobbyCount) savedLobbyCount.textContent = saved.length;
}

function startBuilder(type) {
  deckType = type;
  editingDeckIndex = null;
  mainDeck = [];
  sideboard = [];
  viewer.hidden = true;
  workspace.hidden = false;
  document.querySelector("#builder-start").hidden = true;
  document.querySelector("#declared-type-label").textContent = type;
  document.querySelector("#picker-heading").textContent = `${type} cards`;
  renderAll();
  workspace.scrollIntoView({ behavior: "smooth", block: "start" });
}

function addCard(number, target) {
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
  if (mainDeck.length !== 25) return setMessage("Complete all 25 main-deck cards before saving.", true);
  const saved = readSavedDecks();
  const deck = { name: document.querySelector("#deck-name-input").value.trim() || "Untitled deck", type: deckType, main: mainDeck, side: sideboard, savedAt: new Date().toISOString() };
  if (editingDeckIndex === null) saved.unshift(deck);
  else saved[editingDeckIndex] = deck;
  localStorage.setItem(savedDecksKey, JSON.stringify(saved.slice(0, 20)));
  renderSavedDecks();
  setMessage("Deck saved to this device.");
  const saveButton = document.querySelector("#save-deck-button");
  saveButton.classList.add("saved-state");
  saveButton.textContent = "✓ Saved";
  window.setTimeout(() => { saveButton.classList.remove("saved-state"); saveButton.textContent = "Save deck"; }, 1200);
}

function renderViewer(deck) {
  document.querySelector("#viewer-name").textContent = deck.name;
  document.querySelector("#viewer-type").textContent = `${deck.type} deck`;
  document.querySelector("#viewer-main-count").textContent = `${deck.main.length} / 25`;
  document.querySelector("#viewer-side-count").textContent = `${deck.side.length} / 5`;
  const listMarkup = (numbers) => numbers.map((number) => { const card = findCard(number); const stats = card.kind === "creature" ? `${card.cost}  ${card.atk}/${card.def}` : `${card.cost}`; const ability = card.ability.replace(/^AW\s*/, "").trim(); return `<li><div class="viewer-card-name"><span>${card.name}</span></div><div class="viewer-card-meta"><small class="rarity-${card.rarity.toLowerCase()}">${card.rarity} · ${card.kind} · ${card.number}</small><strong>${stats}</strong></div><div class="viewer-card-ability">${ability && ability.toLowerCase() !== "n/a" ? `<b>Ability</b> ${ability}` : ""}</div></li>`; }).join("");
  document.querySelector("#viewer-main-list").innerHTML = listMarkup(deck.main);
  document.querySelector("#viewer-side-list").innerHTML = listMarkup(deck.side) || `<li class="empty-viewer-list">No sideboard cards</li>`;
}

function loadDeck(index) {
  const deck = readSavedDecks()[index];
  if (!deck) return;
  editingDeckIndex = index; deckType = deck.type; mainDeck = deck.main; sideboard = deck.side;
  renderViewer(deck); viewer.hidden = false; workspace.hidden = true; document.querySelector("#builder-start").hidden = true;
}

function renderAll() { renderSlots(); renderPicker(); renderSavedDecks(); }
typeButtons.forEach((button) => button.addEventListener("click", () => startBuilder(button.dataset.deckType)));
document.querySelector("#create-deck-button").addEventListener("click", () => { typeChoiceGrid.hidden = false; document.querySelector("#create-deck-button").hidden = true; });
document.querySelector("#new-deck-button").addEventListener("click", () => { editingDeckIndex = null; viewer.hidden = true; workspace.hidden = true; document.querySelector("#builder-start").hidden = false; typeChoiceGrid.hidden = true; document.querySelector("#create-deck-button").hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); });
document.querySelector("#save-deck-button").addEventListener("click", saveDeck);
function removeCard(number, target) { const collection = target === "main" ? mainDeck : sideboard; const index = collection.lastIndexOf(number); if (index >= 0) collection.splice(index, 1); setMessage(""); renderAll(); }
pickerList.addEventListener("click", (event) => { const main = event.target.closest("[data-add-main]"); const side = event.target.closest("[data-add-side]"); const removeMain = event.target.closest("[data-remove-main]"); const removeSide = event.target.closest("[data-remove-side]"); if (main) addCard(main.dataset.addMain, "main"); if (side) addCard(side.dataset.addSide, "side"); if (removeMain) removeCard(removeMain.dataset.removeMain, "main"); if (removeSide) removeCard(removeSide.dataset.removeSide, "side"); });
document.querySelector("#saved-decks-lobby").addEventListener("click", (event) => { const button = event.target.closest("[data-load-deck]"); if (button) loadDeck(Number(button.dataset.loadDeck)); });
document.querySelector("#viewer-edit-button").addEventListener("click", () => { viewer.hidden = true; workspace.hidden = false; document.querySelector("#builder-start").hidden = true; document.querySelector("#declared-type-label").textContent = deckType; document.querySelector("#deck-name-input").value = readSavedDecks()[editingDeckIndex].name; renderAll(); });
document.querySelector("#viewer-return-button").addEventListener("click", () => { viewer.hidden = true; document.querySelector("#builder-start").hidden = false; typeChoiceGrid.hidden = true; document.querySelector("#create-deck-button").hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); });
document.querySelector("#editor-return-button").addEventListener("click", () => { viewer.hidden = true; workspace.hidden = true; document.querySelector("#builder-start").hidden = false; typeChoiceGrid.hidden = true; document.querySelector("#create-deck-button").hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); });
searchInput.addEventListener("input", renderPicker); rarityFilter.addEventListener("change", renderPicker); kindFilter.addEventListener("change", renderPicker);
renderSavedDecks();
