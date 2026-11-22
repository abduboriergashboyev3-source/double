
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  try {
    tg.setHeaderColor("#090d22");
    tg.setBackgroundColor("#090d22");
  } catch (e) {}
}

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

let balance = 0;
let selectedMethod = "Telegram Stars";
let currentCategory = "";
let selectedPackage = "";

const packages = {
  "Telegram Stars": ["50 ⭐", "100 ⭐", "250 ⭐", "500 ⭐", "1000 ⭐", "2500 ⭐"],
  "Telegram Premium": ["3 oy", "6 oy", "12 oy"],
  "Virtual raqamlar": ["1 ta raqam", "2 ta raqam", "5 ta raqam"],
  "Telegram Gifts": ["Oddiy sovg‘a", "Premium sovg‘a", "Maxsus sovg‘a"],
  "PUBG Mobile": ["60 UC", "325 UC", "660 UC", "1800 UC", "3850 UC", "8100 UC"],
  "Free Fire": ["100 Diamond", "310 Diamond", "520 Diamond", "1060 Diamond"],
  "Mobile Legends": ["86 Diamond", "172 Diamond", "257 Diamond", "706 Diamond"],
  "Roblox": ["400 Robux", "800 Robux", "1700 Robux", "4500 Robux"],
  "Steam": ["$5", "$10", "$20", "$50"],
  "Minecraft": ["Minecoin", "Gift Card", "Boshqa xizmat"]
};

const symbols = {
  "Telegram Stars": "⭐",
  "Telegram Premium": "♛",
  "Virtual raqamlar": "▣",
  "Telegram Gifts": "🎁",
  "PUBG Mobile": "🎮",
  "Free Fire": "🔥",
  "Mobile Legends": "⚔",
  "Roblox": "R",
  "Steam": "S",
  "Minecraft": "⛏"
};

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 2600);
}

function showPage(id) {
  $$(".page").forEach(page => {
    page.classList.toggle("active", page.id === id);
  });

  $$(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === id);
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  updateBalances();
}

function updateBalances() {
  const formatted = balance.toLocaleString("uz-UZ");

  ["#balance", "#profileBalance", "#topupBalance"].forEach(selector => {
    const element = $(selector);
    if (element) element.textContent = formatted;
  });
}

// Sahifalar o‘rtasida o'tish
$$("[data-page]").forEach(btn => {
  btn.addEventListener("click", () => {
    showPage(btn.dataset.page);
  });
});

// Xizmat oynasini ochish
function openCategory(name) {
  currentCategory = name;
  selectedPackage = "";

  $("#modalSymbol").textContent = symbols[name] || "✦";
  $("#modalTitle").textContent = name;

  $("#modalDescription").textContent =
    name === "Telegram Stars"
      ? "Yulduzlar sonini tanlang."
      : "Kerakli paketni tanlang.";

  $("#userFieldLabel").textContent =
    name === "Telegram Stars" ||
    name === "Telegram Premium" ||
    name === "Telegram Gifts"
      ? "Telegram username"
      : "Player ID / kerakli ma’lumot";

  $("#targetInput").placeholder =
    ["PUBG Mobile", "Free Fire", "Mobile Legends"].includes(name)
      ? "Player ID"
      : "@username";

  const grid = $("#packageGrid");
  grid.innerHTML = "";

  (packages[name] || ["Standart", "Premium"]).forEach(item => {
    const button = document.createElement("button");

    button.className = "package";
    button.textContent = item;

    button.addEventListener("click", () => {
      $$(".package", grid).forEach(el => {
        el.classList.remove("selected");
      });

      button.classList.add("selected");
      selectedPackage = item;

      $("#estimatedPrice").textContent =
        "Narx serverdan olinadi";
    });

    grid.appendChild(button);
  });

  $("#estimatedPrice").textContent =
    "Narx backendda belgilanadi";

  $("#modalBackdrop").classList.add("show");

  if (tg?.HapticFeedback) {
    tg.HapticFeedback.impactOccurred("light");
  }
}

// Katalog tugmalari
$$("[data-category]").forEach(button => {
  button.addEventListener("click", () => {
    openCategory(button.dataset.category);
  });
});

// Modalni yopish
$("#modalClose").addEventListener("click", () => {
  $("#modalBackdrop").classList.remove("show");
});

$("#modalBackdrop").addEventListener("click", event => {
  if (event.target.id === "modalBackdrop") {
    event.currentTarget.classList.remove("show");
  }
});

// Buyurtma berish
$("#orderSubmit").addEventListener("click", () => {
  const target = $("#targetInput").value.trim();

  if (!target) {
    toast("Iltimos, username yoki ID kiriting.");
    return;
  }

  if (!selectedPackage) {
    toast("Avval paketni tanlang.");
    return;
  }

  toast(
    "Demo rejim: buyurtma yuborilmadi. Backend ulanishi kerak."
  );
});

// Balans summasini tanlash
$$("[data-amount]").forEach(button => {
  button.addEventListener("click", () => {
    $("#topupAmount").value = button.dataset.amount;
  });
});

// To‘lov usulini tanlash
$$(".payment-option").forEach(button => {
  button.addEventListener("click", () => {
    $$(".payment-option").forEach(el => {
      el.classList.remove("selected");
    });

    button.classList.add("selected");
    selectedMethod = button.dataset.method;
  });
});

// Balans to‘ldirish
$("#topupSubmit").addEventListener("click", () => {
  const amount = Number($("#topupAmount").value);

  if (!Number.isFinite(amount) || amount < 5000) {
    toast("Minimal summa 5 000 so‘m.");
    return;
  }

  toast(
    selectedMethod +
    " to‘lovi uchun backend integratsiyasi kerak. Hozircha demo."
  );
});

// Xizmatlarni qidirish
$("#searchInput").addEventListener("input", event => {
  const query = event.target.value.toLowerCase().trim();

  $$(".category-card, .game-card").forEach(card => {
    card.style.display =
      card.dataset.category.toLowerCase().includes(query)
        ? ""
        : "none";
  });
});

// Profil menyusi
$("#promoBtn").addEventListener("click", () => {
  toast("Promokod funksiyasi keyingi bosqichda ulanadi.");
});

$("#helpBtn").addEventListener("click", () => {
  toast("Yordam: bot administratoriga murojaat qiling.");
});

$("#noticeBtn").addEventListener("click", () => {
  toast("Hozircha yangi bildirishnomalar yo‘q.");
});

$("#adminBtn").addEventListener("click", () => {
  toast(
    "Admin panel uchun serverda admin huquqi tekshirilishi kerak."
  );
});

// Telegram foydalanuvchi ma'lumotlari
if (tg?.initDataUnsafe?.user) {
  const user = tg.initDataUnsafe.user;

  const name =
    [user.first_name, user.last_name]
      .filter(Boolean)
      .join(" ") || "Telegram foydalanuvchisi";

  $("#profileName").textContent = name;

  $("#profileHandle").textContent =
    user.username
      ? "@" + user.username
      : "Telegram foydalanuvchisi";

  $("#avatar").textContent =
    (user.first_name || "D").charAt(0).toUpperCase();
}

// Boshlang‘ich balans
updateBalances();
