(function () {
  "use strict";

  const API = window.ELVEN_API_BASE;
  const LS_CODE = "elven_access_code";
  const LS_ROLE = "elven_role";
  const LS_NAME = "elven_name";

  let state = {
    code: localStorage.getItem(LS_CODE) || "",
    role: localStorage.getItem(LS_ROLE) || "",
    name: localStorage.getItem(LS_NAME) || "",
    books: [],
    genres: [],
    activeGenre: "",
    search: "",
  };

  // ---------- tiny helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  function openModal(id) { show($("#" + id)); }
  function closeModal(id) { hide($("#" + id)); }

  $$("[data-close]").forEach((btn) =>
    btn.addEventListener("click", () => closeModal(btn.dataset.close))
  );
  $$(".modal-overlay").forEach((overlay) =>
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.hidden = true;
    })
  );

  async function api(path, opts) {
    opts = opts || {};
    const headers = opts.headers || {};
    const res = await fetch(API + path, { ...opts, headers });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON (file streams) */ }
    if (!res.ok) {
      const message = (data && data.error) || `Erreur ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  // ---------- decoy: sign-up ----------
  $("#signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const status = $("#signup-status");
    status.textContent = "Envoi…";
    const body = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      message: form.message.value.trim(),
    };
    try {
      await api("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      status.textContent = "Merci ! Nous revenons vers vous très vite.";
      form.reset();
    } catch (err) {
      status.textContent = "Une erreur est survenue, réessayez plus tard.";
    }
  });

  // ---------- decoy: "espace client" -> unlock ----------
  $("#open-unlock").addEventListener("click", () => openModal("unlock-modal"));

  $("#unlock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = e.target.code.value.trim();
    const status = $("#unlock-status");
    status.textContent = "Vérification…";
    try {
      const data = await api("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      persistSession(code, data.role, data.name);
      closeModal("unlock-modal");
      enterLibrary();
    } catch (err) {
      status.textContent = "Code invalide.";
    }
  });

  function persistSession(code, role, name) {
    state.code = code;
    state.role = role;
    state.name = name;
    localStorage.setItem(LS_CODE, code);
    localStorage.setItem(LS_ROLE, role || "");
    localStorage.setItem(LS_NAME, name || "");
  }

  function clearSession() {
    state.code = ""; state.role = ""; state.name = "";
    localStorage.removeItem(LS_CODE);
    localStorage.removeItem(LS_ROLE);
    localStorage.removeItem(LS_NAME);
  }

  // ---------- switching screens ----------
  async function enterLibrary() {
    hide($("#decoy"));
    show($("#app"));
    $("#e-welcome").textContent = state.name ? `Bienvenue, ${state.name}` : "";
    $("#e-add-book-btn").hidden = state.role !== "admin";
    // The oath is sworn anew every time the library is entered.
    show($("#e-oath"));
    hide($("#e-library-content"));
  }

  $("#e-oath-btn").addEventListener("click", async () => {
    const oath = $("#e-oath");
    oath.classList.add("leaving");
    setTimeout(() => {
      hide(oath);
      oath.classList.remove("leaving");
      show($("#e-library-content"));
    }, 500);
    await loadBooks();
  });

  function leaveLibrary() {
    clearSession();
    hide($("#app"));
    show($("#decoy"));
  }
  $("#e-logout").addEventListener("click", leaveLibrary);

  // ---------- library data ----------
  async function loadBooks() {
    const params = new URLSearchParams({ code: state.code });
    if (state.activeGenre) params.set("genre", state.activeGenre);
    try {
      const data = await api("/api/books?" + params.toString(), {
        headers: { "x-access-code": state.code },
      });
      state.books = data.books || [];
      state.genres = data.genres || [];
      renderGenres();
      renderGrid();
      fillGenreSuggestions();
    } catch (err) {
      if (String(err.message).includes("401")) leaveLibrary();
    }
  }

  function renderGenres() {
    const nav = $("#e-genre-list");
    nav.innerHTML = "";
    const allBtn = document.createElement("button");
    allBtn.className = "e-genre" + (state.activeGenre === "" ? " active" : "");
    allBtn.textContent = "Tous les livres";
    allBtn.addEventListener("click", () => { state.activeGenre = ""; loadBooks(); });
    nav.appendChild(allBtn);

    state.genres.forEach((g) => {
      const btn = document.createElement("button");
      btn.className = "e-genre" + (state.activeGenre === g ? " active" : "");
      btn.textContent = g;
      btn.addEventListener("click", () => { state.activeGenre = g; loadBooks(); });
      nav.appendChild(btn);
    });
  }

  function fillGenreSuggestions() {
    const dl = $("#genre-suggestions");
    if (!dl) return;
    dl.innerHTML = state.genres.map((g) => `<option value="${escapeHtml(g)}">`).join("");
  }

  function matchesSearch(book, q) {
    if (!q) return true;
    const hay = [book.title, book.author, ...(book.tags || [])].join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function renderGrid() {
    const grid = $("#e-grid");
    const items = state.books.filter((b) => matchesSearch(b, state.search));
    grid.innerHTML = "";
    $("#e-empty").hidden = items.length !== 0;

    items.forEach((book, i) => {
      const card = document.createElement("button");
      card.className = "e-card";
      card.type = "button";
      card.style.setProperty("--i", i);
      card.innerHTML = `
        <div class="e-card-cover">${book.cover_url ? `<img loading="lazy" src="${API}${book.cover_url}" alt="Couverture de ${escapeHtml(book.title)}" />` : ""}</div>
        <div class="e-card-title">${escapeHtml(book.title)}</div>
        <div class="e-card-author">${escapeHtml(book.author || "")}</div>
      `;
      card.addEventListener("click", () => openBook(book.id));
      grid.appendChild(card);
    });
  }

  $("#e-search").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderGrid();
  });

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ---------- book detail ----------
  async function openBook(id) {
    try {
      const data = await api(`/api/book/${encodeURIComponent(id)}?code=${encodeURIComponent(state.code)}`, {
        headers: { "x-access-code": state.code },
      });
      const b = data.book;
      $("#bm-cover").src = b.cover_url ? API + b.cover_url : "";
      $("#bm-cover").alt = "Couverture de " + b.title;
      $("#bm-title").textContent = b.title;
      $("#bm-author").textContent = b.author || "";
      $("#bm-date").textContent = b.release_date || "Date inconnue";
      $("#bm-genre").textContent = b.genre || "";
      $("#bm-summary").textContent = b.summary || "Pas de résumé pour ce livre.";
      const extractEl = $("#bm-extract");
      const extractTitle = $("#bm-extract-title");
      if (b.extract) { extractEl.textContent = b.extract; extractTitle.hidden = false; extractEl.hidden = false; }
      else { extractEl.hidden = true; extractTitle.hidden = true; }
      $("#bm-tags").innerHTML = (b.tags || []).map((t) => `<span>${escapeHtml(t)}</span>`).join("");
      const dl = $("#bm-download");
      if (b.download_url) { dl.href = API + b.download_url; dl.hidden = false; }
      else { dl.hidden = true; }
      openModal("book-modal");
    } catch (err) {
      alert("Impossible d'ouvrir ce livre : " + err.message);
    }
  }

  // ---------- admin: add book ----------
  $("#e-add-book-btn").addEventListener("click", () => openModal("add-book-modal"));

  $("#add-book-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const status = $("#add-book-status");
    status.textContent = "Envoi en cours…";
    try {
      const res = await fetch(API + "/api/admin/add-book", {
        method: "POST",
        headers: { "x-access-code": state.code },
        body: new FormData(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      status.textContent = "Livre ajouté !";
      form.reset();
      await loadBooks();
      setTimeout(() => closeModal("add-book-modal"), 800);
    } catch (err) {
      status.textContent = "Erreur : " + err.message;
    }
  });

  // ---------- boot ----------
  async function boot() {
    if (!state.code) return; // stay on the decoy page
    try {
      const data = await api("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: state.code }),
      });
      persistSession(state.code, data.role, data.name);
      await enterLibrary();
    } catch {
      clearSession();
    }
  }

  boot();
})();
