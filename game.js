console.log("🐞 game.js loaded");
// CONFIG — replace with your actual sheet ID + tab name
const SHEET_ID   = '180LA6R_gcH-5VOgibikuolK7PiuzPtNE48sCLpvGuvc';
const SHEET_NAME = 'people';   // <-- make sure this matches exactly!
const SHEET_URL  = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_NAME}`;

let peopleData = [];
let todaysPerson, todaysYear;

// Normalize function
function normalize(str) {
  return str.toLowerCase()
            .replace(/[^a-z0-9\s]/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
}

// Load data and pick today’s person
fetch(SHEET_URL)
  .then(r => r.json())
  .then(data => {
    console.log('✅ Sheet data:', data);
    peopleData = data.filter(r => r.name && r.birthyear);

    const now   = new Date();
    const seed  = now.getFullYear()*10000 + (now.getMonth()+1)*100 + now.getDate();
    const idx   = seed % peopleData.length;
    todaysPerson = peopleData[idx];
    todaysYear   = todaysPerson.birthyear;
    
    console.log('🎯 Today’s entry:', todaysPerson);

    // Show the year
    document.getElementById('year').textContent = todaysYear;
  })
  .catch(err => {
    console.error('❌ Data load error:', err);
    document.getElementById('result').textContent = 'Error loading data';
  });

// Called when you click “Submit”
function checkGuess() {
  const raw = document.getElementById('guessInput').value;
  const guess = normalize(raw);
  console.log('💬 User guessed:', guess);

  if (!todaysPerson) {
    return document.getElementById('result').textContent = 'Still loading…';
  }

  const correct = normalize(todaysPerson.name);
  console.log('✔️ Correct normalized:', correct);

  if (guess === correct) {
    document.getElementById('result').textContent =
      `✅ Correct! It was ${todaysPerson.name}.`;
  } else {
    document.getElementById('result').textContent = '❌ Not quite. Try again.';
  }
}
