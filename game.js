// CONFIG — your sheet details
const SHEET_ID   = '180LA6R_gcH-5VOgibikuolK7PiuzPtNE48sCLpvGuvc';
const SHEET_NAME = 'people';
const SHEET_URL  = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_NAME}`;

//globals
let peopleData = [];
let todaysYear = null;
let validAnswers = [];
let guessHistory = [];
const MAX_GUESSES = 5;
let gameOver = false;

// normalize: lowercase, strip punctuation/accents, partial guess, aliases
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatchesGuess(person, guess) {
  const main = normalize(person.name);

  // Split aliases column into an array (if present)
  const aliases = person.aliases
    ? person.aliases.split(',').map(a => normalize(a))
    : [];

  // Direct name or alias match
  if (main === guess || aliases.includes(guess)) return true;

  // Optional: allow guess contained in full name
  if (main.includes(guess)) return true;

  return false;
}

function renderGuesses() {
  const container = document.getElementById('guesses');
  container.innerHTML = "";
  guessHistory.forEach(entry => {
    const div = document.createElement('div');
    div.textContent = entry;
    container.appendChild(div);
  });
}

// 1️⃣ Fetch and prep
fetch(SHEET_URL)
  .then(r => r.json())
  .then(data => {
    // only keep rows with both fields
    peopleData = data.filter(r => r.name && r.birthyear);

    // get unique years
    const years = Array.from(new Set(peopleData.map(p => p.birthyear)));

    // deterministic “daily” pick
    const today   = new Date();
    const seed    = today.getFullYear() * 10000
                  + (today.getMonth()+1)  * 100
                  +  today.getDate();
    todaysYear    = years[ seed % years.length ];

    // all valid people for that year
    validAnswers = peopleData.filter(p => p.birthyear === todaysYear);

    // console log
    console.log('🎯 Today’s year:', todaysYear);
    console.log('🔢 All valid answers for today:', validAnswers);
    console.log('🔢 Count of valid answers:', validAnswers.length);

    // display the year
    document.getElementById('year').textContent = todaysYear;
  })
  .catch(err => {
    console.error("Data load failed:", err);
    document.getElementById('result').textContent = "⚠️ Error loading data";
  });

  // 2️⃣ Load images and bio
function loadImageForPerson(person) {
  if (!person || !person.wikiurl) return;  // lowercase key
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
    .catch(err => console.warn('No image found for', person.name));
}

function revealPersonDetails(person) {
  if (!person || !person.wikiurl) return;

  const title = person.wikiurl.split('/wiki/')[1];

  fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`)
    .then(r => r.json())
    .then(summary => {
      // show portrait
      if (summary.thumbnail && summary.thumbnail.source) {
        const img = document.getElementById('portrait');
        img.src = summary.thumbnail.source;
        img.alt = person.name;
        img.style.display = 'block';
      }
      // show extract
      if (summary.extract) {
        const bio = document.getElementById('bio');
        bio.textContent = summary.extract;
        bio.style.display = 'block';
      }
    })
    .catch(() => {
      console.warn("No summary for", person.name);
    });
}

// 3️⃣ Check the guesses
//name match with aliases
function nameMatchesGuess(person, guess) {
  const main = normalize(person.name);
  const aliases = person.aliases
    ? person.aliases.split(',').map(a => normalize(a))
    : [];
  if (main === guess || aliases.includes(guess)) return true;
  // Optional: allow partial match
  if (main.includes(guess)) return true;
  return false;
}

function checkGuess() {
  if (gameOver) return;

  const raw = document.getElementById('guessInput').value;
  const guess = normalize(raw);
  const resultEl = document.getElementById('result');

  if (!todaysYear) {
    resultEl.textContent = "⏳ Still loading…";
    return;
  }
  if (!guess) return;

  const personByName = peopleData.find(p => nameMatchesGuess(p, guess));
  const correct = validAnswers.find(p => nameMatchesGuess(p, guess));

  if (guessHistory.length >= MAX_GUESSES) {
    resultEl.textContent = "🚫 No more guesses.";
    return;
  }

  if (correct) {
    guessHistory.push(`✅ ${correct.name} — Correct!`);
    renderGuesses();
    resultEl.textContent = `🎉 You got it in ${guessHistory.length} guess${guessHistory.length > 1 ? 'es' : ''}.`;
    loadImageForPerson(correct);
    revealPersonDetails(correct);
    gameOver = true;
    return;
  }

  if (personByName) {
    const theirYear = parseInt(personByName.birthyear, 10);
    const targetYear = parseInt(todaysYear, 10);
    const diff = Math.abs(theirYear - targetYear);
    const direction = theirYear < targetYear ? "earlier" : "later";
    guessHistory.push(`❌ ${personByName.name} — ${diff} year${diff !== 1 ? 's' : ''} ${direction}.`);
  } else {
    guessHistory.push(`❌ "${raw}" — Not found.`);
  }

  renderGuesses();
  document.getElementById('guessInput').value = "";

  if (guessHistory.length >= MAX_GUESSES) {
  gameOver = true;

  // 1️⃣ Pick a random person from today's valid answers
  const randomIndex = Math.floor(Math.random() * validAnswers.length);
  const revealPerson = validAnswers[randomIndex];

  // 2️⃣ Show a single revealed name
  resultEl.textContent = 
    `🛑 Out of guesses. Here’s someone born in ${todaysYear}: ${revealPerson.name}.`;

  // 3️⃣ Pull and display their portrait & bio
  revealPersonDetails(revealPerson);
} else {
  resultEl.textContent = `Guess ${guessHistory.length} / ${MAX_GUESSES}`;
}


// 4️⃣ Enter button submission
window.addEventListener('DOMContentLoaded', () => {
  const inputEl = document.getElementById('guessInput');
  if (!inputEl) {
    console.warn('guessInput field not found in DOM.');
    return;
  }

  inputEl.addEventListener('keydown', (e) => {
    // e.key is 'Enter' on modern browsers
    if (e.key === 'Enter') {
      checkGuess();
    }
  });
});
