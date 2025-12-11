// popup.js
const generateBtn = document.getElementById("generate");
const okBtn = document.getElementById("ok");
const closeBtn = document.getElementById("close");
const promptEl = document.getElementById("prompt");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");

// Simple UI helpers
function setStatus(msg) {
  statusEl.textContent = msg;
}
function clearStatus() {
  statusEl.textContent = "";
}

async function generateText(prompt) {
  setStatus("Generating...");
  try {
    const OPENAI_API_KEY = "";
    if (!OPENAI_API_KEY) {
      setStatus("Using built-in demo text (no API key).");
      return `Hello,\n\nThanks for your message. I enjoyed our discussion last week and wanted to follow up about next steps. Please let me know a good time to connect.\n\nBest regards,\n[Your Name]`;
    }

    // Example OpenAI call (not executed unless you insert a key)
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // put desired model
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
      }),
    });
    const json = await resp.json();
    // adapt to returned structure
    const text = json?.choices?.[0]?.message?.content ?? "";
    return text;
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    clearStatus();
  }
}

generateBtn.addEventListener("click", async () => {
  const prompt = promptEl.value.trim();
  if (!prompt) {
    setStatus("Please write a prompt for the AI.");
    return;
  }
  try {
    generateBtn.disabled = true;
    const text = await generateText(prompt);
    resultEl.value = text;
  } catch (e) {
    setStatus("Failed to generate. See console.");
  } finally {
    generateBtn.disabled = false;
  }
});

okBtn.addEventListener("click", async () => {
  const text = resultEl.value;
  if (!text) {
    setStatus("Nothing to insert — generate content first.");
    return;
  }
  // Send message to the active tab to insert the text
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
        setStatus(
          "Unable to send message to tab. Make sure you are on a supported email compose page."
        );
      } else {
        setStatus(resp?.status || "Inserted.");
      }
    }
  );
});

closeBtn.addEventListener("click", () => {
  window.close();
});
