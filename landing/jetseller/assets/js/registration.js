(() => {
  "use strict";
  const form = document.getElementById("seller-registration");
  if (!form) return;
  const byId = id => document.getElementById(id);
  const panels = [...form.querySelectorAll("[data-panel]")];
  const steps = [...document.querySelectorAll("[data-step]")];
  const accountFields = ["owner", "email", "phone", "password", "confirm", "consent"];
  const storeFields = ["brand", "slug"];
  const reserved = new Set(["dashboard", "www", "api", "admin", "support", "mail", "static", "assets", "masuk", "daftar", "jetseller"]);
  let step = 1, furthest = 1, slugEdited = false, fixture = "", timer = null;
  const localDemo = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) &&
    new URLSearchParams(location.search).get("preview") === "1";
  const phoneValid = value => {
    const compact = value.trim().replace(/[\s().-]/g, "");
    return /^(?:\+62|62|0)8[1-9][0-9]{6,10}$/.test(compact);
  };
  const slugify = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "");
  function errorFor(id) {
    const el = byId(id), value = el.value;
    if (id === "consent") return el.checked ? "" : "Centang persetujuan untuk melanjutkan pratinjau.";
    if (!value.trim()) return "Kolom ini wajib diisi.";
    if (id === "owner" && value.trim().length < 2) return "Masukkan nama pemilik minimal 2 karakter.";
    if (id === "email" && (!el.validity.valid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())))
      return "Masukkan alamat email yang valid, misalnya nama@contoh.id.";
    if (id === "phone" && !phoneValid(value)) return "Gunakan nomor Indonesia yang valid, misalnya 081234567890.";
    if (id === "password" && (value.length < 8 || !/[A-Za-z]/.test(value) || !/[0-9]/.test(value)))
      return "Gunakan minimal 8 karakter, termasuk huruf dan angka.";
    if (id === "confirm" && value !== byId("password").value) return "Password belum sama. Periksa kembali konfirmasinya.";
    if (id === "brand" && value.trim().length < 2) return "Nama toko minimal 2 karakter.";
    if (id === "slug") {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length < 3 || value.length > 48)
        return "Gunakan 3–48 huruf kecil, angka, atau tanda hubung di tengah.";
      if (reserved.has(value)) return "Nama ini digunakan platform. Pilih slug toko lain.";
    }
    return "";
  }
  function showError(id) {
    const message = errorFor(id);
    byId(id).setAttribute("aria-invalid", String(Boolean(message)));
    byId(id + "-error").textContent = message;
    byId(id + "-error").hidden = !message;
    return !message;
  }
  function validate(ids) {
    const invalid = ids.filter(id => !showError(id));
    if (invalid.length) {
      byId("form-feedback").textContent = "Periksa " + invalid.length + " kolom yang ditandai.";
      byId(invalid[0]).focus();
      return false;
    }
    byId("form-feedback").textContent = "";
    return true;
  }
  function updateSlugPreview() {
    // textContent only: store names and slugs are never interpreted as markup.
    byId("slug-preview").textContent = byId("slug").value || "namatoko";
  }
  function showStep(next, focus = true) {
    step = next;
    panels.forEach(panel => { panel.hidden = Number(panel.dataset.panel) !== step; });
    steps.forEach(button => {
      const number = Number(button.dataset.step);
      button.disabled = number > furthest || number === 4 && !fixture;
      button.classList.toggle("is-complete", number < step);
      if (number === step) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    byId("previous").hidden = step === 1;
    byId("next").hidden = step > 2;
    byId("next").textContent = step === 2 ? "Lanjutkan ke verifikasi" : "Lanjutkan →";
    byId("form-feedback").textContent = "";
    if (focus) panels[step - 1].querySelector("h2").focus();
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (step === 1 && validate(accountFields)) {
      byId("email").value = byId("email").value.trim().toLowerCase();
      furthest = Math.max(furthest, 2); showStep(2);
    } else if (step === 2 && validate(storeFields)) {
      // This advances to a pending screen only: no OTP request or signup.
      furthest = Math.max(furthest, 3); showStep(3);
    }
  });
  byId("previous").addEventListener("click", () => showStep(Math.max(1, step - 1)));
  steps.forEach(button => button.addEventListener("click", () => {
    const target = Number(button.dataset.step);
    if (target > furthest || target === 4 && !fixture) return;
    // Forward navigation revalidates edited earlier steps.
    if (target > 1 && !validate(accountFields)) { showStep(1, false); validate(accountFields); return; }
    if (target > 2 && !validate(storeFields)) { showStep(2, false); validate(storeFields); return; }
    showStep(target);
  }));
  [...accountFields, ...storeFields].forEach(id => {
    const el = byId(id);
    // Validate on submit, then while correcting a flagged field. Adding errors
    // on blur can shift a control beneath the pointer before its click lands.
    el.addEventListener(id === "consent" ? "change" : "input", () => {
      if (el.getAttribute("aria-invalid") === "true") showError(id);
      if (id === "password") {
        const meets = !errorFor(id);
        byId("password-hint").textContent = meets ? "Persyaratan password terpenuhi." : "Minimal 8 karakter, dengan huruf dan angka.";
        byId("password-hint").classList.toggle("is-met", meets);
        if (byId("confirm").value) showError("confirm");
      }
    });
  });
  byId("brand").addEventListener("input", () => {
    if (!slugEdited) { byId("slug").value = slugify(byId("brand").value); updateSlugPreview(); }
  });
  byId("slug").addEventListener("input", () => { slugEdited = true; updateSlugPreview(); });
  document.querySelectorAll("[data-reveal]").forEach(button => button.addEventListener("click", () => {
    const el = byId(button.dataset.reveal);
    const reveal = el.type === "password";
    el.type = reveal ? "text" : "password";
    button.setAttribute("aria-pressed", String(reveal));
    const label = button.dataset.reveal === "confirm" ? "konfirmasi password" : "password";
    button.setAttribute("aria-label", (reveal ? "Sembunyikan " : "Tampilkan ") + label);
  }));
  byId("otp").addEventListener("input", event => {
    event.target.value = event.target.value.replace(/[^0-9]/g, "").slice(0, 6);
  });
  byId("otp").addEventListener("paste", event => {
    event.preventDefault();
    byId("otp").value = (event.clipboardData?.getData("text") || "").replace(/[^0-9]/g, "").slice(0, 6);
  });
  function clearSensitive() {
    for (const id of ["password", "confirm", "otp"]) { byId(id).value = ""; }
    for (const id of ["password", "confirm"]) byId(id).type = "password";
    document.querySelectorAll("[data-reveal]").forEach(button => {
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", "Tampilkan " + (button.dataset.reveal === "confirm" ? "konfirmasi password" : "password"));
    });
    clearInterval(timer);
  }
  window.addEventListener("pagehide", clearSensitive);
  window.addEventListener("pageshow", event => {
    if (event.persisted) { clearSensitive(); showStep(1); }
  });

  function renderFixture(state) {
    if (!localDemo) return;
    clearInterval(timer); fixture = state; byId("otp").value = "";
    byId("fixture-note").textContent = state ? "Simulasi antarmuka — belum membuat akun/toko. Tidak ada proses server." : "";
    if (!state) {
      furthest = 1; byId("otp").disabled = true; byId("resend").disabled = true;
      byId("otp-error").hidden = true; byId("otp-timer").textContent = "Timer belum dimulai";
      byId("otp").setAttribute("aria-invalid", "false");
      byId("verify").textContent = "Verifikasi belum tersedia";
      byId("resend").textContent = "Kirim ulang kode";
      byId("backend-notice").innerHTML = "<strong>Verifikasi email belum aktif.</strong><p>Verifikasi email akan tersedia setelah sistem pendaftaran diaktifkan. Tidak ada kode yang dikirim.</p>";
      showStep(1); return;
    }
    furthest = state.startsWith("otp-") ? 3 : 4;
    if (state.startsWith("otp-")) {
      showStep(3);
      byId("backend-notice").innerHTML = "<strong>Simulasi antarmuka — belum membuat akun/toko</strong><p>Contoh tampilan verifikasi. Tidak ada email dikirim atau kode yang dapat diverifikasi.</p>";
      byId("otp").disabled = ["otp-expired", "otp-loading", "otp-resend"].includes(state);
      byId("verify").textContent = state === "otp-loading" ? "Simulasi: memeriksa kode…" : "Verifikasi belum tersedia";
      byId("resend").disabled = state !== "otp-expired";
      byId("resend").textContent = state === "otp-resend" ? "Simulasi: menunggu pengiriman…" : "Kirim ulang kode";
      byId("otp-timer").textContent = state === "otp-expired" ? "Contoh: kode kedaluwarsa" : "Timer contoh · 01:30";
      const message = state === "otp-invalid" ? "Contoh error: kode tidak sesuai. Periksa enam digit kode kamu." :
        state === "otp-expired" ? "Contoh error: kode kedaluwarsa. Minta kode baru saat layanan aktif." : "";
      byId("otp-error").textContent = message; byId("otp-error").hidden = !message;
      byId("otp").setAttribute("aria-invalid", String(Boolean(message)));
      if (state === "otp-waiting") {
        const expires = Date.now() + 90000;
        timer = setInterval(() => {
          const seconds = Math.max(0, Math.ceil((expires - Date.now()) / 1000));
          byId("otp-timer").textContent = "Timer contoh · " + String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
          if (!seconds) { byId("preview-state").value = "otp-expired"; renderFixture("otp-expired"); }
        }, 1000);
      }
    } else {
      showStep(4);
      const success = state === "provision-success", failed = state === "provision-error";
      byId("provision-status").replaceChildren();
      if (!success && !failed) {
        const spinner = document.createElement("span"); spinner.className = "reg-spinner"; spinner.setAttribute("aria-hidden", "true");
        byId("provision-status").append(spinner);
      }
      const title = document.createElement("strong");
      title.textContent = success ? "Contoh tampilan selesai — toko belum dibuat" : failed ? "Contoh gagal: penyiapan belum selesai" : "Simulasi: menyiapkan toko";
      byId("provision-status").append(title);
      byId("provision-description").textContent = success ? "Ini contoh tampilan sukses untuk review UI. Akun, toko, dashboard, dan alamat belum dibuat." :
        failed ? "Contoh gangguan saat menyiapkan dashboard. Tidak ada operasi nyata. Coba ulangi simulasi tampilan." :
        "Contoh tampilan proses. Tidak ada storefront atau dashboard yang sedang dibuat.";
      const progress = success ? 100 : 50;
      const bar = document.querySelector(".reg-progress");
      bar.setAttribute("aria-valuenow", String(progress)); bar.firstElementChild.style.width = progress + "%";
      document.querySelectorAll("[data-provision]").forEach((row, i) => {
        row.querySelector("small").textContent = success || i < 2 ? "Contoh selesai (simulasi)" :
          failed && i === 2 ? "Contoh gagal — perlu dicoba ulang" : "Contoh tahap — belum dijalankan";
      });
      byId("retry-preview").hidden = !failed;
    }
  }
  byId("resend").addEventListener("click", () => {
    if (localDemo) { byId("preview-state").value = "otp-resend"; renderFixture("otp-resend"); }
  });
  byId("retry-preview").addEventListener("click", () => {
    if (localDemo) { byId("preview-state").value = "provision-loading"; renderFixture("provision-loading"); }
  });
  if (localDemo) {
    byId("local-preview").hidden = false;
    byId("preview-state").addEventListener("change", event => renderFixture(event.target.value));
  }
  // Enable only after submit prevention and all event handlers are installed.
  byId("registration-fields").disabled = false;
  showStep(1, false);
})();
