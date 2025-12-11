// popup.js
const generateBtn = document.getElementById("generate");
const okBtn = document.getElementById("ok");
const closeBtn = document.getElementById("close");
const promptEl = document.getElementById("prompt");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");

// UI helpers
function setStatus(msg) {
  statusEl.textContent = msg;
}
function clearStatus() {
  statusEl.textContent = "";
}

// AI Wrapper
async function generateText(prompt) {
  setStatus("Generating...");
  try {
    const OPENAI_API_KEY = ""; // ← leave empty if using demo mode

    if (!OPENAI_API_KEY) {
      setStatus("Using built-in demo text (no API key).");
      return `Hello,\n\nThanks for your email. I have reviewed it and will get back to you shortly.\n\nBest regards,\n[Your Name]`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
      }),
    });

    const json = await response.json();
    return json?.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    clearStatus();
  }
}

// -----------------------------
// GENERATE BUTTON (Main Feature)
// -----------------------------
generateBtn.addEventListener("click", async () => {
  generateBtn.disabled = true;
  setStatus("Reading email...");

  // Get incoming email from content_script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let incomingEmail = "";

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "get_incoming_email",
    });
    incomingEmail = response?.emailText || "";
  } catch {
    incomingEmail = ""; // allow manual mode fallback
  }

  // User override prompt
  const userPrompt = promptEl.value.trim();
  let finalPrompt = "";

  // ---------------------
  // 1. AUTO REPLY MODE
  // ---------------------
  if (incomingEmail && !userPrompt) {
    finalPrompt = `
You are an AI email assistant.
Read the incoming email below and automatically understand its purpose:
(meeting, leave request, complaint, follow-up, purchase, issue, support, etc.)

Do NOT ask the user any questions.
Do NOT request clarification.
Write a complete professional reply that matches the intent.

Incoming Email:
${incomingEmail}
    `;
  }

  // -----------------------------------
  // 2. AUTO + USER CORRECTION MODE
  // -----------------------------------
  else if (incomingEmail && userPrompt) {
    finalPrompt = `
Incoming Email:
${incomingEmail}

User Instruction:
${userPrompt}

Write a corrected reply based on the instruction.
    `;
  }

  // ---------------------
  // 3. MANUAL MODE
  // ---------------------
  else if (!incomingEmail && userPrompt) {
    finalPrompt = userPrompt;
  }

  if (!finalPrompt.trim()) {
    setStatus("No input detected. Type a prompt or open an email.");
    generateBtn.disabled = false;
    return;
  }

  // Generate the AI response
  try {
    setStatus("Generating...");
    const aiText = await generateText(finalPrompt);
    resultEl.value = aiText;
    setStatus("Done!");
  } catch (err) {
    setStatus("Failed to generate.");
  }

  generateBtn.disabled = false;
});

// -----------------------------
// INSERT INTO EMAIL
// -----------------------------
okBtn.addEventListener("click", async () => {
  const text = resultEl.value;
  if (!text) {
    setStatus("Nothing to insert — generate content first.");
    return;
  }

  setStatus("Inserting into email...");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    setStatus("No active tab found.");
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    { action: "insert_email_text", text },
    (resp) => {
      if (chrome.runtime.lastError) {
        setStatus("Unable to insert into email.");
      } else {
        setStatus(resp?.status || "Inserted.");
      }
    }
  );
});

// -----------------------------
// CLOSE POPUP
// -----------------------------
closeBtn.addEventListener("click", () => window.close());
