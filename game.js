// CONFIG — Replace with your actual Google Sheet ID and sheet name
const SHEET_ID = '180LA6R_gcH-5VOgibikuolK7PiuzPtNE48sCLpvGuvc';
const SHEET_NAME = 'Sheet1';
const SHEET_URL = `https://opensheet.elk.sh/180LA6R_gcH-5VOgibikuolK7PiuzPtNE48sCLpvGuvc/people`;

// Utility: Normalize input by removing special characters and lowercasing
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, '') // remove punctuation
    .replace(/\s+/g, ' ')         // collapse extra spaces
    .trim();
}

// Step 1: Load data from Google Sheets
let peopleData = [];
let todaysPerson = null;
let todaysYear = null;

fetch(SHEET_URL)
  .then(response => response.json())
  .then(data => {
    peopleData = data;

    // Step 2: Generate today's challenge
    const today = new Date();
    const dateSeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const filtered = peopleData.filter(row => row.birthyear && row.name);

    if (filtered.length === 0) {
      document.getElementById('result').textContent = "❌ No data found.";
      return;
    }

    const index = dateSeed % filtered.length;
    todaysPerson = filtered[index];
    todaysYear = todaysPerson.birthyear;

    // Show the challenge year
    const yearDisplay = document.createElement('p');
    yearDisplay.innerHTML = `<strong>Guess someone born in <u>${todaysYear}</u>:</strong>`;
    document.body.insertBefore(yearDisplay, document.getElementById('guessInput'));
  })
  .catch(err => {
    console.error("Failed to load data:", err);
    document.getElementById('result').textContent = "⚠️ Error loading data.";
  });

// Step 3: Compare guess
function checkGuess() {
  const input = document.getElementById('guessInput').value;
  const result = document.getElementById('result');

  if (!todaysPerson) {
    result.textContent = "⏳ Still loading data...";
    return;
  }

  const guess = normalize(input);
  const correct = normalize(todaysPerson.name);

  if (guess === correct) {
    result.textContent = `🎉 Correct! The person was ${todaysPerson.name}.`;
  } else {
    result.textContent = `❌ Not quite. Try again!`;
  }
}

