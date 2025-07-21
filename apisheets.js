let data = [];

async function fetchData() {
  const sheetURL = 'https://opensheet.elk.sh/180LA6R_gcH-5VOgibikuolK7PiuzPtNE48sCLpvGuvc/people';
  const res = await fetch(sheetURL);
  data = await res.json();
  loadRandomYear();
}

function normalize(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .replace(/[^\w\s]/g, "").toLowerCase().trim();
}

function loadRandomYear() {
  const years = [...new Set(data.map(p => p.year))];
  const currentYear = years[Math.floor(Math.random() * years.length)];
  document.getElementById("year").textContent = currentYear;
  document.getElementById("guessButton").onclick = () => checkGuess(currentYear);
}

function checkGuess(year) {
  const input = normalize(document.getElementById("guessInput").value);
  const match = data.find(p => p.year === year && normalize(p.name) === input);
  document.getElementById("result").textContent = match ? "✅ Correct!" : "❌ Try again.";
}

fetchData();
