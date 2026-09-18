const cards = window.handboundCards;

const grid = document.querySelector("#card-grid");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const rarityFilter = document.querySelector("#rarity-filter");
const typeFilter = document.querySelector("#type-filter");
let activeFilter = "all";

document.querySelector("#all-count").textContent = String(cards.length).padStart(2, "0");
document.querySelector("#creature-count").textContent = String(cards.filter((card) => card.kind === "creature").length).padStart(2, "0");
document.querySelector("#spell-count").textContent = String(cards.filter((card) => card.kind === "spell").length).padStart(2, "0");

function renderCards() {
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
  grid.innerHTML = visibleCards.map((card) => {
    const isAtWill = /^AW(?:\s|$)/.test(card.ability.trim());
    const ability = card.ability.replace(/^AW\s*/, "").trim();
    const rarityClass = `rarity-${card.rarity.toLowerCase()}`;
    const typeChips = card.types.map((type) => `<span class="type-chip type-${type.toLowerCase()}">${type}</span>`).join("");
    const hasAbility = ability && ability.toLowerCase() !== "n/a";

    return `
    <article class="card-item ${rarityClass}">
      <div class="card-art ${card.color}" data-symbol="${card.symbol}" role="img" aria-label="Card image for ${card.image}">
      </div>
      <div class="card-info">
        <div class="card-header"><h3>${card.name}</h3></div>
        <div class="card-subheader"><span class="card-type">${card.kind}</span><span class="card-number">HB · ${card.number}</span></div>
        <div class="card-stats-line"><span class="card-cost" aria-label="Cost ${card.cost}">COST <b>${card.cost}</b></span>${card.kind === "creature" ? `<dl class="card-stats"><div><dt>ATK</dt><dd>${card.atk}</dd></div><div><dt>DEF</dt><dd>${card.def}</dd></div></dl>` : ""}${isAtWill ? `<span class="at-will">At Will</span>` : ""}</div>
        <div class="card-meta"><span class="card-rarity ${rarityClass}">${card.rarity}</span><span class="card-types">${typeChips}</span></div>
        <div class="card-text">${hasAbility ? `<p class="card-ability"><b>Ability</b> ${ability}</p>` : ""}<p class="card-flavor">“${card.flavor}”</p></div>
      </div>
    </article>
  `; }).join("");

  emptyState.hidden = visibleCards.length !== 0;
}

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".filter-button.active").classList.remove("active");
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    renderCards();
  });
});

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
