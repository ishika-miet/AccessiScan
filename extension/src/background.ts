chrome.runtime.onInstalled.addListener(() => {
  console.log("AccessiGen Extension Installed.");
});

// We can handle background message passing here if needed.
// For V1, the popup makes direct API calls, and content script handles DOM extraction.
