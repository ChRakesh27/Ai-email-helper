/******************************
 *  INSERT EMAIL TEXT HANDLER
 ******************************/
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "insert_email_text") {
    const text = msg.text || "";
    const success = insertTextIntoCompose(text);

    sendResponse({
      status: success
        ? "Inserted into compose area."
        : "Could not find compose area; tried to paste into focused editable element.",
    });
  }

  if (msg.action === "get_incoming_email") {
    sendResponse({ emailText: getIncomingEmailText() });
  }
});

/******************************
 *  INSERTION LOGIC
 ******************************/
function insertTextIntoCompose(text) {
  // Try all email providers
  return (
    tryGmail(text) ||
    tryOutlook(text) ||
    tryYahoo(text) ||
    tryIframeEditors(text) ||
    tryFocusedEditable(text) ||
    tryAnyEditable(text)
  );
}

/*************
 *  GMAIL
 *************/
function tryGmail(text) {
  try {
    // Gmail compose body selectors
    let el =
      document.querySelector('div[aria-label="Message Body"]') ||
      document.querySelector('div[role="textbox"][aria-label*="Message"]') ||
      document.querySelector(".Am.Al.editable");

    if (el && isEditable(el)) {
      pasteText(el, text);
      return true;
    }
  } catch (e) {
    console.warn("Gmail insert error", e);
  }
  return false;
}

/*************
 *  OUTLOOK
 *************/
function tryOutlook(text) {
  try {
    let el =
      document.querySelector('div[aria-label*="Message body"]') ||
      document.querySelector('[contenteditable="true"][aria-label*="Message"]');

    if (el && isEditable(el)) {
      pasteText(el, text);
      return true;
    }
  } catch (e) {
    console.warn("Outlook insert error", e);
  }
  return false;
}

/*************
 *  YAHOO MAIL
 *************/
function tryYahoo(text) {
  try {
    let el =
      document.querySelector('[aria-label="Message body"]') ||
      document.querySelector('[contenteditable="true"].msg-body');

    if (el && isEditable(el)) {
      pasteText(el, text);
      return true;
    }
  } catch (e) {
    console.warn("Yahoo insert error", e);
  }
  return false;
}

/*******************
 *  ANY IFRAMES
 *******************/
function tryIframeEditors(text) {
  const iframes = Array.from(document.querySelectorAll("iframe"));

  for (const iframe of iframes) {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) continue;

      const body = doc.body;
      if (body && isEditable(body)) {
        pasteText(body, text);
        return true;
      }
    } catch (e) {
      /* cross-origin error ignored */
    }
  }
  return false;
}

/****************************
 *  FALLBACKS
 ****************************/
function tryFocusedEditable(text) {
  const el = document.activeElement;
  if (el && isEditable(el)) {
    pasteText(el, text);
    return true;
  }
  return false;
}

function tryAnyEditable(text) {
  const el = document.querySelector("[contenteditable='true']");
  if (el) {
    pasteText(el, text);
    return true;
  }
  return false;
}

/******************************
 *  EDITABLE CHECK + INSERTION
 ******************************/
function isEditable(el) {
  return (
    el &&
    (el.isContentEditable ||
      el.tagName === "TEXTAREA" ||
      (el.tagName === "INPUT" && ["text", "search", "email"].includes(el.type)))
  );
}

function pasteText(el, text) {
  el.focus();

  // For input/textarea
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.setRangeText(text, start, end, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  // For contenteditable
  try {
    const doc = el.ownerDocument;
    const sel = doc.getSelection();

    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();

      const frag = doc.createDocumentFragment();
      text.split("\n").forEach((line, i) => {
        frag.appendChild(doc.createTextNode(line));
        if (i < text.split("\n").length - 1) {
          frag.appendChild(doc.createElement("br"));
        }
      });

      range.insertNode(frag);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);

      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      el.innerHTML +=
        "<div>" + escapeHtml(text).replace(/\n/g, "<br>") + "</div>";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  } catch (e) {
    el.innerText += "\n" + text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}

/******************************
 *  EXTRACT INCOMING EMAIL TEXT
 ******************************/
function getIncomingEmailText() {
  // Gmail conversation body
  const gmailThread =
    document.querySelector(".a3s") ||
    document.querySelector(".gmail_quote") ||
    document.querySelector("div.a3s.aiL");
  if (gmailThread) return gmailThread.innerText.trim();

  // Outlook thread
  const outlookThread =
    document.querySelector('[aria-label="Message body"]') ||
    document.querySelector(".ms-MessageBody-content");
  if (outlookThread) return outlookThread.innerText.trim();

  // Yahoo
  const yahooThread =
    document.querySelector(".thread-body") ||
    document.querySelector(".mail-message-content");
  if (yahooThread) return yahooThread.innerText.trim();

  return "";
}
