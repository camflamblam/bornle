// CONFIG — your sheet details
const SHEET_ID   = '180LA6R_gcH-5VOgibikuolK7PiuzPtNE48sCLpvGuvc';
const SHEET_NAME = 'people';
const SHEET_URL  = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_NAME}`;

// globals
let peopleData    = [];
let todaysYear    = null;
let validAnswers  = [];
let guessHistory  = [];
const MAX_GUESSES = 5;
let gameOver      = false;

// normalize: lowercase, strip punctuation/accents
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Stricter, token-based match
function nameMatchesGuess(person, guess) {
  const fullName   = normalize(person.name);
  const nameTokens = fullName.split(' ').filter(Boolean);

  const aliasList = person.aliases
    ? person.aliases.split(',').map(a => normalize(a))
    : [];

  // 1) Exact full name or alias
  if (fullName === guess) return true;
  if (aliasList.includes(guess)) return true;

  const guessTokens = guess.split(' ').filter(Boolean);

  // 2) Single-word guesses: must be >=4 chars AND match a whole token
  if (guessTokens.length === 1) {
    const g = guessTokens[0];
    if (g.length < 4) return false;
    return nameTokens.includes(g);
  }

  // 3) Multi-word guesses: every token must appear as a whole token
  return guessTokens.every(t => nameTokens.includes(t));
}

// ---------------- AUTOCOMPLETE (datalist) ----------------

function updateSuggestions(query) {
  const dl = document.getElementById('nameSuggestions');
  if (!dl) return;

  dl.innerHTML = "";
  if (!query || query.length < 3) return;

  const q = normalize(query);
  const seen = new Set();

  const matches = peopleData.filter(p => {
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
    opt.value = p.name;            // show canonical name
    dl.appendChild(opt);
  });
}

function initAutocomplete() {
  const input = document.getElementById('guessInput');
  if (!input) return;
  input.addEventListener('input', e => updateSuggestions(e.target.value));
}

// ---------------- SHARE HELPERS ----------------

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

// ---------------- FETCH & SETUP ----------------

fetch(SHEET_URL)
  .then(r => r.json())
  .then(data => {
    peopleData = data.filter(r => r.name && r.birthyear);

    const years = Array.from(new Set(peopleData.map(p => p.birthyear))).sort((a,b) => a - b);

    const today = new Date();
    const seed  = today.getFullYear() * 10000
                + (today.getMonth()+1)  * 100
                +  today.getDate();
    todaysYear   = years[ seed % years.length ];

    validAnswers = peopleData.filter(p => p.birthyear === todaysYear);

    document.getElementById('year').textContent = todaysYear;

    // init autocomplete *after* data is ready
    initAutocomplete();
  })
  .catch(err => {
    console.error("Data load failed:", err);
    document.getElementById('result').textContent = "⚠️ Error loading data";
  });

// ---------------- WIKIPEDIA HELPERS ----------------

function loadImageForPerson(person) {
  if (!person || !person.wikiurl) return;
  const title = person.wikiurl.split('/wiki/')[1];
  fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`)
    .then(r => r.json())
    .then(summary => {
      if (summary.thumbnail && summary.thumbnail.source) {
        const img = document.getElementById('portrait');
        img.src = summary.thumbnail.source;
        img.alt = person.name;
        img.style.display = 'block';
      }
    })
    .catch(() => {/* no portrait */});
}

function revealPersonDetails(person) {
  if (!person || !person.wikiurl) return;
  const title = person.wikiurl.split('/wiki/')[1];
  fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`)
    .then(r => r.json())
    .then(summary => {
      if (summary.thumbnail && summary.thumbnail.source) {
        const img = document.getElementById('portrait');
        img.src = summary.thumbnail.source;
        img.alt = person.name;
        img.style.display = 'block';
      }
      if (summary.extract_html) {
        const bio = document.getElementById('bio');
        bio.innerHTML = summary.extract_html;
        bio.style.display = 'block';
      } else if (summary.extract) {
        const bio = document.getElementById('bio');
        bio.textContent = summary.extract;
        bio.style.display = 'block';
      }
    })
    .catch(() => {/* no bio */});
}

// ---------------- GAME LOGIC ----------------

function renderGuesses() {
  const container = document.getElementById('guesses');
  container.innerHTML = "";
  guessHistory.forEach(entry => {
    const div = document.createElement('div');
    div.textContent = entry;
    container.appendChild(div);
  });
}

function checkGuess() {
  if (gameOver) return;

  const raw      = document.getElementById('guessInput').value;
  const guess    = normalize(raw);
  const resultEl = document.getElementById('result');

  if (!todaysYear) {
    resultEl.textContent = "⏳ Still loading…";
    return;
  }
  if (!guess) return;

  const personByName = peopleData.find(p => nameMatchesGuess(p, guess));
  const correct      = validAnswers.find(p => nameMatchesGuess(p, guess));

  if (guessHistory.length >= MAX_GUESSES) {
    resultEl.textContent = "🚫 No more guesses.";
    return;
  }

  if (correct) {
    guessHistory.push(`✅ ${correct.name} — Correct!`);
    renderGuesses();
    resultEl.textContent =
      `🎉 You got it in ${guessHistory.length} guess${guessHistory.length>1?'es':''}.`;

    revealPersonDetails(correct);
    document.getElementById('shareButton').style.display = 'inline-block';

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
  document.getElementById('guessInput').value = "";

  if (guessHistory.length >= MAX_GUESSES) {
    gameOver = true;

    const idx          = Math.floor(Math.random() * validAnswers.length);
    const revealPerson = validAnswers[idx];

    guessHistory.push(
      `🛑 Out of guesses. Here’s someone born in ${todaysYear}: ${revealPerson.name}.`
    );
    renderGuesses();
    revealPersonDetails(revealPerson);
    document.getElementById('shareButton').style.display = 'inline-block';
    resultEl.textContent = "";
    return;
  }

  resultEl.textContent = `Guess ${guessHistory.length} / ${MAX_GUESSES}`;
}

// ---------------- EVENTS ----------------

window.addEventListener('DOMContentLoaded', () => {
  const inputEl = document.getElementById('guessInput');
  if (inputEl) {
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') checkGuess();
    });
  }

  const shareBtn = document.getElementById('shareButton');
  if (shareBtn) {
    shareBtn.style.display = 'none'; // ensure hidden to start
    shareBtn.addEventListener('click', shareResult);
  }
});
