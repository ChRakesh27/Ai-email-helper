/******************************
 *  INSERT EMAIL TEXT HANDLER
 ******************************/
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "open_reply_and_insert") {
    openReplyThenInsert(msg.text).then((ok) => {
      sendResponse({ status: ok ? "Inserted." : "Failed to insert." });
    });
    return true; // keep channel open for async
  }

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
    // Gmail compose body selectors (new UI)
    let el =
      document.querySelector(
        'div[aria-label="Message Body"][g_editable="true"]'
      ) ||
      document.querySelector('div[aria-label="Message body"]') ||
      document.querySelector('div[role="textbox"][g_editable="true"]') ||
      document.querySelector(".editable.LW-avf");

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
      document.querySelector('[aria-label="Message body"]') ||
      document.querySelector('div[contenteditable="true"][role="textbox"]');

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
      document.querySelector('[role="textbox"][contenteditable="true"]') ||
      document.querySelector(".msg-body");

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
    } catch (e) {}
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
  const el = Array.from(
    document.querySelectorAll("[contenteditable='true']")
  ).find((x) => x.offsetParent !== null);
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

  // Input / Textarea
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.setRangeText(text, start, end, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  // Contenteditable
  try {
    const doc = el.ownerDocument;
    const sel = doc.getSelection();

    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = doc.createDocumentFragment();
      text.split("\n").forEach((line, i) => {
        frag.appendChild(doc.createTextNode(line));
        if (i < text.split("\n").length - 1)
          frag.appendChild(doc.createElement("br"));
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
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}

/******************************
 *  EXTRACT INCOMING EMAIL TEXT
 ******************************/
function getIncomingEmailText() {
  // Gmail
  const gmailThread =
    document.querySelector(".a3s") ||
    document.querySelector(".gmail_quote") ||
    document.querySelector("div.a3s.aiL");
  if (gmailThread) return gmailThread.innerText.trim();

  // Outlook
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

/******************************
 *  OPEN REPLY AND INSERT
 ******************************/
/******************************
 *  OPEN REPLY OR COMPOSE
 ******************************/
/******************************
 *  OPEN REPLY OR COMPOSE THEN INSERT
 ******************************/
async function openReplyThenInsert(text) {
  // STEP 1 — Check if a compose box or reply editor is ALREADY OPEN
  const existingEditor = findComposeEditor();
  if (existingEditor) {
    // Editor already available → directly insert
    return insertTextIntoCompose(text);
  }

  // STEP 2 — If no editor, decide between Reply or Compose

  // GMAIL
  if (isGmail()) {
    const replyBtn =
      document.querySelector('span.ams.bkH[role="link"]') ||
      Array.from(document.querySelectorAll('span[role="link"]')).find(
        (el) => el.textContent.trim().toLowerCase() === "reply"
      );

    if (replyBtn) {
      // Email is open → click Reply
      replyBtn.click();
      await waitForComposeBox();
      return insertTextIntoCompose(text);
    } else {
      // No email open → open Compose window
      const composeBtn = document.querySelector("div.T-I.T-I-KE.L3");
      if (composeBtn) {
        composeBtn.click();
        await waitForComposeBox();
        return insertTextIntoCompose(text);
      }
    }
  }

  // OUTLOOK
  if (isOutlook()) {
    const replyBtn =
      document.querySelector('button[aria-label^="Reply"]') ||
      document.querySelector('[title="Reply"]');

    if (replyBtn) {
      replyBtn.click();
      await waitForComposeBox();
      return insertTextIntoCompose(text);
    } else {
      const composeBtn =
        document.querySelector('button[aria-label="New message"]') ||
        document.querySelector('[title="New message"]');
      if (composeBtn) {
        composeBtn.click();
        await waitForComposeBox();
        return insertTextIntoCompose(text);
      }
    }
  }

  // YAHOO
  if (isYahoo()) {
    const replyBtn =
      document.querySelector('[data-test-id="reply-button"]') ||
      document.querySelector('button[title="Reply"]');

    if (replyBtn) {
      replyBtn.click();
      await waitForComposeBox();
      return insertTextIntoCompose(text);
    } else {
      const composeBtn = document.querySelector(
        '[data-test-id="compose-button"]'
      );
      if (composeBtn) {
        composeBtn.click();
        await waitForComposeBox();
        return insertTextIntoCompose(text);
      }
    }
  }

  return false;
}

/******************************
 *  DETECT EXISTING COMPOSE/REPLY EDITOR
 ******************************/
function findComposeEditor() {
  // Gmail
  let gmail =
    document.querySelector('div[aria-label="Message Body"]') ||
    document.querySelector(".Am.Al.editable.LW-avf") ||
    document.querySelector('div[role="textbox"][g_editable="true"]');

  if (gmail && isEditable(gmail)) return gmail;

  // Outlook
  let outlook =
    document.querySelector('[aria-label="Message body"]') ||
    document.querySelector('div[contenteditable="true"][role="textbox"]');

  if (outlook && isEditable(outlook)) return outlook;

  // Yahoo
  let yahoo =
    document.querySelector('[role="textbox"][contenteditable="true"]') ||
    document.querySelector(".msg-body");

  if (yahoo && isEditable(yahoo)) return yahoo;

  return null;
}

/******************************
 *  HELPER FUNCTIONS
 ******************************/
function isGmail() {
  return location.host.includes("mail.google.com");
}
function isOutlook() {
  return location.host.includes("outlook") || location.host.includes("office.");
}
function isYahoo() {
  return location.host.includes("mail.yahoo");
}

// Wait until compose box appears
function waitForComposeBox(timeout = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      // Gmail compose box
      let gmailBox =
        document.querySelector(
          'div[aria-label="Message Body"][g_editable="true"]'
        ) ||
        document.querySelector('div[aria-label="Message body"]') ||
        document.querySelector('div[role="textbox"][g_editable="true"]') ||
        document.querySelector(".editable.LW-avf");

      // Outlook
      let outlookBox =
        document.querySelector('[aria-label="Message body"]') ||
        document.querySelector('div[contenteditable="true"][role="textbox"]');

      // Yahoo
      let yahooBox =
        document.querySelector('[role="textbox"][contenteditable="true"]') ||
        document.querySelector(".msg-body");

      let el = gmailBox || outlookBox || yahooBox;

      // fallback: any visible contenteditable
      if (!el) {
        el = Array.from(
          document.querySelectorAll('[contenteditable="true"]')
        ).find((x) => x.offsetParent !== null);
      }

      if (el && isEditable(el)) return resolve(true);
      if (Date.now() - start > timeout) return resolve(false);
      requestAnimationFrame(check);
    };
    check();
  });
}
