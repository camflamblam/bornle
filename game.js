// CONFIG — your sheet details
const SHEET_ID   = '180LA6R_gcH-5VOgibikuolK7PiuzPtNE48sCLpvGuvc';
const SHEET_NAME = 'people';
const SHEET_URL  = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_NAME}`;

// normalize: lowercase, strip punctuation/accents
function normalize(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/gi, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

let peopleData = [];
let todaysYear = null;
let validAnswers = [];

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

// 2️⃣ Called on button click
function checkGuess() {
  const raw = document.getElementById('guessInput').value;
  const guess = normalize(raw);
  const resultEl = document.getElementById('result');

  if (!todaysYear) {
    return resultEl.textContent = "⏳ Still loading…";
  }

  // see if any valid answer matches
  const match = validAnswers.find(p => normalize(p.name) === guess);
  if (match) {
    resultEl.textContent = `✅ Correct! ${match.name} was born in ${match.birthyear}.`;
  } else {
    resultEl.textContent = `❌ Nope—try another name from ${todaysYear}!`;
  }
}

