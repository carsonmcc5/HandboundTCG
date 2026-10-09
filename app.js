// Shared card data and archive controls drive the searchable card catalog.
const cards = window.handboundCards;

const grid = document.querySelector("#card-grid");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const rarityFilter = document.querySelector("#rarity-filter");
const typeFilter = document.querySelector("#type-filter");
const cardDialog = document.querySelector("#archive-card-dialog");
const cardDialogContent = document.querySelector("#archive-card-detail");
// The kind filter is kept separately because it is represented by buttons.
let activeFilter = "all";

// Populate the summary counts before the first catalog render.
document.querySelector("#all-count").textContent = String(cards.length).padStart(2, "0");
document.querySelector("#creature-count").textContent = String(cards.filter((card) => card.kind === "creature").length).padStart(2, "0");
document.querySelector("#spell-count").textContent = String(cards.filter((card) => card.kind === "spell").length).padStart(2, "0");

function getCardImagePath(card) {
  const imageFolders = { Bug: "PNG - Bug", Beast: "PNG - Beast", Light: "PNG - Light", Dark: "PNG - Dark" };
  const folder = imageFolders[card.types[0]];
  const filename = encodeURIComponent(`${card.number} - ${card.image}.png`);
  return `Items/PNGs/${folder}/PNG/${filename}`;
}

function renderCardMarkup(card, detail = false) {
  const isAtWill = /^AW(?:\s|$)/.test(card.ability.trim());
  const ability = card.ability.replace(/^AW\s*/, "").trim();
  const rarityClass = `rarity-${card.rarity.toLowerCase()}`;
  const typeChips = card.types.map((type) => `<span class="type-chip type-${type.toLowerCase()}">${type}</span>`).join("");
  const hasAbility = ability && ability.toLowerCase() !== "n/a";
  const interaction = detail ? "" : `tabindex="0" role="button" aria-label="Show details for ${card.name}"`;
  return `
    <article class="card-item ${rarityClass}${detail ? " card-detail-item" : ""}" data-card-number="${card.number}" ${interaction}>
      <div class="card-art ${card.color}" data-symbol="${card.symbol}" role="img" aria-label="Card image for ${card.image}">
        <img class="card-image" src="${getCardImagePath(card)}" alt="${card.image}" onerror="this.hidden = true; this.nextElementSibling.hidden = false" />
        <span class="image-coming-soon" hidden>Image coming soon</span>
      </div>
      <div class="card-info">
        <div class="card-header"><h3>${card.name}</h3></div>
        <div class="card-subheader"><span class="card-type">${card.kind}</span><span class="card-rarity ${rarityClass}">${card.rarity}</span><span class="card-number">${card.number}</span></div>
        <div class="card-stats-line"><span class="card-cost" aria-label="Cost ${card.cost}">COST <b>${card.cost}</b></span><span class="card-types">${typeChips}</span>${card.kind === "creature" ? `<dl class="card-stats"><div><dt>ATK</dt><dd>${card.atk}</dd></div><div><dt>DEF</dt><dd>${card.def}</dd></div></dl>` : ""}${isAtWill ? `<span class="at-will">At Will</span>` : ""}</div>
        <div class="card-text">${hasAbility ? `<p class="card-ability"><b>Ability</b> ${ability}</p>` : ""}<p class="card-flavor">${card.flavor}</p></div>
      </div>
    </article>
  `;
}

function renderCards() {
  // Apply the active filters and sort choice before rebuilding the card grid.
  const query = searchInput.value.trim().toLowerCase();
  const visibleCards = cards
    .filter((card) => activeFilter === "all" || card.kind === activeFilter)
    .filter((card) => rarityFilter.value === "all" || card.rarity === rarityFilter.value)
    .filter((card) => typeFilter.value === "all" || card.types.includes(typeFilter.value))
    .filter((card) => [card.name, card.number].some((value) => value.toLowerCase().includes(query)))
    .sort((first, second) => {
      const [field, direction] = sortSelect.value.split("-");
      if (field === "number") return first.number.localeCompare(second.number);
      const firstValue = first[field] ?? -1;
      const secondValue = second[field] ?? -1;
      return (firstValue - secondValue) * (direction === "desc" ? -1 : 1) || first.number.localeCompare(second.number);
    });

  resultCount.textContent = String(visibleCards.length).padStart(2, "0");
  grid.innerHTML = visibleCards.map((card) => renderCardMarkup(card)).join("");
  emptyState.hidden = visibleCards.length !== 0;
}

function openCardDetail(cardNumber, point) {
  const card = cards.find((entry) => entry.number === cardNumber);
  if (!card) return;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  cardDialogContent.innerHTML = renderCardMarkup(card, true);
  cardDialog.showModal();
  requestAnimationFrame(() => {
    const dialogRect = cardDialog.getBoundingClientRect();
    const anchorX = point?.x ?? window.innerWidth / 2;
    const anchorY = point?.y ?? window.innerHeight / 2;
    const left = Math.max(16, Math.min(window.innerWidth - dialogRect.width - 16, anchorX - dialogRect.width / 2));
    const top = Math.max(16, Math.min(window.innerHeight - dialogRect.height - 16, anchorY - dialogRect.height / 2));
    cardDialog.style.left = `${left}px`;
    cardDialog.style.top = `${top}px`;
    window.scrollTo(scrollX, scrollY);
  });
}

grid.addEventListener("click", (event) => {
  const article = event.target.closest("[data-card-number]");
  if (article) openCardDetail(article.dataset.cardNumber, { x: event.clientX, y: event.clientY });
});
grid.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const article = event.target.closest("[data-card-number]");
  if (!article) return;
  event.preventDefault();
  const rect = article.getBoundingClientRect();
  openCardDetail(article.dataset.cardNumber, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
});
cardDialog.querySelector(".archive-card-close").addEventListener("click", () => cardDialog.close());
cardDialog.addEventListener("click", (event) => { if (event.target === cardDialog) cardDialog.close(); });
cardDialog.addEventListener("close", () => { cardDialog.style.left = ""; cardDialog.style.top = ""; });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cardDialog.open) cardDialog.close();
});

// Re-render when the kind filter changes.
document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".filter-button.active").classList.remove("active");
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    renderCards();
  });
});

// Search, select filters, and keyboard shortcut all share the same renderer.
searchInput.addEventListener("input", renderCards);
sortSelect.addEventListener("change", renderCards);
rarityFilter.addEventListener("change", renderCards);
typeFilter.addEventListener("change", renderCards);
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
});
renderCards();
