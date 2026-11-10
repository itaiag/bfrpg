// Fill-in fields for the printable sheets: character name, player, race, description and ability scores
// (the bonus is computed). Everything is saved in this browser only.
// Same script as rc-sheets/sheet.js; the storage prefix differs because both sites share the
// itaiag.github.io origin and have sheets with the same file names.
(() => {
  const KEY = "bfrpg-sheets:" + (location.pathname.split("/").pop() || "sheet");
  let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { data = {}; }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  };

  // Ability bonus table, he/abilities.qmd (3: −3, 4–5: −2, 6–8: −1, 9–12: 0, 13–15: +1, 16–17: +2, 18: +3).
  const bonus = (v) => {
    if (!/^\d+$/.test(v)) return "";
    const n = +v;
    if (n < 3 || n > 18) return "";
    const b = n <= 3 ? -3 : n <= 5 ? -2 : n <= 8 ? -1 : n <= 12 ? 0 : n <= 15 ? 1 : n <= 17 ? 2 : 3;
    return b > 0 ? "+" + b : b < 0 ? "−" + -b : "0";
  };
  const showBonus = (el) => {
    const out = document.querySelector(`[data-mod="${el.dataset.ab}"]`);
    if (out) out.textContent = bonus(el.value);
  };

  const fields = document.querySelectorAll("[data-key]");
  fields.forEach((el) => {
    if (data[el.dataset.key] != null) el.value = data[el.dataset.key];
    if (el.dataset.ab != null) showBonus(el);
    el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
      if (el.dataset.ab != null) {
        el.value = el.value.replace(/\D/g, "").slice(0, 2);
        showBonus(el);
      }
      data[el.dataset.key] = el.value;
      save();
    });
  });

  const file = document.querySelector("[data-portrait]");
  const img = document.querySelector("[data-portrait-img]");
  const clear = document.querySelector("[data-portrait-clear]");
  const box = img && img.closest(".portrait");
  const showImg = (src) => {
    img.hidden = !src;
    clear.hidden = !src;
    if (src) img.src = src; else img.removeAttribute("src");
    box.classList.toggle("has-img", !!src);
  };
  if (img) {
    showImg(data.portrait || "");
    file.addEventListener("change", () => {
      const f = file.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      const pic = new Image();
      pic.onload = () => {
        // Shrink big photos so they fit in browser storage; 900px is plenty for a 3cm box.
        const scale = Math.min(1, 900 / Math.max(pic.width, pic.height));
        const c = document.createElement("canvas");
        c.width = Math.round(pic.width * scale);
        c.height = Math.round(pic.height * scale);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(pic, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const src = c.toDataURL("image/jpeg", 0.85);
        data.portrait = src;
        if (!save()) { delete data.portrait; save(); }
        showImg(src);
        file.value = "";
      };
      pic.src = url;
    });
    clear.addEventListener("click", () => { delete data.portrait; save(); showImg(""); });
  }

  const all = document.querySelector("[data-clear-all]");
  if (all) all.addEventListener("click", () => {
    if (!confirm("למחוק את כל מה שהוקלד בדף?")) return;
    data = {};
    save();
    fields.forEach((el) => { el.value = ""; if (el.dataset.ab != null) showBonus(el); });
    if (img) showImg("");
  });
})();
