// content_script.js
// Listens for messages from popup and attempts to insert content into the compose box
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
});

// Tries a few heuristics: Gmail, Outlook.com, Yahoo Mail, fallback to activeElement
function insertTextIntoCompose(text) {
  // 1) Gmail: contenteditable message body
  try {
    // Gmail can use div[aria-label="Message Body"] or div[role="textbox"][aria-label="Message Body"]
    let el = document.querySelector('div[aria-label="Message Body"]');
    if (!el) {
      el = document.querySelector('div[role="textbox"][aria-label*="Message"]');
    }
    if (el && isEditable(el)) {
      pasteTextToElement(el, text);
      return true;
    }
  } catch (e) {
    console.warn("Gmail insert error", e);
  }

  // 2) Outlook Web (classic / new)
  try {
    // Outlook uses div[aria-label="Message body"] or iframe-based editors
    let el =
      document.querySelector('div[aria-label*="Message body"]') ||
      document.querySelector('[contenteditable="true"][aria-label*="Message"]');
    if (el && isEditable(el)) {
      pasteTextToElement(el, text);
      return true;
    }

    // Outlook sometimes uses an iframe
    const iframes = Array.from(document.querySelectorAll("iframe"));
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const body = doc.body;
        if (body && isEditable(body)) {
          pasteTextToElement(body, text, iframe.contentWindow);
          return true;
        }
      } catch (e) {
        /* cross-origin may block */
      }
    }
  } catch (e) {
    console.warn("Outlook insert error", e);
  }

  // 3) Yahoo Mail
  try {
    let el =
      document.querySelector('[aria-label="Message body"]') ||
      document.querySelector('[contenteditable="true"].msg-body');
    if (el && isEditable(el)) {
      pasteTextToElement(el, text);
      return true;
    }
  } catch (e) {
    console.warn("Yahoo insert error", e);
  }

  // 4) fallback: insert into focused element if it's editable
  const active = document.activeElement;
  if (
    active &&
    (active.tagName === "TEXTAREA" ||
      active.tagName === "INPUT" ||
      isEditable(active))
  ) {
    pasteTextToElement(active, text);
    return true;
  }

  // 5) As a last resort, try to find any contenteditable in the page
  const anyEditable = document.querySelector('[contenteditable="true"]');
  if (anyEditable) {
    pasteTextToElement(anyEditable, text);
    return true;
  }

  return false;
}

function isEditable(el) {
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === "TEXTAREA" ||
    (el.tagName === "INPUT" &&
      (el.type === "text" || el.type === "search" || el.type === "email"))
  );
}

function pasteTextToElement(el, text, win = window) {
  // If it's a textarea or input, set value and dispatch events
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    el.focus();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.setRangeText(text, start, end, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  // If contenteditable, try to insert at caret or append
  el.focus();
  // Use document.execCommand fallback for contenteditable insertion
  try {
    const doc = el.ownerDocument || document;
    const sel = doc.getSelection();
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const nodes = text.split("\n").map((line, i) => {
        const node = doc.createTextNode(line);
        const frag = doc.createDocumentFragment();
        frag.appendChild(node);
        if (i < text.split("\n").length - 1) {
          frag.appendChild(doc.createElement("br"));
        }
        return frag;
      });
      const frag = doc.createDocumentFragment();
      text.split("\n").forEach((line, i) => {
        frag.appendChild(doc.createTextNode(line));
        if (i < text.split("\n").length - 1)
          frag.appendChild(doc.createElement("br"));
      });
      range.insertNode(frag);
      // move cursor after inserted content
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      // Dispatch input events so webapps detect change
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      // fallback append
      el.innerHTML +=
        "<div>" + escapeHtml(text).replace(/\n/g, "<br>") + "</div>";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } catch (e) {
    // final fallback: set innerText
    el.innerText += "\n" + text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}
