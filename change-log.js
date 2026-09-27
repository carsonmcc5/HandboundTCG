// Change-log data is joined to the current card catalog by card number.
const cards = window.handboundCards;
const changeLog = window.handboundChangeLog;
const imageFolders = { Bug: "PNG - Bug", Beast: "PNG - Beast", Light: "PNG - Light", Dark: "PNG - Dark" };
// Index cards for quick lookup while rendering revisions and dialogs.
const cardByNumber = Object.fromEntries(cards.map((card) => [card.number, card]));
const cardGrid = document.querySelector("#changed-card-grid");
const dialog = document.querySelector("#card-change-dialog");
const dialogContent = document.querySelector("#card-change-content");
const sortSelect = document.querySelector("#change-sort");
const typeFilter = document.querySelector("#change-type-filter");

function getCardImagePath(card) {
  // Build an asset path using the card's primary type folder.
  const folder = imageFolders[card.types[0]];
  const filename = encodeURIComponent(`${card.number} - ${card.image}.png`);
  return `Items/PNGs/${folder}/PNG/${filename}`;
}

function renderRules() {
  // Render the chronological rules timeline from the change-log data.
  document.querySelector("#rules-timeline").innerHTML = changeLog.rules.map((release) => `
    <article class="release-entry">
      <div class="release-version">${release.version}</div>
      <div><h3>${release.title}</h3><p>${release.summary}</p>${release.changes ? `<ul>${release.changes.map((change) => `<li>${change}</li>`).join("")}</ul>` : ""}</div>
    </article>
  `).join("");
}

function renderCards() {
  // Filter by type and order revisions by impact before drawing the card grid.
  const entries = changeLog.cards
    .map((change) => ({ ...change, card: cardByNumber[change.number] }))
    .filter((entry) => entry.card)
    .filter((entry) => typeFilter.value === "all" || entry.card.types.includes(typeFilter.value))
    .sort((first, second) => {
      if (sortSelect.value === "default") return 0;
      const priorities = {
        "new-first": { new: 0, buff: 1, neutral: 2, nerf: 3 },
        "buff-first": { buff: 0, new: 1, neutral: 2, nerf: 3 },
        "nerf-first": { nerf: 0, neutral: 1, new: 2, buff: 3 }
      };
      const priority = priorities[sortSelect.value];
      return priority[first.impact] - priority[second.impact];
    });
  document.querySelector("#changed-card-count").textContent = entries.length;
  // Each card exposes its impact marker, image, and clickable identity.
  cardGrid.innerHTML = entries.map(({ card, impact }) => `
    <button class="changed-card" type="button" data-card-number="${card.number}">
      <span class="changed-card-label"><strong>${card.name}</strong><span class="change-impact impact-${impact}" aria-label="${impact}">${impact === "buff" ? "↑" : impact === "nerf" ? "↓" : impact === "new" ? "NEW" : "~"}</span><small>HB · ${card.number}</small></span>
      <span class="changed-card-art"><img src="${getCardImagePath(card)}" alt="${card.name}" onerror="this.hidden = true; this.nextElementSibling.hidden = false" /><span class="image-coming-soon" hidden>Image coming soon</span></span>
    </button>
  `).join("");
}

sortSelect.addEventListener("change", renderCards);
typeFilter.addEventListener("change", renderCards);

function renderDialog(card, change) {
  // Fill the modal with the selected card's current data and revision note.
  const ability = card.ability.replace(/^AW\s*/, "").trim();
  dialogContent.innerHTML = `
    <div class="change-dialog-art"><img src="${getCardImagePath(card)}" alt="${card.name}" onerror="this.hidden = true; this.nextElementSibling.hidden = false" /><span class="image-coming-soon" hidden>Image coming soon</span></div>
    <div class="change-dialog-copy">
      <p class="eyebrow">Card revision · 0.3.0 to 0.5.0</p>
      <h2>${card.name}</h2>
      <p class="change-dialog-number">HB · ${card.number}</p>
      <div class="change-highlight"><span>Changed</span><mark>${change.note}</mark></div>
      <dl class="change-card-data">
        <div><dt>Type</dt><dd>${card.types.join(" / ")}</dd></div>
        <div><dt>Rarity</dt><dd>${card.rarity}</dd></div>
        <div><dt>Cost</dt><dd>${card.cost}</dd></div>
        ${card.kind === "creature" ? `<div><dt>ATK / DEF</dt><dd>${card.atk} / ${card.def}</dd></div>` : ""}
      </dl>
      ${ability && ability.toLowerCase() !== "n/a" ? `<p class="change-dialog-ability"><b>Ability</b> ${ability}</p>` : ""}
      <p class="change-dialog-flavor">“${card.flavor}”</p>
    </div>
  `;
  dialog.showModal();
}

// Delegate card clicks so dynamically rendered cards open the same dialog.
cardGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-card-number]");
  if (!button) return;
  const card = cardByNumber[button.dataset.cardNumber];
  const change = changeLog.cards.find((entry) => entry.number === card.number);
  renderDialog(card, change);
});
// Support the close button and clicking the dialog backdrop.
dialog.querySelector("[data-close-dialog]").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
// Initial page render.
renderRules();
renderCards();
