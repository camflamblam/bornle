// CONFIG — your sheet details
const SHEET_ID   = '180LA6R_gcH-5VOgibikuolK7PiuzPtNE48sCLpvGuvc';
const SHEET_NAME = 'people';
const SHEET_URL  = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_NAME}`;

// -------- Globals --------
let peopleData         = [];
let byYear             = {};
let allYears           = [];
let currentSuggestPool = [];
let todaysYear         = null;
let validAnswers       = [];
let guessHistory       = [];
const MAX_GUESSES      = 5;
let gameOver           = false;

// Utility to avoid null.style crashes
function hideEl(id){ const el = document.getElementById(id); if(el) el.style.display='none'; }
function showEl(id, disp='block'){ const el = document.getElementById(id); if(el) el.style.display=disp; }

// -------- Utilities --------
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function toNum(y){
  return Number(String(y).replace(/[^\d-]/g,'').replace(/^-+/, '-'));
}

// Period definitions
const PERIODS = {
  daily:        { label: "Daily (randomized)",               start: -Infinity, end:  Infinity },
  ancient:      { label: "Ancient History (800 BCE–499 CE)",  start: -800,     end:  499 },
  medieval:     { label: "Medieval (500–1499)",               start: 500,      end: 1499 },
  early_modern: { label: "Early Modern (1500–1799)",          start: 1500,     end: 1799 },
  nineteenth:   { label: "19th Century (1800–1899)",          start: 1800,     end: 1899 },
  twentieth:    { label: "20th Century (1900–1999)",          start: 1900,     end: 1999 },
  all:          { label: "All Years",                         start: -Infinity, end:  Infinity }
};

// Cache (skip if quota exceeded)
const CACHE_KEY = 'people_v5';

async function loadPeople() {
  if (window.__PEOPLE__) return window.__PEOPLE__;

  const cached = sessionStorage.getItem(CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached);
    window.__PEOPLE__ = parsed;
    return parsed;
  }

  const res  = await fetch(SHEET_URL);
  const data = await res.json();

  // Trim to needed fields
  const clean = data
    .filter(r => r.name && r.birthyear)
    .map(({ name, birthyear, aliases, wikiurl }) => ({
      name, birthyear, aliases, wikiurl
    }));

  window.__PEOPLE__ = clean;

  try {
    const json = JSON.stringify(clean);
    if (json.length < 4.5e6) sessionStorage.setItem(CACHE_KEY, json);
  } catch (e) {
    console.warn('Skipping cache:', e.name);
    // optional: clear older caches
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('people_') && k !== CACHE_KEY)
      .forEach(k => sessionStorage.removeItem(k));
  }
  return clean;
}

// Seeded RNG
function hashCode(str){
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a){
  return function(){
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffleWithSeed(arr, seedStr){
  const rng = mulberry32(hashCode(seedStr));
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Year helpers
function yearsInRange(years, start, end){
  return years.filter(y => {
    const n = toNum(y);
    return !isNaN(n) && n >= start && n <= end;
  });
}
function pickDailyYear(years){
  const SALT = "bornle-v1";
  const shuffled = shuffleWithSeed(years, SALT);
  const dayIndex = Math.floor((Date.now() - new Date("2025-01-01").getTime()) / 86400000);
  return shuffled[ dayIndex % shuffled.length ];
}
function pickRandomYear(subset){
  return subset[Math.floor(Math.random() * subset.length)];
}

// Name matching
function nameMatchesGuess(person, guess) {
  const fullName   = normalize(person.name);
  const nameTokens = fullName.split(' ').filter(Boolean);

  const aliasList = person.aliases
    ? person.aliases.split(',').map(a => normalize(a))
    : [];

  if (fullName === guess) return true;
  if (aliasList.includes(guess)) return true;

  const guessTokens = guess.split(' ').filter(Boolean);

  if (guessTokens.length === 1) {
    const g = guessTokens[0];
    if (g.length < 4) return false;
    return nameTokens.includes(g);
  }
  return guessTokens.every(t => nameTokens.includes(t));
}

// ---------- AUTOCOMPLETE ----------
function updateSuggestions(query) {
  const dl = document.getElementById('nameSuggestions');
  if (!dl) return;

  dl.innerHTML = "";
  if (!query || query.length < 3) return;

  const q = normalize(query);
  const seen = new Set();

  const matches = currentSuggestPool.filter(p => {
    const nameHit  = normalize(p.name).startsWith(q);
    const aliasHit = p.aliases
      ? p.aliases.split(',').some(a => normalize(a).startsWith(q))
      : false;
    return nameHit || aliasHit;
  }).slice(0, 15);

  matches.forEach(p => {
    if (seen.has(p.name)) return;
    seen.add(p.name);
    const opt = document.createElement('option');
    opt.value = p.name;
    dl.appendChild(opt);
  });
}

function initAutocomplete() {
  const input = document.getElementById('guessInput');
  if (!input) return;
  input.addEventListener('input', e => updateSuggestions(e.target.value));
}

// ---------- SHARE ----------
function shareResult() {
  const lines = guessHistory.map(entry => {
    if (entry.startsWith('✅'))      return '🟩';
    if (entry.includes('earlier'))   return '⬆️';
    if (entry.includes('later'))     return '⬇️';
    return '⬛';
  });

  const shareText =
    `Bornle ${todaysYear} • ${guessHistory.length}/${MAX_GUESSES}\n\n` +
    lines.join(' ') + `\n\n` +
    window.location.href;

  if (navigator.share) {
    navigator.share({ text: shareText }).catch(() => copyToClipboard(shareText));
  } else {
    copyToClipboard(shareText);
  }
}
function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
    .then(() => alert('Result copied to clipboard!'))
    .catch(() => prompt('Copy and paste this:', text));
}

// ---------- Wikipedia helpers ----------
function loadImageForPerson(person) {
  if (!person || !person.wikiurl) return;
  const title = person.wikiurl.split('/wiki/')[1];
  fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`)
    .then(r => r.json())
    .then(summary => {
      const img = document.getElementById('portrait');
      if (img && summary.thumbnail && summary.thumbnail.source) {
        img.src = summary.thumbnail.source;
        img.alt = person.name;
        img.style.display = 'block';
      }
    })
    .catch(() => {});
}

function revealPersonDetails(person) {
  if (!person || !person.wikiurl) return;
  const title = person.wikiurl.split('/wiki/')[1];
  fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`)
    .then(r => r.json())
    .then(summary => {
      const img = document.getElementById('portrait');
      if (img && summary.thumbnail && summary.thumbnail.source) {
        img.src = summary.thumbnail.source;
        img.alt = person.name;
        img.style.display = 'block';
      }
      const bio = document.getElementById('bio');
      if (bio) {
        if (summary.extract_html) {
          bio.innerHTML = summary.extract_html;
        } else if (summary.extract) {
          bio.textContent = summary.extract;
        }
        bio.style.display = 'block';
      }
    })
    .catch(() => {});
}

// ---------- Period buttons ----------
function buildPeriodButtons(availableYears) {
  const wrap = document.getElementById('periodButtons');
  if (!wrap) return;
  wrap.innerHTML = "";

  Object.entries(PERIODS).forEach(([key, def]) => {
    const subsetYears = yearsInRange(availableYears, def.start, def.end);
    if (!subsetYears.length) return; // hide if no data

    const btn = document.createElement('button');
    btn.className = 'period-btn';
    btn.dataset.mode = key;
    btn.textContent = def.label;
    btn.setAttribute('aria-pressed', 'false');
    wrap.appendChild(btn);
  });
}

function setActiveButton(mode) {
  document.querySelectorAll('.period-btn').forEach(b => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on);
  });
}

// ---------- Game logic ----------
function renderGuesses() {
  const container = document.getElementById('guesses');
  if (!container) return;
  container.innerHTML = "";
  guessHistory.forEach(entry => {
    const div = document.createElement('div');
    div.textContent = entry;
    container.appendChild(div);
  });
}

function checkGuess() {
  if (gameOver) return;

  const inputEl = document.getElementById('guessInput');
  const raw      = inputEl ? inputEl.value : '';
  const guess    = normalize(raw);
  const resultEl = document.getElementById('result');

  if (!todaysYear) {
    if (resultEl) resultEl.textContent = "⏳ Still loading…";
    return;
  }
  if (!guess) return;

  const personByName = peopleData.find(p => nameMatchesGuess(p, guess));
  const correct      = validAnswers.find(p => nameMatchesGuess(p, guess));

  if (guessHistory.length >= MAX_GUESSES) {
    if (resultEl) resultEl.textContent = "🚫 No more guesses.";
    return;
  }

  if (correct) {
    guessHistory.push(`✅ ${correct.name} — Correct!`);
    renderGuesses();
    if (resultEl)
      resultEl.textContent =
        `🎉 You got it in ${guessHistory.length} guess${guessHistory.length>1?'es':''}.`;

    revealPersonDetails(correct);
    showEl('shareButton', 'inline-block');

    gameOver = true;
    return;
  }

  if (personByName) {
    const theirYear = +personByName.birthyear;
    const diff      = Math.abs(theirYear - +todaysYear);
    const dir       = theirYear < todaysYear ? "earlier" : "later";
    guessHistory.push(
      `❌ ${personByName.name} — ${diff} year${diff!==1?'s':''} ${dir}.`
    );
  } else {
    guessHistory.push(`❌ "${raw}" — Not found.`);
  }

  renderGuesses();
  if (inputEl) inputEl.value = "";

  if (guessHistory.length >= MAX_GUESSES) {
    gameOver = true;
    const idx          = Math.floor(Math.random() * validAnswers.length);
    const revealPerson = validAnswers[idx];

    guessHistory.push(
      `🛑 Out of guesses. Here’s someone born in ${todaysYear}: ${revealPerson.name}.`
    );
    renderGuesses();
    revealPersonDetails(revealPerson);
    showEl('shareButton', 'inline-block');
    if (resultEl) resultEl.textContent = "";
    return;
  }

  if (resultEl)
    resultEl.textContent = `Guess ${guessHistory.length} / ${MAX_GUESSES}`;
}

// ---------- Init ----------
loadPeople()
  .then(data => {
    peopleData = data;

    // index by year
    byYear = peopleData.reduce((acc, p) => {
      (acc[p.birthyear] ||= []).push(p);
      return acc;
    }, {});
    allYears = Object.keys(byYear).sort((a,b)=> toNum(a) - toNum(b));

    // build buttons
    buildPeriodButtons(allYears);

    // default mode
    let currentMode = 'daily';

    function setPuzzleYear(modeKey){
      let chosenYear, subsetYears;
      if (modeKey === "daily" || !PERIODS[modeKey]) {
        chosenYear   = pickDailyYear(allYears);
        subsetYears  = allYears;
      } else {
        const { start, end } = PERIODS[modeKey];
        subsetYears  = yearsInRange(allYears, start, end);
        if (!subsetYears.length) {
          const resultEl = document.getElementById('result');
          if (resultEl) resultEl.textContent = "No data for that period.";
          return;
        }
        chosenYear = pickRandomYear(subsetYears);
      }

      todaysYear         = chosenYear;
      validAnswers       = byYear[todaysYear] || [];
      currentSuggestPool = (modeKey === "daily" || modeKey === "all")
        ? peopleData
        : subsetYears.flatMap(y => byYear[y]);

      const yearEl = document.getElementById('year');
      if (yearEl) yearEl.textContent = todaysYear;

      // reset UI/state
      guessHistory = [];
      gameOver = false;
      renderGuesses();
      const resultEl = document.getElementById('result');
      if (resultEl) resultEl.textContent = "";
      hideEl('portrait');
      hideEl('bio');
      hideEl('shareButton');
      const inputEl = document.getElementById('guessInput');
      if (inputEl) inputEl.value = "";
    }

    // init puzzle & UI
    setPuzzleYear(currentMode);
    setActiveButton(currentMode);

    const btnWrap = document.getElementById('periodButtons');
    if (btnWrap) {
      btnWrap.addEventListener('click', (e) => {
        const btn = e.target.closest('.period-btn');
        if (!btn) return;
        currentMode = btn.dataset.mode;
        setPuzzleYear(currentMode);
        setActiveButton(currentMode);
      });
    }

    // autocomplete AFTER pool set
    initAutocomplete();
  })
  .catch(err => {
    console.error("Data load failed:", err);
    const r = document.getElementById('result');
    if (r) r.textContent = "⚠️ Error loading data";
  });

window.addEventListener('DOMContentLoaded', () => {
  const inputEl = document.getElementById('guessInput');
  if (inputEl) {
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') checkGuess();
    });
  }

  const shareBtn = document.getElementById('shareButton');
  if (shareBtn) {
    shareBtn.style.display = 'none';
    shareBtn.addEventListener('click', shareResult);
  }
});
