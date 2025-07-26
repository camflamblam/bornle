// CONFIG — your sheet details
const SHEET_ID   = '180LA6R_gcH-5VOgibikuolK7PiuzPtNE48sCLpvGuvc';
const SHEET_NAME = 'people';
const SHEET_URL  = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_NAME}`;

// -------- Globals --------
let peopleData         = [];
let byYear             = {};
let allYears           = [];
let currentSuggestPool = [];
let periodStart     = null;
let periodEnd       = null;
let validAnswers    = [];
let currentPerson   = null;
let mode            = 'stage1';       // or 'stage2'
let stage1Guesses   = 0;
let stage2Guesses   = 0;
const MAX_STAGE1    = 5;              // name guesses
const MAX_STAGE2    = 3;              // year guesses
let guessHistory    = [];
let gameOver        = false;

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

// List of honorifics / titles to ignore
const TITLE_WORDS = [
  "sir","dr","mr","mrs","ms","lord","lady",
  "professor","prof","captain","king","queen",
  "prince","princess","duke","duchess",
  "saint","st"
];

/**
 * Remove any leading title words from a full name.
 */
function stripTitles(fullName) {
  const tokens = fullName.split(/\s+/);
  let i = 0;
  while (i < tokens.length - 1 && TITLE_WORDS.includes(tokens[i].toLowerCase())) {
    i++;
  }
  return tokens.slice(i).join(" ");
}

/**
 * Get the surname (last token) from a name, after stripping titles
 * and dropping any trailing Roman numerals.
 */
function getSurname(fullName) {
  let name = stripTitles(fullName);
  let parts = name.split(/\s+/);
  // drop trailing roman numeral (I, II, III, IV, etc.)
  if (/^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts[parts.length - 1].toLowerCase();
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
function nameMatchesGuess(person, rawGuess) {
  const guess = normalize(rawGuess);

  // 1. Strip titles and normalize the main name
  const cleanName = normalize(stripTitles(person.name));

  // 2. Build normalized aliases
  const aliasList = (person.aliases || "")
    .split(",")
    .map(a => normalize(a.trim()))
    .filter(Boolean);

  // 3. Exact match on full name or alias
  if (guess === cleanName || aliasList.includes(guess)) return true;

  // 4. Exact match on surname
  const surname = getSurname(person.name);
  if (guess === surname) return true;

  // (Optional) for two‑word guesses: both tokens must appear
  const guessTokens = guess.split(" ").filter(Boolean);
  if (guessTokens.length > 1 &&
      guessTokens.every(tok => cleanName.split(" ").includes(tok))) {
    return true;
  }

  return false;
}


// ---------- AUTOCOMPLETE ----------
function updateSuggestions(query) {
  const dl = document.getElementById('nameSuggestions');
  if (!dl) return;

  // clear out old options
  dl.innerHTML = "";

  // only start suggesting after 3 characters
  if (!query || query.length < 3) return;

  const q = normalize(query);
  const seen = new Set();

  // find at most 15 matches
  const matches = currentSuggestPool.filter(p => {
    const nameNorm = normalize(stripTitles(p.name));
    const surname  = getSurname(p.name);
    const aliasList = (p.aliases || "")
      .split(',')
      .map(a => normalize(a.trim()));

    // match if name, surname, or alias starts with q
    return (
      nameNorm.startsWith(q) ||
      surname.startsWith(q) ||
      aliasList.some(a => a.startsWith(q))
    );
  }).slice(0, 15);

  // build options showing only p.name
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

  const raw     = document.getElementById('guessInput').value;
  const guess   = normalize(raw);
  const result  = document.getElementById('result');
  if (!guess) return;

  // -------- STAGE 1: Name guesses --------
  if (mode === 'stage1') {
    stage1Guesses++;
    if (stage1Guesses > MAX_STAGE1) {
      result.textContent = `🚫 No more name guesses.`;
      // fall through to reveal?
      gameOver = true;
      return;
    }

    // find a matching person
    const p = peopleData.find(p => nameMatchesGuess(p, guess));
    if (!p) {
      guessHistory.push(`❌ "${raw}" — Not found.`);
    }
    else if (toNum(p.birthyear) < periodStart || toNum(p.birthyear) > periodEnd) {
      guessHistory.push(`❌ ${p.name} — born in ${p.birthyear}, outside range.`);
    }
    else {
      // correct person for the block!
      currentPerson = p;
      mode = 'stage2';
      result.textContent =
        `Nice! Now guess the exact year between ${periodStart} and ${periodEnd}.`;
      document.getElementById('guessInput').value = '';
      renderGuesses();
      return;
    }

    renderGuesses();
    result.textContent = `Name guess ${stage1Guesses} / ${MAX_STAGE1}`;
    document.getElementById('guessInput').value = '';
    return;
  }

  // -------- STAGE 2: Exact year guesses --------
  if (mode === 'stage2') {
    stage2Guesses++;
    const yearGuess = parseInt(guess, 10);
    if (isNaN(yearGuess)) {
      result.textContent = `❌ "${raw}" is not a year.`;
      return;
    }

    if (yearGuess === toNum(currentPerson.birthyear)) {
      result.textContent = `🎉 Exactly right—${yearGuess}!`;
      guessHistory.push(`✅ ${currentPerson.name} — ${yearGuess}`);
      renderGuesses();
      revealPersonDetails(currentPerson);
      showEl('shareButton', 'inline-block');
      gameOver = true;
    }
    else {
      if (stage2Guesses >= MAX_STAGE2) {
        result.textContent =
          `🛑 Out of year guesses! ${currentPerson.name} was born in ${currentPerson.birthyear}.`;
        guessHistory.push(`🛑 Revealed: ${currentPerson.name} — ${currentPerson.birthyear}`);
        renderGuesses();
        revealPersonDetails(currentPerson);
        showEl('shareButton', 'inline-block');
        gameOver = true;
      }
      else {
        const dir = yearGuess < currentPerson.birthyear ? 'earlier' : 'later';
        guessHistory.push(`❌ ${yearGuess} — ${dir}.`);
        renderGuesses();
        result.textContent = `Year guess ${stage2Guesses} / ${MAX_STAGE2}.`;
      }
    }
  }
}


// ---------- Init ----------
loadPeople()
  .then(data => {
    peopleData = data;

  // ── AUTOCOMPLETE SETUP ──
    currentSuggestPool = peopleData.slice();  // clone full list
    initAutocomplete();                        // wire input listener
    // ────────────────────────  

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
      // --- choose a 50‑year span once on load ---

const yearsNum = allYears.map(y => toNum(y)).sort((a,b)=>a-b);
const minY = yearsNum[0];
const maxY = yearsNum[yearsNum.length-1];

// compute a daily seed so everyone gets the same block each day
const daySeed = Math.floor((Date.now() - new Date("2025-01-01").getTime())/86400000);
const spanCount = (maxY - minY + 1) - 50;
const offset = ((daySeed % (spanCount+1)) + (spanCount+1)) % (spanCount+1);

periodStart = minY + offset;
periodEnd   = periodStart + 49;

// build the pool for stage‑1 (all people in that block)
validAnswers = peopleData
  .filter(p => {
    const y = toNum(p.birthyear);
    return y >= periodStart && y <= periodEnd;
  });

// show the prompt
document.getElementById('yearPrompt').textContent =
  `Guess someone born between ${periodStart} and ${periodEnd}`;

// reset state
mode          = 'stage1';
stage1Guesses = 0;
stage2Guesses = 0;
guessHistory.length = 0;
gameOver      = false;
renderGuesses();
hideEl('portrait');
hideEl('bio');
hideEl('shareButton');
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
